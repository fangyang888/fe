import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceVector, cosine, findAnalogues, predictSequence, SEQUENCE_CONFIGS } from './sequence-similarity.mjs';

const row = (numbers, No = 1) => ({ year: 2026, No, ...Object.fromEntries(numbers.map((n, i) => [`n${i + 1}`, n])) });
const a = row([1, 2, 3, 4, 5, 6, 7]), b = row([11, 12, 13, 14, 15, 16, 17]);
const config = { ...SEQUENCE_CONFIGS[0], length: 2 };

test('sequence encoding has unit norm and preserves draw order', () => {
  const forward = sequenceVector([a, b], 2, config), reversed = sequenceVector([b, a], 2, config);
  assert.equal(forward.length, 196);
  assert.ok(Math.abs([...forward].reduce((sum, x) => sum + x * x, 0) - 1) < 1e-12);
  assert.ok(Math.abs(cosine(forward, forward) - 1) < 1e-12);
  assert.equal(cosine(forward, reversed), 0);
  assert.deepEqual(sequenceVector([row([6, 5, 4, 3, 2, 1, 7]), b], 2, config), forward);
});

test('future rows never enter query or neighbour outcomes, and neighbour spans are disjoint', () => {
  const rows = Array.from({ length: 160 }, (_, t) => row(Array.from({ length: 7 }, (_, j) => (t * 17 + j * 7) % 49 + 1), t + 1));
  const c = SEQUENCE_CONFIGS[0], t = 140;
  const neighbours = findAnalogues(rows, t, c);
  assert.ok(neighbours.every((n) => n.nextPeriod < t - c.length + 1));
  neighbours.forEach((n, i) => neighbours.slice(i + 1).forEach((m) =>
    assert.ok(n.nextPeriod < m.from || m.nextPeriod < n.from)));
  const original = predictSequence(rows, t, c);
  const changed = rows.map((r, i) => i < t ? r : row([1, 2, 3, 4, 5, 6, 49], r.No));
  assert.deepEqual(predictSequence(changed, t, c), original);
  assert.deepEqual(predictSequence(rows.slice(0, t), t, c), original);
  assert.equal(new Set(original.excluded6).size, 6);
  assert.ok(original.excluded6.every((n) => original.pool20.includes(n)));
  assert.ok(Math.abs(original.scores.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
  assert.ok(original.scores.every((p) => p > 0));
});
