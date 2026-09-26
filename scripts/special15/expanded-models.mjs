import assert from 'node:assert/strict';
import { CONFIGS, normalizeRows, featuresAt, frequencyScores, LogisticModel, knnScores } from './model.mjs';
import { selectExclusions, exclusionMetrics } from './exclusion.mjs';

export const EXTRA_CONFIGS = [
  { id: 'markov-shrink-50', family: 'markov', prior: 50 },
  { id: 'gap-hazard-100', family: 'hazard', prior: 100, pooledPrior: 98 },
  { id: 'boosted-stumps-32', family: 'boosting', rounds: 32, learningRate: 0.15,
    l2: 10, minLeaf: 100, refitEvery: 20, window: 365,
    thresholds: [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75] },
  { id: 'consensus-two-stage', family: 'ensemble', members: ['frequency-100',
    'logistic-l2-0.01', 'knn-30', 'markov-shrink-50', 'gap-hazard-100', 'boosted-stumps-32'] },
];

export function normalizeTwoYears(input) {
  const a = normalizeRows(input, 2025), b = normalizeRows(input, 2026);
  assert.equal(a.rows.length, 365, '本协议要求2025年365期完整数据');
  assert.equal(a.rows[0].No, 1);
  assert.equal(b.rows[0].No, 1, '2026年必须从第1期开始');
  return { rows: [...a.rows, ...b.rows], audit: { years: [a.audit, b.audit],
    ignoredOtherYears: input.filter((r) => ![2025, 2026].includes(Number(r.year))).length } };
}

export function makeExpandedProtocol(rows) {
  assert.equal(rows.findIndex((r) => r.year === 2026), 365);
  return {
    version: 1, warmup: 30, trainEnd: 245, validationEnd: 365,
    training: '2025/001–245（前30期仅特征预热；215期逻辑回归标签）',
    validation: '2025/246–365（120期）',
    evaluation: `2026/001–${rows.at(-1).No}（${rows.length - 365}期）`,
    configs: [...CONFIGS, ...EXTRA_CONFIGS],
    selection: 'Highest 2025 validation exclude-10 group success count. Ties follow configuration order. No 2026-based reselection.',
    trainingPolicy: 'Initial logistic training uses 40 passes, then one update per revealed draw. KNN/Markov/hazard update after each outcome. Boosted stumps refit every 20 draws using at most 365 past labeled draws.',
    ensemblePolicy: 'Lowest 20 by mean percentile rank across six predeclared models, then lowest 10 within that pool by maximum (most risky) member percentile rank.',
    otherPolicy: 'Single-model methods use bottom 20 then bottom 10 of the same score. Exactly 10 exclusions every draw; no skipped draws.',
    limitations: '2026 draws were already examined during previous experiments. This is exploratory year-forward evaluation, not a never-inspected holdout. All parameters are fixed before this run; future draws are still required.',
  };
}

export class ShrunkMarkov {
  constructor(prior = 50) {
    this.prior = prior;
    this.counts = Array(49).fill(0);
    this.exact = Array.from({ length: 49 }, () => Array(49).fill(0));
    this.tail = Array.from({ length: 10 }, () => Array(49).fill(0));
    this.previous = null;
    this.total = 0;
  }
  update(actual) {
    if (this.previous !== null) {
      this.exact[this.previous - 1][actual - 1]++;
      this.tail[this.previous % 10][actual - 1]++;
    }
    this.counts[actual - 1]++;
    this.total++;
    this.previous = actual;
  }
  scores() {
    const base = this.counts.map((c) => (c + 1) / (this.total + 49));
    if (this.previous === null) return base;
    const exact = this.exact[this.previous - 1], tail = this.tail[this.previous % 10];
    const ne = exact.reduce((a, b) => a + b, 0), nt = tail.reduce((a, b) => a + b, 0);
    return base.map((p, n) => 0.5 * (exact[n] + this.prior * p) / (ne + this.prior) +
      0.5 * (tail[n] + this.prior * p) / (nt + this.prior));
  }
}

