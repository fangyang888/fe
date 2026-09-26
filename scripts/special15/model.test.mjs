import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRows, featuresAt, frequencyScores, LogisticModel, knnScores,
  top15, metrics, makeProtocol, runExperiment, CONFIGS, BASE_RATE,
} from './model.mjs';

function fixture(count = 210, year = 2026) {
  return Array.from({ length: count }, (_, t) => ({
    year, No: t + 1,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) =>
      [`n${j + 1}`, (t * 17 + j * 7) % 49 + 1])),
  }));
}

function invert(row) {
  return { ...row, ...Object.fromEntries(Array.from({ length: 7 }, (_, j) =>
    [`n${j + 1}`, 50 - row[`n${j + 1}`]])) };
}

test('only the requested year is used, preserving n7 and removing identical duplicates', () => {
  const source = fixture(4);
  const { rows, audit } = normalizeRows([
    { year: 2025, No: 1, n7: 'invalid ignored year' },
    ...[...source].reverse(), source[0],
  ]);
  assert.deepEqual(rows, source);
  assert.equal(rows[0].n7, source[0].n7);
  assert.equal(audit.ignoredOtherYears, 1);
  assert.equal(audit.identicalDuplicatesRemoved, 1);
});

test('conflicting duplicates, illegal balls, and gaps fail explicitly', () => {
  const source = fixture(4);
  assert.throws(() => normalizeRows([...source, invert(source[0])]), /冲突/);
  assert.throws(() => normalizeRows([{ ...source[0], n7: source[0].n1 }]), /无效/);
  assert.throws(() => normalizeRows([{ ...source[0], n7: null }]), /无效/);
  assert.throws(() => normalizeRows([source[0], source[2]]), /缺期/);
  assert.throws(() => makeProtocol(source), /210/);
});

test('features and frequency scores cannot see the target draw or any future draws', () => {
  const source = fixture(150);
  const changed = source.map((r, i) => i >= 70 ? invert(r) : r);
  assert.deepEqual(featuresAt(source, 70), featuresAt(source.slice(0, 70), 70));
  assert.deepEqual(featuresAt(source, 70), featuresAt(changed, 70));
  assert.deepEqual(frequencyScores(source, 70, CONFIGS[0]), frequencyScores(changed, 70, CONFIGS[0]));
  assert.equal(featuresAt(source, 70).candidates.length, 49);
  assert.equal(featuresAt(source, 70).candidates[0].length, 12);
  assert.equal(featuresAt(source, 70).state.length, 98);
});

test('frequency probabilities normalize and cold numbers retain nonzero prior mass', () => {
  const rows = fixture(1);
  const scores = frequencyScores(rows, 1, CONFIGS[0]);
  assert.ok(Math.abs(scores.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(scores.every((s) => s > 0));
  assert.equal(top15(scores)[0], rows[0].n7);
});

test('logistic learns a known synthetic candidate signal in the right direction', () => {
  const model = new LogisticModel({ l2: 0.001, learningRate: 0.5 });
  const x = Array.from({ length: 49 }, (_, i) => [Number(i === 24), ...Array(11).fill(0)]);
  for (let i = 0; i < 400; i++) model.update(x, 25);
  const scores = model.scores(x);
  assert.equal(top15(scores)[0], 25);
  assert.ok(scores[24] > scores[0] * 2);
  assert.ok(scores.every((p) => p > 0 && p < 1));
});

test('KNN votes for known outcomes of closest past states', () => {
  const samples = [{ state: [1, 0], actual: 49 }, { state: [0, 1], actual: 1 }];
  const scores = knnScores([1, 0], samples, { neighbors: 2, prior: 10 });
  assert.equal(top15(scores)[0], 49);
  assert.ok(scores[48] > scores[0]);
  assert.ok(Math.abs(scores.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('Top-15 always has 15 distinct legal numbers and deterministic ties', () => {
  const scores = Array(49).fill(1);
  const picks = top15(scores);
  assert.equal(picks.length, 15);
  assert.equal(new Set(picks).size, 15);
  assert.ok(picks.every((n) => Number.isInteger(n) && n >= 1 && n <= 49));
  assert.deepEqual(top15(scores), picks);
  assert.throws(() => top15(Array(49).fill(NaN)), /有限/);
});

test('metrics use draw counts, Wilson intervals, exact binomial tails and miss streaks', () => {
  const m = metrics(Array.from({ length: 100 }, (_, i) => ({ hit: i < 30 })));
  assert.equal(m.rate, 0.3);
  assert.equal(m.longestMiss, 70);
  assert.ok(Math.abs(m.ci95[0] - 0.21895) < 0.0001);
  assert.ok(Math.abs(m.ci95[1] - 0.39585) < 0.0001);
  assert.ok(Math.abs(metrics([{ hit: false }]).pAgainstRandom - 1) < 1e-12);
  assert.ok(Math.abs(metrics([{ hit: true }, { hit: true }]).pAgainstRandom - BASE_RATE ** 2) < 1e-12);
  assert.equal(metrics([]).rate, null);
});

test('2026 split is fixed at 146 training + 60 validation + 60 final test', () => {
  const p = makeProtocol(fixture(266));
  assert.deepEqual([p.training.from, p.training.to], [1, 146]);
  assert.deepEqual([p.validation.from, p.validation.to], [147, 206]);
  assert.deepEqual([p.test.from, p.test.to], [207, 266]);
  assert.equal(p.trainingLabels.count, 116);
});

test('changing final-test outcomes cannot change selection or the first test forecast', () => {
  const source = fixture();
  const p = makeProtocol(source);
  const changed = source.map((r, i) => i >= p.test.startIndex ? invert(r) : r);
  const a = runExperiment(source, p);
  const b = runExperiment(changed, p);
  assert.equal(a.selectedId, b.selectedId);
  assert.deepEqual(a.familyWinners, b.familyWinners);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.test[0].picks, b.results[i].details.test[0].picks);
    assert.equal(r.test.count, 60);
    assert.equal(r.next.picks.length, 15);
    assert.equal(r.recentTest[2].count, 60);
  });
});
