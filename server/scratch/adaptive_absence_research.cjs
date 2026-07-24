require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const MIN_HISTORY = 260;
const HOLDOUT = 60;
const expertCache = new Map();
let rows;
let gaps;

function comb(n, k) {
  let value = 1;
  for (let i = 1; i <= k; i++) value = value * (n - k + i) / i;
  return value;
}

function baseline(k) {
  return comb(49 - k, 7) / comb(49, 7);
}

function buildGaps() {
  gaps = Array.from({ length: rows.length + 1 }, () => Array(50).fill(30));
  const lastSeen = Array(50).fill(-31);
  for (let t = 0; t <= rows.length; t++) {
    for (let n = 1; n <= 49; n++) gaps[t][n] = Math.min(30, t - 1 - lastSeen[n]);
    if (t < rows.length) for (const n of rows[t].numbers) lastSeen[n] = t;
  }
}

function rank(items) {
  return items.sort((a, b) => a.risk - b.risk || a.number - b.number)
    .map((item, index) => ({ ...item, rank: index }));
}

function blockCounts(t, number, size, blockCount = 6) {
  const counts = [];
  for (let block = blockCount - 1; block >= 0; block--) {
    const start = Math.max(0, t - (block + 1) * size);
    const end = Math.max(0, t - block * size);
    let hits = 0;
    for (let s = start; s < end; s++) if (rows[s].set.has(number)) hits++;
    counts.push(hits);
  }
  return counts;
}

function blockExpertsAt(t, size) {
  const level = [];
  const trend = [];
  const state = [];
  for (let number = 1; number <= 49; number++) {
    const counts = blockCounts(t, number, size);
    let weightedHits = 0;
    let weightSum = 0;
    for (let i = 0; i < counts.length; i++) {
      const weight = Math.exp(-(counts.length - 1 - i) / 1.7);
      weightedHits += weight * counts[i];
      weightSum += weight;
    }
    const levelRisk = (weightedHits + 2 * 7 / 49) / (weightSum * size + 2);
    const meanX = (counts.length - 1) / 2;
    const meanY = counts.reduce((sum, value) => sum + value, 0) / counts.length;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < counts.length; i++) {
      numerator += (i - meanX) * (counts[i] - meanY);
      denominator += (i - meanX) ** 2;
    }
    const slope = denominator ? numerator / denominator : 0;
    const forecastCount = Math.max(0, Math.min(size, counts.at(-1) + slope));
    const trendRisk = 0.65 * levelRisk + 0.35 * (forecastCount + 1) / (size + 7);

    const currentState = Math.min(2, counts.at(-1));
    let stateSamples = 0;
    let stateHits = 0;
    for (let s = Math.max(size * 8, t - 480); s < t; s += size) {
      const pastCount = blockCounts(s, number, size, 1)[0];
      if (Math.min(2, pastCount) !== currentState) continue;
      stateSamples++;
      if (rows[s]?.set.has(number)) stateHits++;
    }
    const stateRisk = (stateHits + 6 * 7 / 49) / (stateSamples + 6);
    level.push({ number, risk: levelRisk });
    trend.push({ number, risk: trendRisk });
    state.push({ number, risk: stateRisk });
  }
  return [
    { key: `block${size}-level`, family: `block${size}`, picks: rank(level) },
    { key: `block${size}-trend`, family: `block${size}`, picks: rank(trend) },
    { key: `block${size}-state`, family: `block${size}`, picks: rank(state) },
  ];
}

