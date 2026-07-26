const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const digits = Array.from({ length: 10 }, (_, digit) => digit);

function counts(rows, t, window) {
  const result = Array(10).fill(0);
  for (let i = Math.max(0, t - window); i < t; i += 1) result[rows[i].tail] += 1;
  return result;
}

function transitionCounts(rows, t, window) {
  const result = Array(10).fill(0);
  const previous = rows[t - 1]?.tail;
  for (let i = Math.max(1, t - window); i < t; i += 1) {
    if (rows[i - 1].tail === previous) result[rows[i].tail] += 1;
  }
  return result;
}

function pick(rows, t, config) {
  const recent = counts(rows, t, config.window);
  const long = counts(rows, t, Math.min(t, 500));
  const transition = transitionCounts(rows, t, Math.min(t, 500));
  const transitionTotal = transition.reduce((sum, value) => sum + value, 0);
  return digits
    .map((digit) => {
      // 1..9 each map to five numbers; tail 0 only maps to 10/20/30/40.
      const prior = digit === 0 ? 4 / 49 : 5 / 49;
      const recentRate = (recent[digit] + config.prior * prior) / (Math.min(t, config.window) + config.prior);
      const longRate = (long[digit] + 100 * prior) / (Math.min(t, 500) + 100);
      const transitionRate = (transition[digit] + config.markovPrior * prior) /
        (transitionTotal + config.markovPrior);
      return {
        digit,
        score:
          recentRate * config.recentWeight +
          longRate * config.longWeight +
          transitionRate * config.transitionWeight,
      };
    })
    .sort((a, b) => b.score - a.score || a.digit - b.digit)
    .slice(0, 5)
    .map((item) => item.digit);
}

function evaluate(rows, start, end, config) {
  let hits = 0;
  const detail = [];
  for (let t = start; t < end; t += 1) {
    const prediction = pick(rows, t, config);
    const hit = prediction.includes(rows[t].tail);
    if (hit) hits += 1;
    detail.push({ ...rows[t], prediction, hit });
  }
  return { hits, trials: end - start, rate: hits / (end - start), detail };
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [raw] = await connection.query(
    'SELECT id, year, No, n7 FROM history ORDER BY year ASC, No ASC, id ASC',
  );
  await connection.end();
  const rows = raw.map((row) => ({
    year: Number(row.year),
    No: Number(row.No),
    special: Number(row.n7),
    tail: Number(row.n7) % 10,
  }));
  const holdoutStart = rows.length - 20;
  const validationStart = Math.max(100, holdoutStart - 400);
  const configs = [];
  for (const window of [20, 30, 50, 80, 120, 200]) {
    for (const prior of [20, 50, 100, 200]) {
      for (const recentWeight of [0, 0.25, 0.5, 0.75, 1]) {
        for (const transitionWeight of [0, 0.1, 0.25, 0.5]) {
          configs.push({
            window,
            prior,
            markovPrior: 30,
            recentWeight,
            longWeight: 1 - recentWeight,
            transitionWeight,
          });
        }
      }
    }
  }
  const ranked = configs
    .map((config) => ({
      config,
      validation: evaluate(rows, validationStart, holdoutStart, config),
      older: evaluate(rows, 100, validationStart, config),
    }))
    .filter((item) => item.older.rate >= 0.48)
    .sort((a, b) =>
      (b.validation.rate * 0.7 + b.older.rate * 0.3) -
      (a.validation.rate * 0.7 + a.older.rate * 0.3),
    );
  console.log('rows', rows.length, 'training', holdoutStart, 'blind holdout', rows.slice(holdoutStart).map(r => `${r.year}-${r.No}`).join('..'));
  for (const item of ranked.slice(0, 12)) {
    const blind = evaluate(rows, holdoutStart, rows.length, item.config);
    console.log(JSON.stringify(item.config), 'older', item.older.rate.toFixed(4), 'validation', item.validation.rate.toFixed(4), 'BLIND', blind.rate.toFixed(4), `${blind.hits}/20`);
  }
  const selected = ranked[0];
  const blind = evaluate(rows, holdoutStart, rows.length, selected.config);
  console.log('SELECTED', JSON.stringify(selected.config));
  console.table(blind.detail.map(row => ({
    issue: `${row.year}-${row.No}`,
    prediction: row.prediction.join(' '),
    actual: row.tail,
    hit: row.hit,
  })));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
