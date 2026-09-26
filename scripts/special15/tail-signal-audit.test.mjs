import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, shuffle, syntheticRows, frequencyStatistic, serialStatistic, evaluateFamily, mcTail } from './tail-signal-audit.mjs';
test('seeded valid null rows reproduce exactly and permutation preserves margins', () => {
  const a = syntheticRows(rng(42)), b = syntheticRows(rng(42));
  assert.deepEqual(a, b);
  for (const r of a) assert.equal(new Set(Array.from({ length: 7 }, (_, i) => r[`n${i + 1}`])).size, 7);
  const tails = a.map((r) => r.n7 % 10), permuted = shuffle(tails, rng(100));
  assert.deepEqual(frequencyStatistic(tails), frequencyStatistic(permuted));
  assert.notDeepEqual(tails, permuted);
});
test('frequency baseline includes four zero-tail numbers and MI detects a constructed cycle', () => {
  const complete = Array.from({ length: 49 }, (_, i) => (i + 1) % 10);
  assert.ok(frequencyStatistic(complete).statistic < 1e-20);
  const cycle = Array.from({ length: 266 }, (_, i) => i % 10);
  assert.ok(serialStatistic(cycle).statistic > serialStatistic(shuffle(cycle, rng(42))).statistic);
  assert.equal(mcTail([1, 2, 3], 3).probability, 0.5);
});
test('family selection ignores evaluation labels and contains thirteen distinct rules', () => {
  const rows = syntheticRows(rng(101)), a = evaluateFamily(rows);
  const b = evaluateFamily([...rows.slice(0, 206), ...syntheticRows(rng(102)).slice(206)]);
  assert.equal(a.results.length, 13);
  assert.equal(new Set(a.results.map((r) => r.id)).size, 13);
  assert.equal(a.selectedId, b.selectedId);
  assert.deepEqual(a.results.map((r) => r.validation), b.results.map((r) => r.validation));
});
