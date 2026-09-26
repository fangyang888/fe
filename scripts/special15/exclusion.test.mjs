import test from 'node:test';
import assert from 'node:assert/strict';
import { selectExclusions, exclusionMetrics } from './exclusion.mjs';

test('20 -> 10 selects a unique nested lowest-scoring subset', () => {
  const s = selectExclusions(Array.from({ length: 49 }, (_, i) => i));
  assert.deepEqual(s.pool20, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.deepEqual(s.excluded10, Array.from({ length: 10 }, (_, i) => i + 1));
  assert.ok(s.excluded10.every((n) => s.pool20.includes(n)));
  assert.equal(new Set(selectExclusions(Array(49).fill(1)).excluded10).size, 10);
});

test('group success distinguishes rescued reduction from individual-number averages', () => {
  const selection = selectExclusions(Array.from({ length: 49 }, (_, i) => i));
  const rows = [1, 11, 21].map((actual) => ({ actual, ...selection }));
  const a = exclusionMetrics(rows, 20), b = exclusionMetrics(rows, 10);
  assert.equal(a.successes, 1);
  assert.equal(b.successes, 2);
  assert.equal(a.baseline, 29 / 49);
  assert.equal(b.baseline, 39 / 49);
  assert.equal(b.failures, 1);
});

test('probability tests use the exclusion baseline, not the old Top-15 baseline', () => {
  const selection = selectExclusions(Array.from({ length: 49 }, (_, i) => i));
  const rows = [{ actual: 49, ...selection }, { actual: 48, ...selection }];
  assert.ok(Math.abs(exclusionMetrics(rows, 10).pAgainstRandom - (39 / 49) ** 2) < 1e-12);
  assert.ok(Math.abs(exclusionMetrics(rows, 20).pAgainstRandom - (29 / 49) ** 2) < 1e-12);
  assert.equal(exclusionMetrics([], 10).rate, null);
});
