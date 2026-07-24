const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PredictorService } = require('../dist/src/predictor/predictor.service.js');

const historyStub = { findAll: async () => [] };
const configStub = { get: () => undefined };
const service = new PredictorService(historyStub, historyStub, configStub);

function rankedModels(hist) {
  const opts = service.getAdaptiveKill10Opts(hist);
  const toAscendingProbability = (values) =>
    Array.from({ length: 49 }, (_, index) => ({
      n: index + 1,
      value: values[index + 1] ?? 0,
    }))
      .sort((a, b) => a.value - b.value || a.n - b.n)
      .slice(0, 10)
      .map((item) => item.n);
  const toDescendingKill = (values) =>
    Array.from({ length: 49 }, (_, index) => ({
      n: index + 1,
      value: values[index + 1] ?? 0,
    }))
      .sort((a, b) => b.value - a.value || a.n - b.n)
      .slice(0, 10)
      .map((item) => item.n);

  return {
    frequency: service.kill10WithOpts(hist, opts).slice(0, 10).map((item) => item.n),
    repulsion: service.getRepulsionAdjustedCandidates(hist, opts).slice(0, 10).map((item) => item.n),
    knn: toAscendingProbability(service.getKnnPredictions(hist, 30)),
    markov: toAscendingProbability(service.getMarkovPredictions(hist)),
    markov2: toAscendingProbability(service.getMarkov2Predictions(hist)),
    bayes: toDescendingKill(service.getNaiveBayesKillProb(hist)),
    probability: service.getProbabilityKillPredictions(hist, 10).map((item) => item.n),
  };
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
    'SELECT year, No, n1, n2, n3, n4, n5, n6, n7 FROM history ORDER BY year ASC, No ASC, id ASC',
  );
  await connection.end();
  const rows = records.map((record) => [
    record.n1, record.n2, record.n3, record.n4, record.n5, record.n6, record.n7,
  ]);
  const tests = [];
  for (let target = Math.max(100, rows.length - 100); target < rows.length; target++) {
    const models = rankedModels(rows.slice(0, target));
    const actual = new Set(rows[target]);
    tests.push(Object.fromEntries(
      Object.entries(models).map(([name, predictions]) => [
        name,
        predictions.map((number) => !actual.has(number)),
      ]),
    ));
  }

  const windows = [20, 50, 100];
  const results = [];
  for (const model of Object.keys(tests[0])) {
    for (let position = 0; position < 10; position++) {
      const rates = {};
      for (const periods of windows) {
        const sample = tests.slice(-periods);
        const success = sample.filter((row) => row[model][position]).length;
        rates[periods] = Number(((success / sample.length) * 100).toFixed(1));
      }
      results.push({
        model,
        position: position + 1,
        ...rates,
        average: Number(((rates[20] + rates[50] + rates[100]) / 3).toFixed(1)),
      });
    }
  }
  results.sort((a, b) => b.average - a.average || b[100] - a[100]);
  console.log(JSON.stringify({
    historyCount: rows.length,
    latest: { year: records.at(-1).year, No: records.at(-1).No },
    top: results.slice(0, 30),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
