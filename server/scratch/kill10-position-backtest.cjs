const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const predictorSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'KillPredictor.jsx'),
  'utf8',
);
const snippetStart = predictorSource.indexOf('  const KILL10_PARAM_GRID');
const snippetEnd = predictorSource.indexOf(
  '  // ================================================================\n  // computeKill8Scores',
  snippetStart,
);

if (snippetStart < 0 || snippetEnd < 0) {
  throw new Error('无法从 KillPredictor.jsx 提取 10 杀算法');
}

const engineFactory = new Function(
  `${predictorSource.slice(snippetStart, snippetEnd)}
   return { getAdaptiveKill10Opts, strategyAbsoluteSafe };`,
);

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
    record.n1,
    record.n2,
    record.n3,
    record.n4,
    record.n5,
    record.n6,
    record.n7,
  ]);
  const tests = [];
  const firstTestIndex = Math.max(30, rows.length - 100);

  for (let targetIndex = firstTestIndex; targetIndex < rows.length; targetIndex++) {
    const history = rows.slice(0, targetIndex);
    const engine = engineFactory();
    const { opts } = engine.getAdaptiveKill10Opts(history);
    const predictions = engine
      .strategyAbsoluteSafe(history, opts)
      .map((item) => item.num);
    const actual = new Set(rows[targetIndex]);
    tests.push({
      year: records[targetIndex].year,
      No: records[targetIndex].No,
      predictions,
      success: predictions.map((number) => !actual.has(number)),
    });
  }

  const windows = [10, 20, 50, 100];
  const result = {};
  for (const windowSize of windows) {
    const sample = tests.slice(-windowSize);
    result[windowSize] = Array.from({ length: 10 }, (_, position) => {
      const hits = sample.filter((test) => test.success[position]).length;
      return {
        position: position + 1,
        hits,
        total: sample.length,
        rate: Number(((hits / sample.length) * 100).toFixed(1)),
      };
    });
  }

  console.log(
    JSON.stringify(
      {
        historyCount: rows.length,
        latest: records.at(-1),
        testedFrom: tests[0] && { year: tests[0].year, No: tests[0].No },
        testedTo: tests.at(-1) && { year: tests.at(-1).year, No: tests.at(-1).No },
        windows: result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
