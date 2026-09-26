import assert from 'node:assert/strict';
import { normalizeRows, metrics } from './model.mjs';
export const COLORS = ['红', '蓝', '绿'];
export const NUMBERS = [
  [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
  [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
  [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49],
];
export const BASE = NUMBERS.map((a) => a.length / 49);
export const colorOf = (n) => NUMBERS.findIndex((a) => a.includes(n));
export const CONFIGS = [
  { id: 'fixed-red-blue', label: '固定红＋蓝', type: 'fixed', pair: [0, 1] },
  { id: 'fixed-red-green', label: '固定红＋绿', type: 'fixed', pair: [0, 2] },
  { id: 'fixed-blue-green', label: '固定蓝＋绿', type: 'fixed', pair: [1, 2] },
  { id: 'frequency-30', label: '近30期颜色频率', type: 'frequency', window: 30 },
  { id: 'frequency-100', label: '近100期颜色频率', type: 'frequency', window: 100 },
  { id: 'transition', label: '上一期颜色转移', type: 'transition' },
  { id: 'gap', label: '颜色遗漏条件', type: 'gap' },
  { id: 'ordinary', label: '上一期普通号颜色分布', type: 'ordinary' },
  { id: 'consensus', label: '频率、遗漏、转移综合', type: 'consensus' },
];
export const selectColors = (scores) => scores.map((score, color) => ({ score, color }))
  .sort((a, b) => b.score - a.score || a.color - b.color).slice(0, 2).map((r) => r.color);
const normalized = (scores) => { const total = scores.reduce((a, b) => a + b, 0); return scores.map((s) => s / total); };

export function auditMetadata(input) {
  const map = new Map(), rows = input.filter((r) => Number(r.year) === 2026);
  let checked = 0;
  for (const r of rows) {
    assert.equal(r.numberInfos?.length, 7, `第${r.No}期缺少颜色信息`);
    r.numberInfos.forEach((info, i) => {
      const n = Number(r[`n${i + 1}`]);
      assert.equal(Number(info.number), n);
      assert.equal(info.color, COLORS[colorOf(n)], `第${r.No}期号码${n}颜色冲突`);
      map.set(n, info.color); checked++;
    });
  }
  assert.equal(map.size, 49);
  return { rows: rows.length, checked, uniqueNumbers: map.size, conflicts: 0, counts: NUMBERS.map((a) => a.length) };
}

export class ColorModel {
  constructor() {
    this.history = [];
    this.last = Array(3).fill(-1);
    this.edges = Array.from({ length: 3 }, () => Array(3).fill(0));
    this.gapE = Array.from({ length: 3 }, () => Array(5).fill(0));
    this.gapH = this.gapE.map((r) => [...r]);
    this.normalE = Array.from({ length: 3 }, () => Array(3).fill(0));
    this.normalH = this.normalE.map((r) => [...r]);
    this.previousNormal = null;
  }
  gap(c) {
    if (this.last[c] < 0) return 4;
    const gap = this.history.length - 1 - this.last[c];
    return gap === 0 ? 0 : gap === 1 ? 1 : gap <= 3 ? 2 : 3;
  }
  update(row) {
    const actual = colorOf(row.n7);
    assert.ok(actual >= 0);
    if (this.history.length) this.edges[this.history.at(-1)][actual]++;
    for (let c = 0; c < 3; c++) {
      const b = this.gap(c);
      this.gapE[c][b]++;
      this.gapH[c][b] += Number(c === actual);
      if (this.previousNormal) {
        const b = this.previousNormal[c] <= 1 ? 0 : this.previousNormal[c] === 2 ? 1 : 2;
        this.normalE[c][b]++;
        this.normalH[c][b] += Number(c === actual);
      }
    }
    this.previousNormal = Array(3).fill(0);
    for (let p = 1; p <= 6; p++) this.previousNormal[colorOf(row[`n${p}`])]++;
    this.last[actual] = this.history.length;
    this.history.push(actual);
  }
  frequency(window) {
    const past = this.history.slice(-window), counts = BASE.map((p) => 49 * p);
    for (const c of past) counts[c]++;
    return counts.map((n) => n / (past.length + 49));
  }
  scores(config) {
    switch (config.type) {
      case 'fixed': return COLORS.map((_, c) => config.pair.includes(c) ? 0.5 : 0);
      case 'frequency': return this.frequency(config.window);
      case 'transition': {
        if (!this.history.length) return [...BASE];
        const counts = this.edges[this.history.at(-1)], prior = this.frequency(100), total = counts.reduce((a, b) => a + b, 0);
        return counts.map((n, c) => (n + 20 * prior[c]) / (total + 20));
      }
      case 'gap': return normalized(BASE.map((p, c) => {
        const b = this.gap(c); return (this.gapH[c][b] + 20 * p) / (this.gapE[c][b] + 20);
      }));
      case 'ordinary': return normalized(BASE.map((p, c) => {
        if (!this.previousNormal) return p;
        const b = this.previousNormal[c] <= 1 ? 0 : this.previousNormal[c] === 2 ? 1 : 2;
        return (this.normalH[c][b] + 20 * p) / (this.normalE[c][b] + 20);
      }));
      case 'consensus': {
        const members = [this.frequency(100), this.scores({ type: 'gap' }), this.scores({ type: 'transition' })];
        return COLORS.map((_, c) => members.reduce((s, m) => s + m[c], 0) / members.length);
      }
      default: throw new Error('Unknown model');
    }
  }
}

export function colorStats(details) {
  const { hits: successes, pAgainstRandom: ignored, longestMiss: longestFailure, ...m } = metrics(details.map((d) => ({ hit: d.success })));
  const baseline = details.reduce((s, d) => s + d.selectedColors.reduce((v, c) => v + BASE[c], 0), 0) / details.length;
  return { ...m, successes, failures: m.count - successes, longestFailure, baseline, excess: m.rate - baseline };
}
export function runColors(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  assert.equal(rows.length, 266); assert.equal(rows[0].No, 1);
  const model = new ColorModel(), results = CONFIGS.map((config) => ({ id: config.id, label: config.label, config, details: { validation: [], evaluation: [] } }));
  for (let t = 0; t <= rows.length; t++) {
    if (t >= 146) for (const r of results) {
      const scores = model.scores(r.config), selectedColors = selectColors(scores);
      if (t === rows.length) r.next = { after: 266, target: 267, selectedColors, names: selectedColors.map((c) => COLORS[c]), scores };
      else r.details[t < 206 ? 'validation' : 'evaluation'].push({ No: rows[t].No, actual: rows[t].n7,
        actualColor: colorOf(rows[t].n7), selectedColors, success: selectedColors.includes(colorOf(rows[t].n7)) });
    }
    if (t < rows.length) model.update(rows[t]);
  }
  for (const r of results) {
    for (const split of ['validation', 'evaluation']) r[split] = colorStats(r.details[split]);
    r.blocks = [0, 20, 40].map((s) => r.details.validation.slice(s, s + 20).filter((d) => d.success).length);
    r.minimum = Math.min(...r.blocks);
  }
  const selectedId = [...results].sort((a, b) => b.validation.successes - a.validation.successes || b.minimum - a.minimum)[0].id;
  return { audit, selectedId, results };
}
