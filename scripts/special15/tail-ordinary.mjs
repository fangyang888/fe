import assert from 'node:assert/strict';
import { normalizeRows } from './model.mjs';
import { BASE, selectTwo, tailStats } from './tail-two.mjs';
import { CONFIGS as GAP_CONFIGS, GapModel, choose } from './tail-optimize.mjs';

export const CONFIGS = [
  { id: 'incumbent-gap20', label: '原优化遗漏模型', type: 'incumbent' },
  { id: 'normal-1-shared', label: '上一期普通号尾数：共享统计', window: 1, shared: true, prior: 20 },
  { id: 'normal-1-specific', label: '上一期普通号尾数：逐尾统计', window: 1, shared: false, prior: 20 },
  { id: 'normal-3-shared', label: '近三期普通号尾数：共享统计', window: 3, shared: true, prior: 20 },
];
export class OrdinaryTailModel {
  constructor(config) {
    this.config = config;
    this.history = [];
    this.groups = Array.from({ length: config.shared ? 6 : 30 }, () => ({ exposures: 0, hits: 0 }));
  }
  counts() {
    const counts = Array(10).fill(0);
    for (const row of this.history.slice(-this.config.window)) for (let p = 1; p <= 6; p++) counts[row[`n${p}`] % 10]++;
    return counts;
  }
  group(tail, counts) {
    const count = counts[tail];
    const b = this.config.window === 1 ? Math.min(count, 2) : count <= 1 ? 0 : count <= 3 ? 1 : 2;
    return (this.config.shared ? Number(tail !== 0) : tail) * 3 + b;
  }
  update(row) {
    if (this.history.length >= this.config.window) {
      const counts = this.counts(), current = this.groups.map(() => ({ candidates: 0, hits: 0 }));
      for (let tail = 0; tail < 10; tail++) {
        const g = current[this.group(tail, counts)];
        g.candidates++;
        g.hits += Number(tail === row.n7 % 10);
      }
      current.forEach((g, i) => {
        if (g.candidates) { this.groups[i].exposures++; this.groups[i].hits += g.hits / g.candidates; }
      });
    }
    this.history.push(row);
  }
  scores() {
    const counts = this.counts();
    const raw = BASE.map((p, tail) => {
      const g = this.groups[this.group(tail, counts)];
      return (g.hits + this.config.prior * p) / (g.exposures + this.config.prior);
    });
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((p) => p / sum);
  }
}
export function runOrdinary(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  assert.equal(rows.length, 266);
  assert.equal(rows[0].No, 1);
  const results = CONFIGS.map((config) => {
    const model = config.type === 'incumbent' ? new GapModel(GAP_CONFIGS.find((c) => c.id === 'gap-prior20')) : new OrdinaryTailModel(config);
    const details = { validation: [], evaluation: [] };
    let next;
    for (let t = 0; t <= rows.length; t++) {
      if (t >= 146) {
        const scores = model.scores(), excludedTails = selectTwo(scores);
        if (t === rows.length) next = { after: 266, target: 267, excludedTails, scores };
        else details[t < 206 ? 'validation' : 'evaluation'].push({ No: rows[t].No, actual: rows[t].n7,
          actualTail: rows[t].n7 % 10, excludedTails, success: !excludedTails.includes(rows[t].n7 % 10) });
      }
      if (t < rows.length) model.update(rows[t]);
    }
    const validationBlocks = [0, 20, 40].map((s) => tailStats(details.validation.slice(s, s + 20)).successes);
    return { id: config.id, label: config.label, config, details, next, validationBlocks, validationMinimum: Math.min(...validationBlocks),
      validation: tailStats(details.validation), evaluation: tailStats(details.evaluation) };
  });
  return { audit, results, selectedId: choose(results) };
}
