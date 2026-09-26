import { runTails, BASE } from './tail-two.mjs';
import { runOptimization, choose } from './tail-optimize.mjs';

export const DESIGN = {
  simulations: 2000, seed: 2026092601, permutationSeed: 2026092602,
  lags: [1, 2, 3, 4, 5], driftBoundaries: [0, 88, 177, 266],
  modelFamily: 'Original8 tail rules plus5 gap variants (excluding duplicate original gap and consensus).13 fixed designs; this does not reproduce the full historical adaptive research process.',
  selection: 'Validation successes, then worst20-draw validation block, then declaration order. Evaluation207–266 untouched by selection.',
};
export function rng(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}
export function shuffle(values, random) {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function syntheticRows(random, count = 266) {
  return Array.from({ length: count }, (_, i) => {
    const special = 1 + Math.floor(random() * 49);
    const ordinary = Array.from({ length: 7 }, (_, j) => j + 1).filter((n) => n !== special).slice(0, 6);
    return { year: 2026, No: i + 1, ...Object.fromEntries(ordinary.map((n, j) => [`n${j + 1}`, n])), n7: special };
  });
}
export function frequencyStatistic(tails) {
  const counts = Array(10).fill(0);
  for (const tail of tails) counts[tail]++;
  return { counts, statistic: counts.reduce((sum, c, t) => sum + (c - tails.length * BASE[t]) ** 2 / (tails.length * BASE[t]), 0) };
}
export function serialStatistic(tails) {
  const lags = DESIGN.lags.map((lag) => {
    const n = tails.length - lag, joint = Array.from({ length: 10 }, () => Array(10).fill(0));
    const from = Array(10).fill(0), to = Array(10).fill(0);
    for (let i = lag; i < tails.length; i++) { joint[tails[i - lag]][tails[i]]++; from[tails[i - lag]]++; to[tails[i]]++; }
    let mutualInformation = 0;
    for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (joint[a][b]) {
      const c = joint[a][b]; mutualInformation += c / n * Math.log(c * n / (from[a] * to[b]));
    }
    return { lag, mutualInformation };
  });
  return { lags, statistic: Math.max(...lags.map((r) => r.mutualInformation)) };
}
export function driftStatistic(tails) {
  const total = frequencyStatistic(tails).counts;
  const blocks = DESIGN.driftBoundaries.slice(0, -1).map((start, i) => {
    const values = tails.slice(start, DESIGN.driftBoundaries[i + 1]);
    return { start: start + 1, end: DESIGN.driftBoundaries[i + 1], count: values.length, counts: frequencyStatistic(values).counts };
  });
  let statistic = 0;
  for (const block of blocks) for (let tail = 0; tail < 10; tail++) {
    const expected = block.count * total[tail] / tails.length;
    if (expected) statistic += (block.counts[tail] - expected) ** 2 / expected;
  }
  return { blocks, statistic };
}
export function evaluateFamily(rows) {
  const base = runTails(rows).results;
  const extra = runOptimization(rows).results.filter((r) => !['incumbent-consensus', 'gap-original'].includes(r.id));
  const results = [...base, ...extra].map((r) => {
    const blocks = [0, 20, 40].map((s) => r.details.validation.slice(s, s + 20).filter((d) => d.success).length);
    return { id: r.id, label: r.label, validation: { successes: r.validation.successes }, validationBlocks: blocks,
      validationMinimum: Math.min(...blocks), evaluation: r.evaluation.successes,
      evaluationBlocks: [0, 20, 40].map((s) => r.details.evaluation.slice(s, s + 20).filter((d) => d.success).length) };
  });
  const selectedId = choose(results);
  return { results, selectedId, selectedSuccesses: results.find((r) => r.id === selectedId).evaluation,
    incumbentSuccesses: results.find((r) => r.id === 'gap-prior20').evaluation,
    bestEvaluationSuccesses: Math.max(...results.map((r) => r.evaluation)) };
}
export function mcTail(values, threshold) {
  const exceedances = values.filter((v) => v >= threshold - 1e-12).length;
  return { exceedances, simulations: values.length, probability: (exceedances + 1) / (values.length + 1) };
}
export function quantiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries([0.05, 0.5, 0.95, 0.99].map((q) => [q, sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]]));
}