function expertsAt(t) {
  if (expertCache.has(t)) return expertCache.get(t);
  const experts = [];
  for (const window of [24, 48, 96, 160, 240]) {
    experts.push({
      key: `freq-${window}`,
      family: 'frequency',
      picks: rank(Array.from({ length: 49 }, (_, i) => {
        const number = i + 1;
        let hits = 0;
        for (let s = Math.max(0, t - window); s < t; s++) if (rows[s].set.has(number)) hits++;
        return { number, risk: (hits + 2) / (Math.min(window, t) + 14) };
      })),
    });
  }
  for (const halfLife of [3, 6, 12, 24]) {
    experts.push({
      key: `ewma-${halfLife}`,
      family: 'realtime',
      picks: rank(Array.from({ length: 49 }, (_, i) => {
        const number = i + 1;
        let hits = 0;
        let weights = 0;
        for (let s = Math.max(0, t - 120); s < t; s++) {
          const weight = Math.exp(-(t - 1 - s) / halfLife);
          hits += weight * (rows[s].set.has(number) ? 1 : 0);
          weights += weight;
        }
        return { number, risk: (hits + 0.5) / (weights + 3.5) };
      })),
    });
  }
  experts.push({
    key: 'gap-hazard',
    family: 'hazard',
    picks: rank(Array.from({ length: 49 }, (_, i) => {
      const number = i + 1;
      const currentBucket = Math.min(10, gaps[t][number]);
      let samples = 0;
      let hits = 0;
      for (let s = Math.max(60, t - 420); s < t; s++) {
        if (Math.min(10, gaps[s][number]) !== currentBucket) continue;
        samples++;
        if (rows[s].set.has(number)) hits++;
      }
      return { number, risk: (hits + 5 * 7 / 49) / (samples + 5) };
    })),
  });
  const currentState = rows[t - 1].set;
  experts.push({
    key: 'state-neighbors',
    family: 'state',
    picks: rank(Array.from({ length: 49 }, (_, i) => {
      const number = i + 1;
      let hits = 0;
      let weights = 0;
      for (let s = Math.max(1, t - 420); s < t; s++) {
        let overlap = 0;
        for (const n of rows[s - 1].numbers) if (currentState.has(n)) overlap++;
        if (!overlap) continue;
        const weight = overlap * overlap;
        weights += weight;
        if (rows[s].set.has(number)) hits += weight;
      }
      return { number, risk: (hits + 4 * 7 / 49) / (weights + 4) };
    })),
  });
  experts.push(...blockExpertsAt(t, 5), ...blockExpertsAt(t, 10));
  expertCache.set(t, experts);
  return experts;
}

function adaptivePredict(t, count, config) {
  const currentExperts = expertsAt(t);
  const expertStats = currentExperts.map((expert) => {
    let successes = 0;
    let samples = 0;
    const start = Math.max(MIN_HISTORY, t - config.lookback);
    for (let s = start; s < t; s++) {
      const pastExpert = expertsAt(s).find((item) => item.key === expert.key);
      const selected = pastExpert.picks.slice(0, count);
      const success = selected.every((item) => !rows[s].set.has(item.number));
      successes += success ? 1 : 0;
      samples++;
    }
    const rate = (successes + config.prior * baseline(count)) / (samples + config.prior);
    const weight = Math.exp(config.eta * (rate - baseline(count)));
    return { ...expert, rate, weight };
  });
  const totalWeight = expertStats.reduce((sum, expert) => sum + expert.weight, 0);
  const consensus = Array.from({ length: 49 }, (_, i) => {
    const number = i + 1;
    let rankScore = 0;
    let familyVotes = new Set();
    for (const expert of expertStats) {
      const item = expert.picks.find((candidate) => candidate.number === number);
      rankScore += expert.weight * item.rank / 48;
      if (item.rank < count + 3) familyVotes.add(expert.family);
    }
    return {
      number,
      risk: rankScore / totalWeight - config.diversity * Math.max(0, familyVotes.size - 1),
      familyVotes: familyVotes.size,
    };
  }).sort((a, b) => a.risk - b.risk || b.familyVotes - a.familyVotes || a.number - b.number);
  return { picks: consensus.slice(0, count), experts: expertStats };
}

function staticPredict(t, count) {
  const longWindow = 240;
  return rank(Array.from({ length: 49 }, (_, i) => {
    const number = i + 1;
    let longHits = 0;
    let realtimeHits = 0;
    let realtimeWeights = 0;
    for (let s = t - longWindow; s < t; s++) {
      if (rows[s].set.has(number)) longHits++;
      const weight = Math.exp(-(t - 1 - s) / 6);
      realtimeHits += weight * (rows[s].set.has(number) ? 1 : 0);
      realtimeWeights += weight;
    }
    const longRisk = (longHits + 2) / (longWindow + 14);
    const realtimeRisk = (realtimeHits + 0.5) / (realtimeWeights + 3.5);
    return { number, risk: 0.45 * longRisk + 0.55 * realtimeRisk + 0.04 * Math.min(gaps[t][number], 15) / 15 };
  })).slice(0, count);
}

function hybridPredict(t, count, config) {
  const staticRanks = staticPredict(t, 49);
  const selectedExperts = expertsAt(t).filter((expert) => config.keys.includes(expert.key));
  return Array.from({ length: 49 }, (_, index) => {
    const number = index + 1;
    const staticRank = staticRanks.findIndex((item) => item.number === number) / 48;
    const blockRank = selectedExperts.reduce(
      (sum, expert) => sum + expert.picks.find((item) => item.number === number).rank / 48,
      0,
    ) / selectedExperts.length;
    return { number, risk: (1 - config.alpha) * staticRank + config.alpha * blockRank };
  }).sort((a, b) => a.risk - b.risk || a.number - b.number).slice(0, count);
}

