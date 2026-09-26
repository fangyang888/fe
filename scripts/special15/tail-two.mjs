import assert from 'node:assert/strict';
import { normalizeRows, metrics } from './model.mjs';

export const BASE = Array.from({ length: 10 }, (_, t) => (t === 0 ? 4 : 5) / 49);
export const CONFIGS = [
  { id: 'fixed-01', label: '固定杀0、1尾（对照）', type: 'fixed' },
  { id: 'cold-30', label: '近30期冷尾', type: 'frequency', window: 30 },
  { id: 'cold-100', label: '近100期冷尾', type: 'frequency', window: 100 },
  { id: 'hot-30', label: '近30期热尾反向排除', type: 'hot', window: 30 },
  { id: 'longest-gap', label: '遗漏最长的两个尾', type: 'gap' },
  { id: 'gap-conditional', label: '遗漏分组条件统计', type: 'hazard' },
  { id: 'transition', label: '上一期特别码尾数转移', type: 'transition' },
  { id: 'consensus', label: '冷尾、遗漏、转移综合', type: 'consensus' },
];
const normalize = (scores) => { const sum = scores.reduce((a, b) => a + b, 0); return scores.map((s) => s / sum); };
const bin = (gap) => gap < 0 ? 6 : gap === 0 ? 0 : gap === 1 ? 1 : gap <= 3 ? 2 : gap <= 7 ? 3 : gap <= 15 ? 4 : 5;
const tie = (tail) => { let x = Math.imul(tail + 1, 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return (x ^ (x >>> 16)) >>> 0; };
export const selectTwo = (scores) => scores.map((score, tail) => ({ score, tail }))
  .sort((a, b) => a.score - b.score || tie(a.tail) - tie(b.tail)).slice(0, 2).map((r) => r.tail);
export const nullSuccess = (tails) => 1 - tails.reduce((sum, t) => sum + BASE[t], 0);

export class TailModel {
  constructor() {
    this.history = [];
    this.last = Array(10).fill(-1);
    this.edges = Array.from({ length: 10 }, () => Array(10).fill(0));
    this.exposures = Array.from({ length: 10 }, () => Array(7).fill(0));
    this.hits = Array.from({ length: 10 }, () => Array(7).fill(0));
  }
  gap(tail) { return this.last[tail] < 0 ? -1 : this.history.length - 1 - this.last[tail]; }
  update(row) {
    const actual = row.n7 % 10, t = this.history.length;
    // Both transition and gap labels belong to the state before this draw.
    if (t) this.edges[this.history[t - 1]][actual]++;
    for (let tail = 0; tail < 10; tail++) {
      const b = bin(this.gap(tail));
      this.exposures[tail][b]++;
      this.hits[tail][b] += Number(actual === tail);
    }
    this.history.push(actual);
    this.last[actual] = t;
  }
  frequency(window) {
    const past = this.history.slice(-window), counts = BASE.map((p) => 49 * p);
    for (const tail of past) counts[tail]++;
    return counts.map((c) => c / (past.length + 49));
  }
  scores(config) {
    switch (config.type) {
      case 'fixed': return BASE.map((_, t) => t < 2 ? 0 : 1);
      case 'frequency': return this.frequency(config.window);
      case 'hot': return this.frequency(config.window).map((p) => -p);
      case 'gap': return this.last.map((_, tail) => -(this.gap(tail) < 0 ? this.history.length : this.gap(tail)));
      case 'hazard': return normalize(BASE.map((p, tail) => {
        const b = bin(this.gap(tail));
        return (this.hits[tail][b] + 50 * p) / (this.exposures[tail][b] + 50);
      }));
      case 'transition': {
        if (!this.history.length) return [...BASE];
        const counts = this.edges[this.history.at(-1)], total = counts.reduce((a, b) => a + b, 0);
        const prior = this.frequency(100);
        return counts.map((c, tail) => (c + 20 * prior[tail]) / (total + 20));
      }
      case 'consensus': {
        const members = [this.frequency(100), this.scores({ type: 'hazard' }), this.scores({ type: 'transition' })];
        return BASE.map((_, tail) => members.reduce((s, m) => s + m[tail], 0) / members.length);
      }
      default: throw new Error('Unknown model');
    }
  }
}

export function tailStats(details) {
  const { pAgainstRandom: unused, hits: successes, longestMiss: longestFailure, ...m } = metrics(details.map((d) => ({ hit: d.success })));
  const baseline = details.reduce((s, d) => s + nullSuccess(d.excludedTails), 0) / details.length;
  return { ...m, successes, failures: m.count - successes, longestFailure, baseline, excess: m.rate - baseline };
}

export function runTails(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  assert.equal(rows.length, 266);
  assert.equal(rows[0].No, 1);
  const model = new TailModel();
  const results = CONFIGS.map((config) => ({ ...config, details: { validation: [], evaluation: [] } }));
  for (let t = 0; t <= rows.length; t++) {
    if (t >= 146) for (const r of results) {
      const scores = model.scores(r);
      assert.ok(scores.every(Number.isFinite));
      const excludedTails = selectTwo(scores);
      if (t === rows.length) r.next = { after: 266, target: 267, excludedTails, scores,
        excludedNumbers: Array.from({ length: 49 }, (_, i) => i + 1).filter((n) => excludedTails.includes(n % 10)) };
      else r.details[t < 206 ? 'validation' : 'evaluation'].push({ No: rows[t].No, actual: rows[t].n7,
        actualTail: rows[t].n7 % 10, excludedTails, success: !excludedTails.includes(rows[t].n7 % 10) });
    }
    if (t < rows.length) model.update(rows[t]);
  }
  for (const r of results) for (const split of ['validation', 'evaluation']) r[split] = tailStats(r.details[split]);
  const selectedId = [...results].sort((a, b) => b.validation.successes - a.validation.successes)[0].id;
  return { audit, selectedId, results };
}
