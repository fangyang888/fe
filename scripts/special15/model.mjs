// Pure numerical experiment: no network, database writes, or future-label features.
export const TOP_K = 15;
export const BASE_RATE = TOP_K / 49;
export const WARMUP = 30;
export const CONFIGS = Object.freeze([
  { id: 'frequency-30', family: 'frequency', window: 30, prior: 49 },
  { id: 'frequency-100', family: 'frequency', window: 100, prior: 49 },
  { id: 'logistic-l2-0.01', family: 'logistic', l2: 0.01, epochs: 40, learningRate: 0.3 },
  { id: 'logistic-l2-0.1', family: 'logistic', l2: 0.1, epochs: 40, learningRate: 0.3 },
  { id: 'knn-15', family: 'knn', neighbors: 15, prior: 10 },
  { id: 'knn-30', family: 'knn', neighbors: 30, prior: 10 },
]);

export function normalizeRows(input, year = 2026) {
  if (!Array.isArray(input)) throw new Error('历史数据必须是数组');
  // Filter before validating or constructing ANY feature: other years never enter the model.
  const selected = input.filter((r) => Number(r.year) === year);
  const unique = new Map();
  let duplicates = 0;
  for (const r of selected) {
    const No = Number(r.No);
    const numbers = Array.from({ length: 7 }, (_, i) => {
      const value = r[`n${i + 1}`];
      return value === null || value === '' ? NaN : Number(value);
    });
    if (!Number.isInteger(No) || No < 1 ||
        numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 49) ||
        new Set(numbers).size !== 7) {
      throw new Error(`第 ${year}/${r.No} 期数据无效；不静默删除或重排号码位置`);
    }
    const row = { year, No, ...Object.fromEntries(numbers.map((n, i) => [`n${i + 1}`, n])) };
    if (unique.has(No)) {
      if (JSON.stringify(unique.get(No)) !== JSON.stringify(row)) {
        throw new Error(`第 ${year}/${No} 期存在冲突记录`);
      }
      duplicates++;
    } else unique.set(No, row);
  }
  const rows = [...unique.values()].sort((a, b) => a.No - b.No);
  if (!rows.length) throw new Error(`没有 ${year} 年的数据`);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].No !== rows[i - 1].No + 1) {
      throw new Error(`第 ${rows[i - 1].No}～${rows[i].No} 期间缺期；补齐后再运行`);
    }
  }
  return { rows, audit: { year, selected: selected.length, valid: rows.length,
    ignoredOtherYears: input.length - selected.length, identicalDuplicatesRemoved: duplicates,
    first: rows[0].No, last: rows.at(-1).No, gaps: 0 } };
}

function counts(rows, t, window, normal = false) {
  const out = Array(49).fill(0);
  for (let i = Math.max(0, t - window); i < t; i++) {
    if (normal) {
      for (let p = 1; p <= 6; p++) out[rows[i][`n${p}`] - 1]++;
    } else out[rows[i].n7 - 1]++;
  }
  return out;
}

// Uses an analytical Bernoulli scale, not a scaler fitted on validation/test data.
function frequencyFeature(count, size, probability) {
  if (!size) return 0;
  const z = (count - size * probability) / Math.sqrt(size * probability * (1 - probability));
  return Math.max(-3, Math.min(3, z)) / 3;
}

export function featuresAt(rows, t) {
  if (t < 1 || t > rows.length) throw new Error('特征截止位置越界');
  const windows = [10, 30, 100];
  const specials = windows.map((w) => counts(rows, t, w));
  const normals = windows.map((w) => counts(rows, t, w, true));
  const lastSpecial = Array(49).fill(-1);
  const lastNormal = Array(49).fill(-1);
  for (let i = 0; i < t; i++) {
    lastSpecial[rows[i].n7 - 1] = i;
    for (let p = 1; p <= 6; p++) lastNormal[rows[i][`n${p}`] - 1] = i;
  }
  const candidates = Array.from({ length: 49 }, (_, j) => {
    const sf = specials.map((c, w) => frequencyFeature(c[j], Math.min(t, windows[w]), 1 / 49));
    const nf = normals.map((c, w) => frequencyFeature(c[j], Math.min(t, windows[w]), 6 / 49));
    const omission = (last) => Math.log1p(Math.min(100, t - 1 - last)) / Math.log(101);
    return [...sf, ...nf, omission(lastSpecial[j]), omission(lastNormal[j]),
      Number(lastSpecial[j] === t - 1), Number(lastNormal[j] === t - 1),
      (sf[0] - sf[2]) / 2, (nf[0] - nf[2]) / 2];
  });
  // A 98-dimensional state: special/normal 30-period frequency vectors,
  // each L2-normalized. Euclidean distance gives both blocks equal weight.
  const block = (v) => {
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  };
  return { candidates, state: [...block(specials[1]), ...block(normals[1])] };
}

