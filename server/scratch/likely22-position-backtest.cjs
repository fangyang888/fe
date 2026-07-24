const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'KillPredictor.jsx'), 'utf8');
const start = source.indexOf('  function predictLikelyNumbers');
const end = source.indexOf(
  '  // ================================================================\n  // 主预测函数',
  start,
);
if (start < 0 || end < 0) throw new Error('无法提取22码预测算法');
const createPredictor = new Function(
  `${source.slice(start, end)}; return predictLikelyNumbers;`,
);
const predictLikelyNumbers = createPredictor();

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
  for (let target = Math.max(10, rows.length - 100); target < rows.length; target++) {
    const predictions = predictLikelyNumbers(rows.slice(0, target)).map((item) => item.num);
    const actual = new Set(rows[target]);
    tests.push({
      predictions,
      absent: predictions.map((number) => !actual.has(number)),
    });
  }

  const windows = {};
  for (const periods of [10, 20, 50, 100]) {
    const sample = tests.slice(-periods);
    windows[periods] = Array.from({ length: 22 }, (_, index) => {
      const absentCount = sample.filter((test) => test.absent[index]).length;
      return {
        position: index + 1,
        absentCount,
        total: sample.length,
        absentRate: Number(((absentCount / sample.length) * 100).toFixed(1)),
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
