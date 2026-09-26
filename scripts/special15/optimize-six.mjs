import assert from 'node:assert/strict';
import { normalizeRows, featuresAt } from './model.mjs';
import { DirectSixRanker, TARGET_CONFIGS, sixStats } from './target-six.mjs';
import { selectExclusions } from './exclusion.mjs';
import { consensusSelection } from './expanded-models.mjs';

export const OPTIMIZATION_CONFIGS = [
  { id: 'original', type: 'online' },
  { id: 'ema-0.95', type: 'ema', beta: 0.95 },
  { id: 'ema-0.99', type: 'ema', beta: 0.99 },
  { id: 'window-100', type: 'window', window: 100, refitEvery: 20 },
  { id: 'temporal-consensus', type: 'consensus', members: ['original', 'ema-0.95', 'window-100'] },
];
const RANK_CONFIG = TARGET_CONFIGS.find((c) => c.id === 'direct-rank-c0.2');

export class AveragedRanker {
  constructor(beta) {
    this.beta = beta;
    this.raw = new DirectSixRanker(RANK_CONFIG);
    this.average = Array(12).fill(0);
  }
  update(x, actual) {
    this.raw.update(x, actual);
    this.average = this.average.map((w, j) => this.beta * w + (1 - this.beta) * this.raw.weights[j]);
  }
  scores(x) {
    return x.map((row) => row.reduce((sum, value, j) => sum + value * this.average[j], 0));
  }
}

export function optimizationProtocol() {
  return { year: 2026, warmup: 30, trainEnd: 146, validationEnd: 206, evaluationEnd: 266,
    rankConfig: RANK_CONFIG, configs: OPTIMIZATION_CONFIGS,
    selection: 'Maximize validation successes (147–206), then the minimum success count across three chronological 20-draw validation blocks. Exact ties prefer incumbent, then declared order. Never select on 207–266.',
    schedule: 'All forecasts occur before observing their own result. EMA updates after each SGD update. Window model is initialized/retrained before periods 147,167,187,207,227,247,267 using only the last 100 available labeled draws.',
    future: 'Freeze design through period 266; any available 267+ draws are separately reported and cannot trigger reselection.',
    caveat: 'The validation and historical evaluation outcomes have already been examined in earlier experiments. This is a bounded exploratory optimization, not an independent validation.' };
}

function blockMinimum(details) {
  const counts = [0, 20, 40].map((start) => details.slice(start, start + 20).filter((d) => d.success6).length);
  return { counts, minimum: Math.min(...counts) };
}

function summarize(details) {
  const stats = sixStats(details);
  let replacements = 0;
  for (let i = 1; i < details.length; i++) replacements += 6 - details[i].excluded6.filter((n) => details[i - 1].excluded6.includes(n)).length;
  return { ...stats, meanReplacements: details.length > 1 ? replacements / (details.length - 1) : null };
}

export function runOptimization(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  const p = optimizationProtocol();
  assert.ok(rows.length >= p.evaluationEnd, '固定优化协议至少需要2026年第266期');
  assert.equal(rows[0].No, 1);
  const features = Array.from({ length: rows.length + 1 }, (_, t) => t >= p.warmup ? featuresAt(rows, t).candidates : null);
  const runners = p.configs.map((config) => ({ config, model: null,
    validation: [], evaluation: [], forward: [], fitWindows: [], next: null }));
  function fit(r, t) {
    const begin = r.config.type === 'window' ? Math.max(p.warmup, t - r.config.window) : p.warmup;
    r.model = r.config.type === 'ema' ? new AveragedRanker(r.config.beta) : new DirectSixRanker(RANK_CONFIG);
    for (let epoch = 0; epoch < RANK_CONFIG.epochs; epoch++) {
      for (let i = begin; i < t; i++) r.model.update(features[i], rows[i].n7);
    }
    r.fitWindows.push({ forecastPeriod: t + 1, firstLabel: begin + 1, lastLabel: t, labels: t - begin });
  }
  for (const r of runners) if (r.config.type !== 'consensus') fit(r, p.trainEnd);
  let selectedId;
  for (let t = p.trainEnd; t <= rows.length; t++) {
    if (t === p.validationEnd) {
      selectedId = [...runners].sort((a, b) =>
        b.validation.filter((d) => d.success6).length - a.validation.filter((d) => d.success6).length ||
        blockMinimum(b.validation).minimum - blockMinimum(a.validation).minimum)[0].config.id;
    }
    const scores = new Map();
    for (const r of runners) {
      if (r.config.type === 'consensus') continue;
      if (r.config.type === 'window' && t > p.trainEnd && (t - p.trainEnd) % r.config.refitEvery === 0) fit(r, t);
      scores.set(r.config.id, r.model.scores(features[t]));
    }
    for (const r of runners) {
      const picks = r.config.type === 'consensus'
        ? consensusSelection(r.config.members.map((id) => scores.get(id)))
        : selectExclusions(scores.get(r.config.id));
      const excluded6 = picks.excluded10.slice(0, 6);
      if (t === rows.length) r.next = { after: { year: 2026, No: rows.at(-1).No },
        target: { year: 2026, No: rows.at(-1).No + 1 }, pool20: picks.pool20, excluded6,
        ascending6: [...excluded6].sort((a, b) => a - b) };
      else {
        const split = t < p.validationEnd ? 'validation' : t < p.evaluationEnd ? 'evaluation' : 'forward';
        r[split].push({ year: 2026, No: rows[t].No, actual: rows[t].n7,
          pool20: picks.pool20, excluded6, success6: !excluded6.includes(rows[t].n7) });
      }
    }
    if (t < rows.length) for (const r of runners) if (r.model) r.model.update(features[t], rows[t].n7);
  }
  return { protocol: p, audit, selectedId, results: runners.map((r) => ({ id: r.config.id, config: r.config,
    validation: summarize(r.validation), validationBlocks: blockMinimum(r.validation),
    evaluation: summarize(r.evaluation), forward: summarize(r.forward),
    recent: [20, 50, 60].map((requested) => ({ requested, ...summarize(r.evaluation.slice(-requested)) })),
    fitWindows: r.fitWindows, next: r.next,
    details: { validation: r.validation, evaluation: r.evaluation, forward: r.forward } })) };
}
