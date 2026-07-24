require('dotenv').config();
const mysql = require('mysql2/promise');

const HOLDOUT = 60;
const MIN_HISTORY = 240;

function sigmoid(x) {
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x))));
}

function featuresAt(rows, t, number) {
  const windows = [6, 12, 24, 48, 96, 192];
  const frequencies = windows.map((window) => {
    const start = Math.max(0, t - window);
    let hits = 0;
    for (let i = start; i < t; i++) if (rows[i].set.has(number)) hits++;
    return (hits + 2) / (t - start + 14);
  });
  let gap = Math.min(30, t);
  for (let i = t - 1; i >= Math.max(0, t - 30); i--) {
    if (rows[i].set.has(number)) {
      gap = t - 1 - i;
      break;
    }
  }
  const last = rows[t - 1]?.set.has(number) ? 1 : 0;
  const last2 = rows[t - 2]?.set.has(number) ? 1 : 0;
  const recentTrend = frequencies[1] - frequencies[4];
  return [1, ...frequencies, gap / 10, Math.min(gap, 8) / 8, last, last2, recentTrend];
}

function trainLogistic(rows, end, start = MIN_HISTORY) {
  const dimension = featuresAt(rows, start, 1).length;
  const means = Array(dimension).fill(0);
  const scales = Array(dimension).fill(1);
  const samples = [];
  for (let t = start; t < end; t += 2) {
    for (let number = 1; number <= 49; number++) {
      const x = featuresAt(rows, t, number);
      samples.push({ x, y: rows[t].set.has(number) ? 1 : 0 });
      for (let j = 1; j < dimension; j++) means[j] += x[j];
    }
  }
  for (let j = 1; j < dimension; j++) means[j] /= samples.length;
  for (const sample of samples) {
    for (let j = 1; j < dimension; j++) scales[j] += (sample.x[j] - means[j]) ** 2;
  }
  for (let j = 1; j < dimension; j++) scales[j] = Math.sqrt(scales[j] / samples.length) || 1;
  for (const sample of samples) {
    for (let j = 1; j < dimension; j++) sample.x[j] = (sample.x[j] - means[j]) / scales[j];
  }

  const weights = Array(dimension).fill(0);
  weights[0] = Math.log((7 / 49) / (1 - 7 / 49));
  for (let epoch = 0; epoch < 180; epoch++) {
    const gradient = Array(dimension).fill(0);
    for (const sample of samples) {
      const p = sigmoid(weights.reduce((sum, weight, j) => sum + weight * sample.x[j], 0));
      const error = p - sample.y;
      for (let j = 0; j < dimension; j++) gradient[j] += error * sample.x[j];
    }
    const rate = 0.35 / Math.sqrt(1 + epoch * 0.04);
    for (let j = 0; j < dimension; j++) {
      const regularization = j === 0 ? 0 : 0.02 * weights[j];
      weights[j] -= rate * (gradient[j] / samples.length + regularization);
    }
  }
  return { weights, means, scales };
}

function predict(model, rows, t) {
  return Array.from({ length: 49 }, (_, index) => {
    const number = index + 1;
    const x = featuresAt(rows, t, number);
    for (let j = 1; j < x.length; j++) x[j] = (x[j] - model.means[j]) / model.scales[j];
    const risk = sigmoid(model.weights.reduce((sum, weight, j) => sum + weight * x[j], 0));
    return { number, risk };
  }).sort((a, b) => a.risk - b.risk || a.number - b.number);
}

const simpleFeatureCache = new Map();

function simplePredict(rows, t, config) {
  const window = config.window;
  const cacheKey = `${t}:${window}:${config.halfLife}`;
  let featureRows = simpleFeatureCache.get(cacheKey);
  if (!featureRows) featureRows = Array.from({ length: 49 }, (_, index) => {
    const number = index + 1;
    let hits = 0;
    let weighted = 0;
    let weightSum = 0;
    let gap = Math.min(30, t);
    for (let i = Math.max(0, t - window); i < t; i++) {
      const hit = rows[i].set.has(number) ? 1 : 0;
      hits += hit;
      const weight = Math.exp(-(t - 1 - i) / config.halfLife);
      weighted += weight * hit;
      weightSum += weight;
    }
    for (let i = t - 1; i >= Math.max(0, t - 30); i--) {
      if (rows[i].set.has(number)) {
        gap = t - 1 - i;
        break;
      }
    }
    const freq = (hits + 2) / (Math.min(window, t) + 14);
    const ewma = (weighted + 0.5) / (weightSum + 3.5);
    const repeat = rows[t - 1]?.set.has(number) ? 1 : 0;
    return { number, freq, ewma, gap: Math.min(gap, 15) / 15, repeat };
  });
  simpleFeatureCache.set(cacheKey, featureRows);
  return featureRows.map((item) => ({
    number: item.number,
    risk: config.freq * item.freq + config.ewma * item.ewma + config.gap * item.gap + config.repeat * item.repeat,
  })).sort((a, b) => a.risk - b.risk || a.number - b.number);
}