export class GapHazard {
  constructor(prior = 100, pooledPrior = 98) {
    this.prior = prior;
    this.pooledPrior = pooledPrior;
    this.seen = Array(49).fill(-1);
    this.time = 0;
    this.exposures = Array.from({ length: 49 }, () => Array(8).fill(0));
    this.hits = Array.from({ length: 49 }, () => Array(8).fill(0));
    this.pooledExposures = Array(8).fill(0);
    this.pooledHits = Array(8).fill(0);
  }
  bin(n) {
    if (this.seen[n] === -1) return 7; // Unknown pre-snapshot omission: separate censored state.
    const omission = this.time - 1 - this.seen[n];
    return [0, 2, 5, 10, 20, 50, Infinity].findIndex((max) => omission <= max);
  }
  scores() {
    const raw = Array.from({ length: 49 }, (_, n) => {
      const b = this.bin(n);
      const pooled = (this.pooledHits[b] + this.pooledPrior / 49) /
        (this.pooledExposures[b] + this.pooledPrior);
      return (this.hits[n][b] + this.prior * pooled) / (this.exposures[n][b] + this.prior);
    });
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((p) => p / sum);
  }
  update(actual) {
    for (let n = 0; n < 49; n++) {
      const b = this.bin(n), hit = Number(n + 1 === actual);
      this.exposures[n][b]++;
      this.hits[n][b] += hit;
      this.pooledExposures[b]++;
      this.pooledHits[b] += hit;
    }
    this.seen[actual - 1] = this.time;
    this.time++;
  }
}

const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

// Small histogram Newton-boosting implementation with depth-1 trees only.
// Regularized leaf values, fixed bins, learning rate and refit schedule.
// Not a wrapper for XGBoost or scikit-learn; no data-driven hyperparameter search.
export class BoostedStumps {
  constructor(config) { this.config = config; this.trees = []; this.bias = Math.log(1 / 48); }
  fit(samples) {
    assert.ok(samples.length > 0);
    const { thresholds, rounds, learningRate, l2, minLeaf } = this.config;
    const x = samples.flatMap((s) => s.candidates);
    const y = samples.flatMap((s) => Array.from({ length: 49 }, (_, i) => Number(i + 1 === s.actual)));
    const n = x.length, dimensions = x[0].length, binCount = thresholds.length + 1;
    const bins = Array.from({ length: dimensions }, (_, j) => Uint8Array.from(x, (row) => {
      const index = thresholds.findIndex((threshold) => row[j] <= threshold);
      return index === -1 ? thresholds.length : index;
    }));
    const logits = new Float64Array(n).fill(this.bias);
    this.trees = [];
    for (let round = 0; round < rounds; round++) {
      const gradients = new Float64Array(n), hessians = new Float64Array(n);
      let totalG = 0, totalH = 0;
      for (let i = 0; i < n; i++) {
        const p = sigmoid(logits[i]);
        gradients[i] = y[i] - p;
        hessians[i] = p * (1 - p);
        totalG += gradients[i]; totalH += hessians[i];
      }
      let best = null;
      for (let j = 0; j < dimensions; j++) {
        const g = new Float64Array(binCount), h = new Float64Array(binCount), counts = new Int32Array(binCount);
        for (let i = 0; i < n; i++) {
          const b = bins[j][i];
          g[b] += gradients[i]; h[b] += hessians[i]; counts[b]++;
        }
        let gl = 0, hl = 0, count = 0;
        for (let b = 0; b < thresholds.length; b++) {
          gl += g[b]; hl += h[b]; count += counts[b];
          if (count < minLeaf || n - count < minLeaf) continue;
          const gr = totalG - gl, hr = totalH - hl;
          const gain = gl * gl / (hl + l2) + gr * gr / (hr + l2) - totalG * totalG / (totalH + l2);
          if (gain > 0 && (!best || gain > best.gain)) best = { j, b, gain,
            left: learningRate * Math.max(-2, Math.min(2, gl / (hl + l2))),
            right: learningRate * Math.max(-2, Math.min(2, gr / (hr + l2))) };
        }
      }
      if (!best) break;
      this.trees.push({ ...best, threshold: thresholds[best.b] });
      for (let i = 0; i < n; i++) logits[i] += bins[best.j][i] <= best.b ? best.left : best.right;
    }
  }
  scores(candidates) {
    return candidates.map((x) => sigmoid(this.bias + this.trees.reduce((sum, tree) =>
      sum + (x[tree.j] <= tree.threshold ? tree.left : tree.right), 0)));
  }
}

function percentileRanks(scores) {
  const ordered = scores.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s);
  const ranks = Array(49);
  for (let start = 0; start < 49;) {
    let end = start + 1;
    while (end < 49 && ordered[end].s === ordered[start].s) end++;
    const rank = (start + end - 1) / (2 * 48);
    for (let i = start; i < end; i++) ranks[ordered[i].i] = rank;
    start = end;
  }
  return ranks;
}

export function consensusSelection(scoreLists) {
  assert.ok(scoreLists.length > 1);
  const ranks = scoreLists.map(percentileRanks);
  const mean = Array.from({ length: 49 }, (_, n) => ranks.reduce((s, r) => s + r[n], 0) / ranks.length);
  const maximum = Array.from({ length: 49 }, (_, n) => Math.max(...ranks.map((r) => r[n])));
  const { pool20 } = selectExclusions(mean);
  const excluded10 = [...pool20].sort((a, b) => maximum[a - 1] - maximum[b - 1] || mean[a - 1] - mean[b - 1]).slice(0, 10);
  return { pool20, excluded10 };
}