function evaluate(start, end, predictor) {
  const output = {};
  for (const count of [3, 4, 5]) {
    let successCount = 0;
    let running = 0;
    let maxStreak = 0;
    const rowsOut = [];
    for (let t = start; t < end; t++) {
      const picks = predictor(t, count).map((item) => item.number);
      const appeared = picks.filter((number) => rows[t].set.has(number));
      if (!appeared.length) {
        successCount++;
        running++;
        maxStreak = Math.max(maxStreak, running);
      } else running = 0;
      rowsOut.push({ period: `${rows[t].year}-${rows[t].No}`, picks, appeared });
    }
    output[count] = { count: end - start, successCount, rate: successCount / (end - start), maxStreak, endingStreak: running, latest: rowsOut.slice(-8) };
  }
  return output;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fe_prediction',
  });
  const [raw] = await connection.query('SELECT year, No, n1,n2,n3,n4,n5,n6,n7 FROM history ORDER BY year,No,id');
  await connection.end();
  rows = raw.map((row) => {
    const numbers = [row.n1,row.n2,row.n3,row.n4,row.n5,row.n6,row.n7].map(Number);
    return { year: Number(row.year), No: Number(row.No), numbers, set: new Set(numbers) };
  });
  buildGaps();
  const holdoutStart = rows.length - HOLDOUT;
  const validationStart = 839;
  if (process.argv.includes('--hybrid-audit')) {
    const config = JSON.parse(process.argv[process.argv.indexOf('--hybrid-audit') + 1]);
    console.log(JSON.stringify({
      config,
      holdout: evaluate(holdoutStart, rows.length, (t, count) => hybridPredict(t, count, config)),
      previous: evaluate(holdoutStart, rows.length, staticPredict),
      next: [3, 4, 5].map((count) => ({ count, picks: hybridPredict(rows.length, count, config) })),
    }, null, 2));
    return;
  }
  if (process.argv.includes('--hybrids')) {
    const keyGroups = [
      ['block5-trend'],
      ['block10-trend'],
      ['block5-trend', 'block10-trend'],
      ['block5-level', 'block10-level'],
      ['block5-state', 'block10-state'],
    ];
    const result = [];
    for (const keys of keyGroups) {
      for (const alpha of [0.05, 0.1, 0.15, 0.2, 0.3]) {
        const config = { keys, alpha };
        const stats = evaluate(validationStart, holdoutStart, (t, count) => hybridPredict(t, count, config));
        result.push({ config, stats });
      }
    }
    result.sort((a, b) => {
      const aScore = a.stats[3].rate * .55 + a.stats[4].rate * .3 + a.stats[5].rate * .15;
      const bScore = b.stats[3].rate * .55 + b.stats[4].rate * .3 + b.stats[5].rate * .15;
      return bScore - aScore;
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (process.argv.includes('--experts')) {
    const keys = expertsAt(holdoutStart - 1).map((expert) => expert.key);
    const result = keys.map((key) => {
      const stats = evaluate(validationStart, holdoutStart, (t, count) =>
        expertsAt(t).find((expert) => expert.key === key).picks.slice(0, count),
      );
      return { key, stats };
    }).sort((a, b) => b.stats[3].rate - a.stats[3].rate);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const configs = [];
  for (const lookback of [40, 60, 100]) {
    for (const eta of [20]) {
      for (const prior of [10, 30]) {
        for (const diversity of [0]) configs.push({ lookback, eta, prior, diversity });
      }
    }
  }
  if (process.argv.includes('--audit')) {
    const config = JSON.parse(process.argv[process.argv.indexOf('--audit') + 1]);
    const adaptive = evaluate(holdoutStart, rows.length, (t, count) => adaptivePredict(t, count, config).picks);
    const previous = evaluate(holdoutStart, rows.length, staticPredict);
    const next = [3,4,5].map((count) => ({
      count,
      ...adaptivePredict(rows.length, count, config),
    }));
    console.log(JSON.stringify({ config, holdout: adaptive, previous, next }, null, 2));
    return;
  }
  const ranked = configs.map((config) => {
    const stats = evaluate(validationStart, holdoutStart, (t, count) => adaptivePredict(t, count, config).picks);
    const score = stats[3].rate * .55 + stats[4].rate * .3 + stats[5].rate * .15;
    return { config, score, stats };
  }).sort((a,b) => b.score - a.score);
  const previous = evaluate(validationStart, holdoutStart, staticPredict);
  console.log(JSON.stringify({ split: { validationStart, holdoutStart }, previous, top: ranked.slice(0, 8) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
