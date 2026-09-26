import assert from 'node:assert/strict';
import { normalizeRows } from './model.mjs';
import { TailModel, selectTwo, tailStats } from './tail-two.mjs';
import { CONFIGS as GAP_CONFIGS, GapModel, choose } from './tail-optimize.mjs';

export const EXPERTS = [GAP_CONFIGS[2], ...GAP_CONFIGS.filter((c) => c.id !== GAP_CONFIGS[2].id)];
export const CONFIGS = [
  { id: 'incumbent-gap20', label: '原优化遗漏模型', type: 'fixed' },
  { id: 'best-30', label: '按过去30期动态选规则', type: 'best', window: 30 },
  { id: 'best-60', label: '按过去60期动态选规则', type: 'best', window: 60 },
  { id: 'weighted-slow', label: '缓慢调整规则权重', type: 'weighted', window: 100, eta: 0.15 },
  { id: 'weighted-fast', label: '快速调整规则权重', type: 'weighted', window: 100, eta: 0.5 },
];

export function combine(scores, losses, config) {
  const totals = losses.map((history) => history.slice(-config.window).reduce((a, b) => a + b, 0));
  let weights;
  if (config.type === 'fixed') weights = scores.map((_, i) => Number(i === 0));
  else if (config.type === 'best') weights = scores.map((_, i) => Number(i === totals.indexOf(Math.min(...totals))));
  else {
    const min = Math.min(...totals);
    const raw = totals.map((sum) => Math.exp(-config.eta * (sum - min))), total = raw.reduce((a, b) => a + b, 0);
    weights = raw.map((w) => w / total);
  }
  const combined = scores[0].map((_, tail) => scores.reduce((sum, s, i) => sum + weights[i] * s[tail], 0));
  return { scores: combined, weights, excludedTails: selectTwo(combined) };
}

export function runAdaptive(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  assert.equal(rows.length, 266);
  assert.equal(rows[0].No, 1);
  const experts = EXPERTS.map((config) => ({ config, model: config.type === 'control' ? new TailModel() : new GapModel(config), losses: [] }));
  const results = CONFIGS.map((config) => ({ id: config.id, label: config.label, config, details: { validation: [], evaluation: [] } }));
  for (let t = 0; t <= rows.length; t++) {
    const scores = experts.map((e) => e.config.type === 'control' ? e.model.scores({ type: 'consensus' }) : e.model.scores());
    if (t >= 146) for (const result of results) {
      const forecast = combine(scores, experts.map((e) => e.losses), result.config);
      if (t === rows.length) result.next = { after: 266, target: 267, ...forecast };
      else result.details[t < 206 ? 'validation' : 'evaluation'].push({ No: rows[t].No, actual: rows[t].n7,
        actualTail: rows[t].n7 % 10, excludedTails: forecast.excludedTails, weights: forecast.weights,
        success: !forecast.excludedTails.includes(rows[t].n7 % 10) });
    }
    if (t < rows.length) experts.forEach((e, i) => {
      // Expert performance is scored on its own pre-outcome forecast, starting
      // after 30 warmup draws. Current labels never enter current meta weights.
      if (t >= 30) e.losses.push(Number(selectTwo(scores[i]).includes(rows[t].n7 % 10)));
      e.model.update(rows[t]);
    });
  }
  for (const result of results) {
    for (const split of ['validation', 'evaluation']) result[split] = tailStats(result.details[split]);
    result.validationBlocks = [0, 20, 40].map((start) => tailStats(result.details.validation.slice(start, start + 20)).successes);
    result.validationMinimum = Math.min(...result.validationBlocks);
    result.recent20 = tailStats(result.details.evaluation.slice(-20));
  }
  return { audit, selectedId: choose(results), results };
}
