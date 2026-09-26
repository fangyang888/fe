import assert from 'node:assert/strict';
import { normalizeRows } from './model.mjs';
import { BASE, TailModel, selectTwo, tailStats } from './tail-two.mjs';

const standard = [0, 1, 3, 7, 15, Infinity];
export const CONFIGS = [
  { id: 'incumbent-consensus', label: '原综合规则', type: 'control' },
  { id: 'gap-original', label: '原遗漏条件', prior: 50, decay: 1, bounds: standard },
  { id: 'gap-prior20', label: '减弱平滑', prior: 20, decay: 1, bounds: standard },
  { id: 'gap-prior100', label: '增强平滑', prior: 100, decay: 1, bounds: standard },
  { id: 'gap-coarse', label: '合并短遗漏分组', prior: 50, decay: 1, bounds: [1, 3, 7, 15, Infinity] },
  { id: 'gap-fine', label: '细分遗漏分组', prior: 50, decay: 1, bounds: [0, 1, 2, 3, 5, 9, 15, Infinity] },
  { id: 'gap-recent', label: '近期加权遗漏', prior: 50, decay: 0.98, bounds: standard },
];

export class GapModel {
  constructor(config) {
    this.config = config;
    this.time = 0;
    this.last = Array(10).fill(-1);
    this.exposures = Array.from({ length: 10 }, () => Array(config.bounds.length + 1).fill(0));
    this.hits = this.exposures.map((r) => [...r]);
  }
  bin(tail) {
    if (this.last[tail] < 0) return this.config.bounds.length;
    const gap = this.time - 1 - this.last[tail];
    return this.config.bounds.findIndex((upper) => gap <= upper);
  }
  update(row) {
    for (let tail = 0; tail < 10; tail++) {
      for (let b = 0; b < this.exposures[tail].length; b++) {
        this.exposures[tail][b] *= this.config.decay;
        this.hits[tail][b] *= this.config.decay;
      }
      const b = this.bin(tail);
      this.exposures[tail][b]++;
      this.hits[tail][b] += Number(row.n7 % 10 === tail);
    }
    this.last[row.n7 % 10] = this.time++;
  }
  scores() {
    const scores = BASE.map((p, tail) => {
      const b = this.bin(tail);
      return (this.hits[tail][b] + this.config.prior * p) / (this.exposures[tail][b] + this.config.prior);
    });
    const total = scores.reduce((a, b) => a + b, 0);
    return scores.map((p) => p / total);
  }
}

export function choose(results) {
  // Fixed declaration order is the final tie-break. No evaluation outcomes here.
  return [...results].sort((a, b) => b.validation.successes - a.validation.successes ||
    b.validationMinimum - a.validationMinimum)[0].id;
}

export function runOptimization(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  assert.equal(rows[0].No, 1);
  assert.equal(rows.length, 266);
  const results = CONFIGS.map((config) => {
    const model = config.type === 'control' ? new TailModel() : new GapModel(config);
    const details = { validation: [], evaluation: [] };
    let next;
    for (let t = 0; t <= rows.length; t++) {
      if (t >= 146) {
        const scores = config.type === 'control' ? model.scores({ type: 'consensus' }) : model.scores();
        const excludedTails = selectTwo(scores);
        if (t === rows.length) next = { after: 266, target: 267, excludedTails, scores };
        else details[t < 206 ? 'validation' : 'evaluation'].push({ No: rows[t].No, actual: rows[t].n7,
          actualTail: rows[t].n7 % 10, excludedTails, success: !excludedTails.includes(rows[t].n7 % 10) });
      }
      if (t < rows.length) model.update(rows[t]);
    }
    const validationBlocks = [0, 20, 40].map((start) => tailStats(details.validation.slice(start, start + 20)).successes);
    return { id: config.id, label: config.label, config, details, next, validationBlocks,
      validationMinimum: Math.min(...validationBlocks), validation: tailStats(details.validation), evaluation: tailStats(details.evaluation),
      recent20: tailStats(details.evaluation.slice(-20)) };
  });
  return { audit, results, selectedId: choose(results) };
}