function evaluate(rows, start, end, predictor) {
  const result = { count: end - start, tiers: {} };
  for (const count of [3, 4, 5]) {
    let successes = 0;
    let streak = 0;
    let maxStreak = 0;
    let currentStreak = 0;
    const failures = [];
    for (let t = start; t < end; t++) {
      const picks = predictor(t).slice(0, count).map((item) => item.number);
      const appeared = picks.filter((number) => rows[t].set.has(number));
      if (!appeared.length) {
        successes++;
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        failures.push({ period: `${rows[t].year}-${rows[t].No}`, picks, appeared });
        currentStreak = 0;
      }
    }
    streak = currentStreak;
    result.tiers[count] = { successes, rate: successes / (end - start), maxStreak, endingStreak: streak, failures: failures.slice(-5) };
  }
  return result;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fe_prediction',
  });
  const [raw] = await connection.query(
    'SELECT year, No, n1, n2, n3, n4, n5, n6, n7 FROM history ORDER BY year, No, id',
  );
  await connection.end();
  const rows = raw.map((row) => ({
    year: Number(row.year),
    No: Number(row.No),
    numbers: [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number),
    set: new Set([row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number)),
  }));
  const holdoutStart = rows.length - HOLDOUT;
  const trainEnd = Math.floor(holdoutStart * 0.68);
  const validationStart = trainEnd;
  const configs = [];
  for (const window of [24, 48, 96, 160, 240]) {
    for (const halfLife of [6, 12, 24, 48]) {
      for (const repeat of [-0.08, -0.04, 0, 0.04, 0.08]) {
        for (const gap of [-0.08, -0.04, 0, 0.04, 0.08]) {
          configs.push({ window, halfLife, freq: 0.45, ewma: 0.55, repeat, gap });
        }
      }
    }
  }
  const ranked = configs.map((config) => {
    const stats = evaluate(rows, validationStart, holdoutStart, (t) => simplePredict(rows, t, config));
    const score =
      stats.tiers[3].rate * 0.5 +
      stats.tiers[4].rate * 0.3 +
      stats.tiers[5].rate * 0.2 +
      Math.min(stats.tiers[3].maxStreak, 12) * 0.002;
    return { config, score, stats };
  }).sort((a, b) => b.score - a.score);
  if (process.argv.includes('--holdout')) {
    const frozenConfig = { window: 240, halfLife: 6, freq: 0.45, ewma: 0.55, repeat: 0, gap: 0.04 };
    const stats = evaluate(rows, holdoutStart, rows.length, (t) => simplePredict(rows, t, frozenConfig));
    const next = simplePredict(rows, rows.length, frozenConfig).slice(0, 10);
    console.log(JSON.stringify({
      frozenConfig,
      holdout: `${rows[holdoutStart].year}-${rows[holdoutStart].No}..${rows.at(-1).year}-${rows.at(-1).No}`,
      stats,
      next,
    }, null, 2));
    return;
  }
  const logistic = trainLogistic(rows, trainEnd);
  const logisticStats = evaluate(rows, validationStart, holdoutStart, (t) => predict(logistic, rows, t));
  console.log(JSON.stringify({
    split: {
      total: rows.length,
      developmentEnd: `${rows[holdoutStart - 1].year}-${rows[holdoutStart - 1].No}`,
      holdout: `${rows[holdoutStart].year}-${rows[holdoutStart].No}..${rows.at(-1).year}-${rows.at(-1).No}`,
      train: `${MIN_HISTORY}..${trainEnd - 1}`,
      validation: `${validationStart}..${holdoutStart - 1}`,
    },
    topSimple: ranked.slice(0, 12),
    logistic: { weights: logistic.weights, stats: logisticStats },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
