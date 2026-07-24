require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const HOLDOUT = 60;
const MIN_HISTORY = 300;
let rows;
const cache = new Map();

function circularDistance(a, b) {
  const distance = Math.abs(a - b);
  return Math.min(distance, 49 - distance);
}

function wrap(value) {
  return ((value - 1) % 49 + 49) % 49 + 1;
}

function rank(items) {
  return items.sort((a, b) => a.risk - b.risk || a.number - b.number);
}

function staticRisk(t) {
  const key = `static:${t}`;
  if (cache.has(key)) return cache.get(key);
  const result = rank(Array.from({ length: 49 }, (_, i) => {
    const number = i + 1;
    let longHits = 0;
    let realtimeHits = 0;
    let weightSum = 0;
    let gap = 30;
    for (let s = t - 240; s < t; s++) {
      if (rows[s].set.has(number)) longHits++;
      const weight = Math.exp(-(t - 1 - s) / 6);
      realtimeHits += weight * (rows[s].set.has(number) ? 1 : 0);
      weightSum += weight;
    }
    for (let s = t - 1; s >= Math.max(0, t - 30); s--) {
      if (rows[s].set.has(number)) {
        gap = t - 1 - s;
        break;
      }
    }
    return {
      number,
      risk: .45 * ((longHits + 2) / 254) +
        .55 * ((realtimeHits + .5) / (weightSum + 3.5)) +
        .04 * Math.min(gap, 15) / 15,
    };
  }));
  cache.set(key, result);
  return result;
}

function positionKernel(t, config) {
  const key = `pos:${t}:${JSON.stringify(config)}`;
  if (cache.has(key)) return cache.get(key);
  const query = rows[t - 1].numbers;
  const hits = Array(50).fill(0);
  let totalWeight = 0;
  for (let s = Math.max(1, t - config.window); s < t; s++) {
    let similarity = 0;
    for (let position = 0; position < 7; position++) {
      const distance = circularDistance(query[position], rows[s - 1].numbers[position]);
      similarity += Math.exp(-distance / config.tau);
    }
    const weight = config.power === 1 ? similarity : similarity ** config.power;
    totalWeight += weight;
    for (const number of rows[s].numbers) hits[number] += weight;
  }
  const result = rank(Array.from({ length: 49 }, (_, i) => {
    const number = i + 1;
    return { number, risk: (hits[number] + 6 * 7 / 49) / (totalWeight + 6) };
  }));
  cache.set(key, result);
  return result;
}

function positionKnn(t, config) {
  const key = `knn:${t}:${JSON.stringify(config)}`;
  if (cache.has(key)) return cache.get(key);
  const query = rows[t - 1].numbers;
  const neighbors = [];
  for (let s = Math.max(1, t - config.window); s < t; s++) {
    let distance = 0;
    for (let position = 0; position < 7; position++) {
      distance += circularDistance(query[position], rows[s - 1].numbers[position]);
    }
    const queryDiff = wrap(query[6] - query[0]);
    const pastDiff = wrap(rows[s - 1].numbers[6] - rows[s - 1].numbers[0]);
    distance += config.structure * circularDistance(queryDiff, pastDiff);
    neighbors.push({ s, distance });
  }
  neighbors.sort((a, b) => a.distance - b.distance);
  const hits = Array(50).fill(0);
  let totalWeight = 0;
  for (const neighbor of neighbors.slice(0, config.k)) {
    const weight = Math.exp(-neighbor.distance / config.scale);
    totalWeight += weight;
    for (const number of rows[neighbor.s].numbers) hits[number] += weight;
  }
  const result = rank(Array.from({ length: 49 }, (_, i) => {
    const number = i + 1;
    return { number, risk: (hits[number] + 8 * 7 / 49) / (totalWeight + 8) };
  }));
  cache.set(key, result);
  return result;
}

function modularTransition(t, config) {
  const key = `mod:${t}:${JSON.stringify(config)}`;
  if (cache.has(key)) return cache.get(key);
  const risk = Array(50).fill(0);
  const query = rows[t - config.lag].numbers;
  for (let position = 0; position < 7; position++) {
    const deltaCounts = Array(50).fill(0);
    let samples = 0;
    for (let s = Math.max(config.lag, t - config.window); s < t; s++) {
      const source = rows[s - config.lag].numbers[position];
      for (const target of rows[s].numbers) deltaCounts[wrap(target - config.a * source)]++;
      samples += 7;
    }
    for (let number = 1; number <= 49; number++) {
      const delta = wrap(number - config.a * query[position]);
      risk[number] += (deltaCounts[delta] + 3 / 7) / (samples + 21);
    }
  }
  const result = rank(Array.from({ length: 49 }, (_, i) => ({
    number: i + 1,
    risk: risk[i + 1] / 7,
  })));
  cache.set(key, result);
  return result;
}