export function runExpanded(rows, protocol = makeExpandedProtocol(rows), progress = () => {}) {
  const { warmup, trainEnd, validationEnd } = protocol;
  const features = Array.from({ length: rows.length + 1 }, (_, t) => t >= warmup ? featuresAt(rows, t) : null);
  const runners = protocol.configs.map((config) => {
    const runner = { config, validation: [], evaluation: [], samples: [], model: null, next: null };
    if (config.family === 'logistic') {
      runner.model = new LogisticModel(config);
      for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (let t = warmup; t < trainEnd; t++) runner.model.update(features[t].candidates, rows[t].n7);
      }
    }
    if (config.family === 'knn') {
      for (let t = warmup; t < trainEnd; t++) runner.samples.push({ state: features[t].state, actual: rows[t].n7 });
    }
    if (config.family === 'markov') runner.model = new ShrunkMarkov(config.prior);
    if (config.family === 'hazard') runner.model = new GapHazard(config.prior, config.pooledPrior);
    if (config.family === 'markov' || config.family === 'hazard') {
      for (let t = 0; t < trainEnd; t++) runner.model.update(rows[t].n7);
    }
    if (config.family === 'boosting') runner.model = new BoostedStumps(config);
    return runner;
  });
  let selectedId;
  for (let t = trainEnd; t <= rows.length; t++) {
    if (t === validationEnd) {
      selectedId = [...runners].sort((a, b) =>
        b.validation.filter((r) => r.success10).length - a.validation.filter((r) => r.success10).length)[0].config.id;
      progress({ phase: 'selection-locked-before-2026', selectedId });
    }
    const scoreMap = new Map();
    for (const runner of runners) {
      const { config: c, model, samples } = runner;
      if (c.family === 'ensemble') continue;
      if (c.family === 'boosting' && (t - trainEnd) % c.refitEvery === 0) {
        const training = [];
        for (let i = Math.max(warmup, t - c.window); i < t; i++) training.push({ candidates: features[i].candidates, actual: rows[i].n7 });
        model.fit(training);
      }
      let scores;
      if (c.family === 'frequency') scores = frequencyScores(rows, t, c);
      else if (c.family === 'logistic' || c.family === 'boosting') scores = model.scores(features[t].candidates);
      else if (c.family === 'knn') scores = knnScores(features[t].state, samples, c);
      else scores = model.scores();
      scoreMap.set(c.id, scores);
    }
    for (const runner of runners) {
      const c = runner.config;
      const selection = c.family === 'ensemble'
        ? consensusSelection(c.members.map((id) => scoreMap.get(id)))
        : selectExclusions(scoreMap.get(c.id));
      if (t === rows.length) {
        runner.next = { after: { year: rows.at(-1).year, No: rows.at(-1).No }, ...selection,
          ascending10: [...selection.excluded10].sort((a, b) => a - b) };
        continue;
      }
      const record = { year: rows[t].year, No: rows[t].No, actual: rows[t].n7, ...selection,
        success20: !selection.pool20.includes(rows[t].n7), success10: !selection.excluded10.includes(rows[t].n7) };
      runner[t < validationEnd ? 'validation' : 'evaluation'].push(record);
    }
    if (t < rows.length) {
      for (const { config: c, model, samples } of runners) {
        if (c.family === 'logistic') model.update(features[t].candidates, rows[t].n7);
        if (c.family === 'knn') samples.push({ state: features[t].state, actual: rows[t].n7 });
        if (c.family === 'markov' || c.family === 'hazard') model.update(rows[t].n7);
      }
    }
  }
  return { selectedId, results: runners.map((r) => ({ id: r.config.id, family: r.config.family,
    config: r.config, validation: exclusionMetrics(r.validation, 10),
    evaluation: { final10: exclusionMetrics(r.evaluation, 10), stage20: exclusionMetrics(r.evaluation, 20) },
    blocks: Array.from({ length: Math.ceil(r.evaluation.length / 50) }, (_, i) => {
      const block = r.evaluation.slice(i * 50, (i + 1) * 50);
      return { from: block[0].No, to: block.at(-1).No, ...exclusionMetrics(block, 10) };
    }),
    recent: [20, 50, 100].map((requested) => ({ requested, ...exclusionMetrics(r.evaluation.slice(-requested), 10) })),
    next: r.next, details: { validation: r.validation, evaluation: r.evaluation },
  })) };
}
