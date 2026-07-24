const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'KillPredictor.jsx'), 'utf8');
const start = source.indexOf('  const PARAM_GRID');
const end = source.indexOf(
  '  // ================================================================\n  // computeKill8Scores',
  start,
);
if (start < 0 || end < 0) throw new Error('无法提取基础杀码和10杀算法');

const createEngine = new Function(
  `${source.slice(start, end)}
   return { getAdaptiveKill10Opts, strategyAbsoluteSafe, strategyKill5 };`,
);

function predictSmart7(hist) {
  const engine = createEngine();
  const subKill10Opts = engine.getAdaptiveKill10Opts(hist).opts;
  const subFinal = engine.strategyAbsoluteSafe(hist, subKill10Opts);
  const kill10Errors = {};
  const kill10Appearances = {};
  const backtestLength = Math.min(20, hist.length - 10);

  for (let j = hist.length - backtestLength - 1; j < hist.length - 1; j++) {
    if (j < 9) continue;
    const partialHistory = hist.slice(0, j + 1);
    const options = engine.getAdaptiveKill10Opts(partialHistory).opts;
    const predictions = engine.strategyAbsoluteSafe(partialHistory, options);
    const actual = new Set(hist[j + 1]);
    predictions.forEach((prediction) => {
      kill10Appearances[prediction.num] = (kill10Appearances[prediction.num] || 0) + 1;
      if (actual.has(prediction.num)) {
        kill10Errors[prediction.num] = (kill10Errors[prediction.num] || 0) + 1;
      }
    });
  }

  const firstSix = subFinal
    .map((prediction) => {
      const appearances = kill10Appearances[prediction.num] || 1;
      const errors = kill10Errors[prediction.num] || 0;
      return { ...prediction, errors, appearances, errorRate: errors / appearances };
    })
    .sort((a, b) => a.errorRate - b.errorRate || a.errors - b.errors)
    .slice(0, 6)
    .map((prediction) => prediction.num);

  const kill5Predictions = engine.strategyKill5(hist);
  const kill5Errors = {};
  const kill5Appearances = {};
  for (let j = hist.length - backtestLength - 1; j < hist.length - 1; j++) {
    if (j < 9) continue;
    const predictions = engine.strategyKill5(hist.slice(0, j + 1));
    const actual = new Set(hist[j + 1]);
    predictions.forEach((prediction) => {
      kill5Appearances[prediction.num] = (kill5Appearances[prediction.num] || 0) + 1;
      if (actual.has(prediction.num)) {
        kill5Errors[prediction.num] = (kill5Errors[prediction.num] || 0) + 1;
      }
    });
  }
  const seventh = kill5Predictions
    .map((prediction) => {
      const appearances = kill5Appearances[prediction.num] || 1;
      const errors = kill5Errors[prediction.num] || 0;
      return { ...prediction, errors, errorRate: errors / appearances };
    })
    .sort((a, b) => a.errorRate - b.errorRate || a.errors - b.errors)[0];

  return [...firstSix, ...(seventh ? [seventh.num] : [])];
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fe_prediction',
  });
  const [records] = await connection.query(
    'SELECT id, year, No, n1, n2, n3, n4, n5, n6, n7 FROM history ORDER BY year ASC, No ASC, id ASC',
  );
  await connection.end();
  const rows = records.map((record) => [
    record.n1, record.n2, record.n3, record.n4, record.n5, record.n6, record.n7,
  ]);
  const tests = [];
  for (let target = Math.max(30, rows.length - 100); target < rows.length; target++) {
    const predictions = predictSmart7(rows.slice(0, target));
    const actual = new Set(rows[target]);
    tests.push({
      year: records[target].year,
      No: records[target].No,
      predictions,
      success: predictions.map((number) => !actual.has(number)),
    });
  }

  const windows = {};
  for (const periods of [10, 20, 50, 100]) {
    const sample = tests.slice(-periods);
    windows[periods] = Array.from({ length: 7 }, (_, index) => {
      const hits = sample.filter((test) => test.success[index]).length;
      return {
        position: index + 1,
        hits,
        total: sample.length,
        rate: Number(((hits / sample.length) * 100).toFixed(1)),
      };
    });
  }
  console.log(JSON.stringify({
    historyCount: rows.length,
    latest: { year: records.at(-1).year, No: records.at(-1).No },
    windows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
