import assert from 'node:assert/strict';
import { normalizeRows } from './model.mjs';
import { BASE, tailStats, selectTwo } from './tail-two.mjs';
import { CONFIGS as GAP_CONFIGS, GapModel, choose } from './tail-optimize.mjs';

export const PAIRS = Array.from({ length: 10 }, (_, a) => Array.from({ length: 9 - a }, (_, j) => [a, a + j + 1])).flat();
export const CONFIGS = [
  { id: 'incumbent-gap20', label: '原优化遗漏模型', type: 'incumbent', cells: 70 },
  { id: 'pair-frequency', label: '两尾组合频率', type: 'frequency', window: 100, cells: 10 },
  { id: 'pair-binary', label: '组合遗漏二分组', type: 'shared', bounds: [0, Infinity], prior: 50, cells: 6 },
  { id: 'pair-coarse', label: '组合遗漏三分组', type: 'shared', bounds: [0, 3, Infinity], prior: 50, cells: 8 },
  { id: 'pair-coarse-frequency', label: '组合三分组＋频率', type: 'blend', bounds: [0, 3, Infinity], prior: 50, window: 100, cells: 18 },
];
export const pairBase = (pair) => BASE[pair[0]] + BASE[pair[1]];
const tie = (pair) => { let x = Math.imul(pair[0] * 10 + pair[1] + 1, 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return (x ^ (x >>> 16)) >>> 0; };
export function selectPair(scores) {
  assert.equal(scores.length, 45);
  assert.ok(scores.every(Number.isFinite));
  const index = PAIRS.map((pair, i) => ({ i, score: scores[i], tie: tie(pair) }))
    .sort((a, b) => a.score - b.score || a.tie - b.tie)[0].i;
  return { excludedTails: [...PAIRS[index]], pairIndex: index, score: scores[index] };
}

export class PairModel {
  constructor(config) {
    this.config = config;
    this.history = [];
    this.last = Array(10).fill(-1);
    this.bounds = config.bounds || [0, 3, Infinity];
    this.groups = Array.from({ length: 2 * (this.bounds.length + 1) }, () => ({ draws: 0, hits: 0 }));
  }
  gap(pair) {
    const latest = Math.max(this.last[pair[0]], this.last[pair[1]]);
    return latest < 0 ? -1 : this.history.length - 1 - latest;
  }
  group(pair) {
    const gap = this.gap(pair), bin = gap < 0 ? this.bounds.length : this.bounds.findIndex((b) => gap <= b);
    return (pair.includes(0) ? 0 : this.bounds.length + 1) + bin;
  }
  update(row) {
    const actual = row.n7 % 10;
    const current = this.groups.map(() => ({ pairs: 0, hits: 0 }));
    // Group memberships come from the PRE-draw state. Within each group,
    // average the overlapping pair outcomes so one draw has total weight one.
    for (const pair of PAIRS) {
      const g = current[this.group(pair)];
      g.pairs++;
      g.hits += Number(pair.includes(actual));
    }
    current.forEach((g, i) => {
      if (g.pairs) { this.groups[i].draws++; this.groups[i].hits += g.hits / g.pairs; }
    });
    this.last[actual] = this.history.length;
    this.history.push(actual);
  }
  marginal(window = 100) {
    const past = this.history.slice(-window), counts = BASE.map((p) => p * 49);
    for (const tail of past) counts[tail]++;
    return counts.map((n) => n / (past.length + 49));
  }
  scores() {
    const marginal = this.marginal(this.config.window);
    return PAIRS.map((pair) => {
      const frequency = marginal[pair[0]] + marginal[pair[1]];
      if (this.config.type === 'frequency') return frequency;
      const g = this.groups[this.group(pair)];
      const shared = (g.hits + this.config.prior * pairBase(pair)) / (g.draws + this.config.prior);
      return this.config.type === 'blend' ? 0.5 * shared + 0.5 * frequency : shared;
    });
  }
}

export function runPairs(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  assert.equal(rows.length, 266);
  assert.equal(rows[0].No, 1);
  const results = CONFIGS.map((config) => {
    const model = config.type === 'incumbent' ? new GapModel(GAP_CONFIGS.find((c) => c.id === 'gap-prior20')) : new PairModel(config);
    const details = { validation: [], evaluation: [] };
    let next;
    for (let t = 0; t <= rows.length; t++) {
      if (t >= 146) {
        const raw = model.scores();
        const pairScores = config.type === 'incumbent' ? PAIRS.map(([a, b]) => raw[a] + raw[b]) : raw;
        // Preserve the incumbent's original tie rule and tail order exactly.
        const prediction = config.type === 'incumbent' ? incumbentPrediction(raw, pairScores) : selectPair(pairScores);
        if (t === rows.length) next = { after: 266, target: 267, ...prediction,
          rankedPairs: PAIRS.map((pair, i) => ({ pair, score: pairScores[i] })).sort((a, b) => a.score - b.score || tie(a.pair) - tie(b.pair)) };
        else details[t < 206 ? 'validation' : 'evaluation'].push({ No: rows[t].No, actual: rows[t].n7,
          actualTail: rows[t].n7 % 10, excludedTails: prediction.excludedTails, success: !prediction.excludedTails.includes(rows[t].n7 % 10) });
      }
      if (t < rows.length) model.update(rows[t]);
    }
    const validationBlocks = [0, 20, 40].map((s) => tailStats(details.validation.slice(s, s + 20)).successes);
    return { id: config.id, label: config.label, config, details, next,
      validation: tailStats(details.validation), evaluation: tailStats(details.evaluation),
      validationBlocks, validationMinimum: Math.min(...validationBlocks), recent20: tailStats(details.evaluation.slice(-20)) };
  });
  return { audit, results, selectedId: choose(results) };
}

function incumbentPrediction(raw, scores) {
  const excludedTails = selectTwo(raw), sorted = [...excludedTails].sort((a, b) => a - b);
  const pairIndex = PAIRS.findIndex(([a, b]) => a === sorted[0] && b === sorted[1]);
  return { excludedTails, pairIndex, score: scores[pairIndex] };
}