function blockStateSignal(t, size) {
  const key = `block-state:${t}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const result = rank(Array.from({ length: 49 }, (_, i) => {
    const number = i + 1;
    let currentCount = 0;
    for (let s = t - size; s < t; s++) if (rows[s].set.has(number)) currentCount++;
    const state = Math.min(2, currentCount);
    let samples = 0;
    let hits = 0;
    for (let s = Math.max(size * 8, t - 480); s < t; s += size) {
      let pastCount = 0;
      for (let p = s - size; p < s; p++) if (rows[p].set.has(number)) pastCount++;
      if (Math.min(2, pastCount) !== state) continue;
      samples++;
      if (rows[s].set.has(number)) hits++;
    }
    return { number, risk: (hits + 6 * 7 / 49) / (samples + 6) };
  }));
  cache.set(key, result);
  return result;
}

function stateNeighborSignal(t) {
  const key = `state-neighbor:${t}`;
  if (cache.has(key)) return cache.get(key);
  const current = rows[t - 1].set;
  const hits = Array(50).fill(0);
  let weightSum = 0;
  for (let s = Math.max(1, t - 420); s < t; s++) {
    let overlap = 0;
    for (const number of rows[s - 1].numbers) if (current.has(number)) overlap++;
    if (!overlap) continue;
    const weight = overlap * overlap;
    weightSum += weight;
    for (const number of rows[s].numbers) hits[number] += weight;
  }
  const result = rank(Array.from({ length: 49 }, (_, i) => ({
    number: i + 1,
    risk: (hits[i + 1] + 4 * 7 / 49) / (weightSum + 4),
  })));
  cache.set(key, result);
  return result;
}

function vetoSignals(t) {
  return {
    modular: modularTransition(t, { window: 300, lag: 5, a: 1 }),
    block5: blockStateSignal(t, 5),
    block10: blockStateSignal(t, 10),
    state: stateNeighborSignal(t),
  };
}

function vetoPredict(t, config) {
  const base = staticRisk(t);
  const allSignals = vetoSignals(t);
  const signals = config.signals.map((key) => allSignals[key]);
  return base.slice(0, config.pool).map((item, baseRank) => {
    const ranks = signals.map((signal) => signal.findIndex((candidate) => candidate.number === item.number));
    const vetoCount = ranks.filter((value) => value >= config.cutoff).length;
    const meanRank = ranks.reduce((sum, value) => sum + value, 0) / (ranks.length * 48);
    return {
      number: item.number,
      risk: baseRank / 48 + config.penalty * vetoCount + config.signalWeight * meanRank,
      vetoCount,
      ranks,
    };
  }).sort((a, b) => a.risk - b.risk || a.number - b.number);
}

function hybrid(t, config) {
  const base = staticRisk(t);
  const signal = config.kind === 'knn'
    ? positionKnn(t, config.signal)
    : config.kind === 'position'
      ? positionKernel(t, config.signal)
      : modularTransition(t, config.signal);
  return rank(Array.from({ length: 49 }, (_, i) => {
    const number = i + 1;
    const baseRank = base.findIndex((item) => item.number === number) / 48;
    const signalRank = signal.findIndex((item) => item.number === number) / 48;
    return { number, risk: (1 - config.alpha) * baseRank + config.alpha * signalRank };
  }));
}

function evaluate(start, end, predictor) {
  const output = {};
  for (const count of [3, 4, 5]) {
    let successes = 0;
    let running = 0;
    let maxStreak = 0;
    for (let t = start; t < end; t++) {
      const picks = predictor(t).slice(0, count).map((item) => item.number);
      if (picks.every((number) => !rows[t].set.has(number))) {
        successes++;
        running++;
        maxStreak = Math.max(maxStreak, running);
      } else running = 0;
    }
    output[count] = { rate: successes / (end - start), successes, maxStreak, endingStreak: running };
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
  const [raw] = await connection.query('SELECT year,No,n1,n2,n3,n4,n5,n6,n7 FROM history ORDER BY year,No,id');
  await connection.end();
  rows = raw.map((row) => {
    const numbers = [row.n1,row.n2,row.n3,row.n4,row.n5,row.n6,row.n7].map(Number);
    return { year: Number(row.year), No: Number(row.No), numbers, set: new Set(numbers) };
  });
  const holdoutStart = rows.length - HOLDOUT;
  const validationStart = 839;
  if (process.argv.includes('--veto-audit')) {
    const configs = JSON.parse(process.argv[process.argv.indexOf('--veto-audit') + 1]);
    const output = {};
    for (const count of [3, 4, 5]) {
      const config = configs[count];
      output[count] = {
        config,
        validation: evaluate(validationStart, holdoutStart, (t) => vetoPredict(t, config))[count],
        holdout: evaluate(holdoutStart, rows.length, (t) => vetoPredict(t, config))[count],
        previous: evaluate(holdoutStart, rows.length, staticRisk)[count],
        next: vetoPredict(rows.length, config).slice(0, count),
      };
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (process.argv.includes('--veto')) {
    const folds = [[500, 745], [745, 990], [990, holdoutStart]];
    const signalSets = [
      ['modular', 'block5', 'block10', 'state'],
      ['modular', 'state'],
      ['modular', 'block5', 'block10'],
      ['block5', 'block10', 'state'],
    ];
    const configurations = [];
    for (const signals of signalSets) {
      for (const pool of [8, 12, 16]) {
        for (const cutoff of [28, 34, 40]) {
          for (const penalty of [.08, .15]) {
            for (const signalWeight of [0, .05]) {
              configurations.push({ signals, pool, cutoff, penalty, signalWeight });
            }
          }
        }
      }
    }
    const results = configurations.map((config) => {
      const foldStats = folds.map(([start, end]) => evaluate(start, end, (t) => vetoPredict(t, config)));
      const tierScores = {};
      for (const count of [3, 4, 5]) {
        const rates = foldStats.map((stats) => stats[count].rate);
        const average = rates.reduce((sum, value) => sum + value, 0) / rates.length;
        const worst = Math.min(...rates);
        const minimumStreak = Math.min(...foldStats.map((stats) => stats[count].maxStreak));
        tierScores[count] = { average, worst, minimumStreak, rates };
      }
      return { config, tierScores };
    });
    const top = {};
    for (const count of [3, 4, 5]) {
      top[count] = [...results].sort((a, b) => {
        const aScore = a.tierScores[count].average + .55 * a.tierScores[count].worst + .001 * a.tierScores[count].minimumStreak;
        const bScore = b.tierScores[count].average + .55 * b.tierScores[count].worst + .001 * b.tierScores[count].minimumStreak;
        return bScore - aScore;
      }).slice(0, 8);
    }
    const baseFolds = folds.map(([start, end]) => evaluate(start, end, staticRisk));
    console.log(JSON.stringify({ folds, baseFolds, top }, null, 2));
    return;
  }
  const configs = [];
  for (const alpha of [.1, .2]) {
    configs.push({ kind: 'position', alpha, signal: { window: 420, tau: 2, power: 2 } });
    configs.push({ kind: 'knn', alpha, signal: { window: 500, k: 30, scale: 45, structure: .5 } });
    configs.push({ kind: 'knn', alpha, signal: { window: 500, k: 60, scale: 60, structure: 1 } });
    for (const lag of [1, 5]) {
      for (const a of [-1, 1, 2]) {
        configs.push({ kind: 'modular', alpha, signal: { window: 300, lag, a } });
      }
    }
  }
  if (process.argv.includes('--audit')) {
    const config = JSON.parse(process.argv[process.argv.indexOf('--audit') + 1]);
    console.log(JSON.stringify({
      config,
      validation: evaluate(validationStart, holdoutStart, (t) => hybrid(t, config)),
      holdout: evaluate(holdoutStart, rows.length, (t) => hybrid(t, config)),
      previous: evaluate(holdoutStart, rows.length, staticRisk),
      next: hybrid(rows.length, config).slice(0, 10),
    }, null, 2));
    return;
  }
  const ranked = configs.map((config) => {
    const stats = evaluate(validationStart, holdoutStart, (t) => hybrid(t, config));
    const score = stats[3].rate * .55 + stats[4].rate * .3 + stats[5].rate * .15;
    return { config, score, stats };
  }).sort((a, b) => b.score - a.score);
  console.log(JSON.stringify({
    previous: evaluate(validationStart, holdoutStart, staticRisk),
    top: ranked.slice(0, 15),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