export function frequencyScores(rows, t, config) {
  const c = counts(rows, t, config.window);
  const denominator = Math.min(t, config.window) + config.prior;
  return c.map((n) => (n + config.prior / 49) / denominator);
}

export class LogisticModel {
  constructor(config) {
    this.config = config;
    this.weights = Array(12).fill(0);
    this.bias = Math.log(1 / 48);
  }
  scores(candidates) {
    return candidates.map((x) => {
      const z = this.bias + x.reduce((sum, value, j) => sum + value * this.weights[j], 0);
      return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
    });
  }
  update(candidates, actual) {
    const scores = this.scores(candidates);
    const grad = Array(12).fill(0);
    let biasGrad = 0;
    for (let n = 0; n < 49; n++) {
      const error = scores[n] - Number(n + 1 === actual);
      biasGrad += error / 49;
      for (let j = 0; j < 12; j++) grad[j] += error * candidates[n][j] / 49;
    }
    this.weights = this.weights.map((w, j) =>
      w - this.config.learningRate * (grad[j] + this.config.l2 * w));
    this.bias -= this.config.learningRate * biasGrad;
  }
}

export function knnScores(state, samples, config) {
  const nearest = samples.map((s, index) => ({
    sample: s, index,
    distance: Math.sqrt(state.reduce((sum, value, j) => sum + (value - s.state[j]) ** 2, 0)),
  })).sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, config.neighbors);
  const out = Array(49).fill(config.prior / 49);
  const weights = nearest.map((n) => 1 / (n.distance + 0.05));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  nearest.forEach((n, i) => {
    out[n.sample.actual - 1] += weights[i] * nearest.length / weightSum;
  });
  return out.map((n) => n / (config.prior + nearest.length));
}

