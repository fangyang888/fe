import test from 'node:test';
import assert from 'node:assert/strict';
import { combine, CONFIGS, runAdaptive } from './tail-adaptive.mjs';
import { runOptimization } from './tail-optimize.mjs';
const row = (No, n7) => ({ year: 2026, No, n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, n7 });

test('weights favor fewer historical failures and rolling selection forgets older losses', () => {
  const scores = [Array(10).fill(0.1), Array(10).fill(0.1)];
  const weighted = combine(scores, [[0, 0, 0], [1, 1, 1]], CONFIGS[3]);
  assert.ok(weighted.weights[0] > weighted.weights[1]);
  assert.ok(Math.abs(weighted.weights.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  const rolling = combine(scores, [[1, 1, 0], [0, 0, 1]], { type: 'best', window: 1 });
  assert.deepEqual(rolling.weights, [1, 0]);
});

test('incumbent is preserved and current/future outcomes cannot affect forecasts or selection', () => {
  const rows = Array.from({ length: 266 }, (_, i) => row(i + 1, 10 + (i * 17) % 39));
  const a = runAdaptive(rows), b = runAdaptive(rows.map((r, i) => i < 206 ? r : { ...r, n7: 49 }));
  assert.equal(a.selectedId, b.selectedId);
  assert.deepEqual(a.results, runAdaptive([{ ...row(1, 49), year: 2025 }, ...rows]).results);
  const original = runOptimization(rows).results.find((r) => r.id === 'gap-prior20');
  for (const split of ['validation', 'evaluation']) assert.deepEqual(a.results[0].details[split].map(({ weights, ...rest }) => rest), original.details[split]);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    for (const field of ['excludedTails', 'weights']) assert.deepEqual(r.details.evaluation[0][field], b.results[i].details.evaluation[0][field]);
  });
});