// Deterministic, label-independent tie breaking; avoids always preferring small numbers.
function tieValue(n) {
  let x = Math.imul(n, 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function top15(scores) {
  if (scores.length !== 49 || scores.some((s) => !Number.isFinite(s))) {
    throw new Error('必须提供 49 个有限分数');
  }
  return scores.map((score, i) => ({ number: i + 1, score }))
    .sort((a, b) => b.score - a.score || tieValue(a.number) - tieValue(b.number))
    .slice(0, TOP_K).map((item) => item.number);
}

export function metrics(details) {
  const count = details.length;
  const hits = details.reduce((sum, r) => sum + Number(r.hit), 0);
  const rate = count ? hits / count : null;
  let longestMiss = 0, streak = 0;
  for (const row of details) {
    streak = row.hit ? 0 : streak + 1;
    longestMiss = Math.max(longestMiss, streak);
  }
  if (!count) return { count, hits, rate, ci95: null, longestMiss, pAgainstRandom: null };
  const z = 1.95996398454, d = 1 + z * z / count;
  const center = (rate + z * z / (2 * count)) / d;
  const radius = z * Math.sqrt(rate * (1 - rate) / count + z * z / (4 * count * count)) / d;
  // Exact one-sided binomial tail under independent uniform draws and exactly 15 picks.
  let pAgainstRandom = 0, logChoose = 0;
  for (let k = 0; k <= count; k++) {
    if (k >= hits) pAgainstRandom += Math.exp(logChoose + k * Math.log(BASE_RATE) +
      (count - k) * Math.log1p(-BASE_RATE));
    if (k < count) logChoose += Math.log(count - k) - Math.log(k + 1);
  }
  return { count, hits, rate, ci95: [center - radius, center + radius], longestMiss,
    pAgainstRandom: Math.min(1, pAgainstRandom) };
}

export function makeProtocol(rows, configs = CONFIGS) {
  if (rows.length < 210) throw new Error('至少需要同一年连续 210 期，保证训练和两段评估的样本量');
  // 2026's current 266 rows => train 1..146, validate 147..206, test 207..266.
  const testCount = 60, validationCount = 60;
  const testStart = rows.length - testCount;
  const validationStart = testStart - validationCount;
  const range = (start, end) => ({ startIndex: start, endIndexExclusive: end,
    from: rows[start].No, to: rows[end - 1].No, count: end - start });
  return {
    version: 1, year: rows[0].year, topK: TOP_K, warmup: WARMUP,
    training: range(0, validationStart),
    trainingLabels: range(WARMUP, validationStart),
    validation: range(validationStart, testStart),
    test: range(testStart, rows.length),
    configs,
    selection: 'Highest validation Top-15 hit count; ties follow configuration declaration order. No test-based reselection.',
    updatePolicy: 'Predict first, then learn the revealed outcome. Logistic: one SGD update per new draw; KNN: append one labeled past state.',
    trainingPolicy: 'Logistic: 40 chronological SGD passes over training labels only. Hyperparameters fixed before final test.',
    features: '12 candidate features; analytical scaling only. KNN: 98-dimensional past-30 special/normal frequency state.',
    caveat: 'Retrospective holdout for this script; these draws may have been inspected by other project experiments. Prospective evidence is still required.',
  };
}

function forecast(config, rows, t, features, model, samples) {
  if (config.family === 'logistic') return model.scores(features.candidates);
  if (config.family === 'knn') return knnScores(features.state, samples, config);
  return frequencyScores(rows, t, config);
}

function observe(config, features, actual, model, samples) {
  if (config.family === 'logistic') model.update(features.candidates, actual);
  if (config.family === 'knn') samples.push({ state: features.state, actual });
}

export function runExperiment(rows, protocol = makeProtocol(rows)) {
  const start = protocol.validation.startIndex;
  const testStart = protocol.test.startIndex;
  // Precomputation is safe: featuresAt reads only rows[0:t], never row t or later.
  const features = Array.from({ length: rows.length + 1 }, (_, t) =>
    t >= protocol.warmup ? featuresAt(rows, t) : null);
  const runners = protocol.configs.map((config) => {
    const model = config.family === 'logistic' ? new LogisticModel(config) : null;
    const samples = [];
    if (model) {
      for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (let t = protocol.warmup; t < start; t++) model.update(features[t].candidates, rows[t].n7);
      }
    }
    if (config.family === 'knn') {
      for (let t = protocol.warmup; t < start; t++) samples.push({ state: features[t].state, actual: rows[t].n7 });
    }
    const validation = [];
    for (let t = start; t < testStart; t++) {
      const picks = top15(forecast(config, rows, t, features[t], model, samples));
      validation.push({ year: rows[t].year, No: rows[t].No, actual: rows[t].n7,
        picks, hit: picks.includes(rows[t].n7) });
      observe(config, features[t], rows[t].n7, model, samples);
    }
    return { config, model, samples, validation, test: [] };
  });
  // Selection happens BEFORE evaluating any test prediction.
  const validationWinner = (list) => [...list].sort((a, b) =>
    metrics(b.validation).hits - metrics(a.validation).hits)[0];
  const selectedId = validationWinner(runners).config.id;
  const familyWinners = Object.fromEntries(['frequency', 'logistic', 'knn'].map((family) =>
    [family, validationWinner(runners.filter((r) => r.config.family === family)).config.id]));
  const results = runners.map((runner) => {
    const { config, model, samples } = runner;
    for (let t = testStart; t < rows.length; t++) {
      const picks = top15(forecast(config, rows, t, features[t], model, samples));
      runner.test.push({ year: rows[t].year, No: rows[t].No, actual: rows[t].n7,
        picks, hit: picks.includes(rows[t].n7) });
      observe(config, features[t], rows[t].n7, model, samples);
    }
    const scores = forecast(config, rows, rows.length, features.at(-1), model, samples);
    const picks = top15(scores);
    return { id: config.id, family: config.family, config,
      validation: metrics(runner.validation), test: metrics(runner.test),
      recentTest: [20, 50, 100].map((requested) => ({ requested, ...metrics(runner.test.slice(-requested)) })),
      next: { after: { year: rows.at(-1).year, No: rows.at(-1).No },
        target: '下一条尚未开奖的记录；以数据源最新期号为准',
        picks, ascending: [...picks].sort((a, b) => a - b),
        scores: picks.map((n) => ({ number: n, score: scores[n - 1] })),
        scoreMeaning: '排序分数，不作为已校准的命中概率' },
      details: { validation: runner.validation, test: runner.test } };
  });
  return { protocol, baseline: BASE_RATE, selectedId, familyWinners, results };
}
