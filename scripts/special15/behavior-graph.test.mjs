import test from 'node:test';
import assert from 'node:assert/strict';
import { TrajectoryModel, TransitionGraph, BEHAVIOR_CONFIGS, runBehaviors } from './behavior-graph.mjs';

const row = (numbers, No = 1) => ({ year: 2026, No, ...Object.fromEntries(numbers.map((n, i) => [`n${i + 1}`, n])) });
const a = row([1, 2, 3, 4, 5, 6, 7]), b = row([11, 12, 13, 14, 15, 16, 17]);

test('trajectory labels belong to the preceding pattern, with sparse prior and bounded masks', () => {
  const m = new TrajectoryModel({ ...BEHAVIOR_CONFIGS[0], length: 1 });
  assert.ok(m.scores().every((v) => Math.abs(v - 1 / 49) < 1e-15));
  m.update(a);
  assert.equal(m.states.size, 0);
  m.update(b);
  assert.equal(m.states.get(0).hits, 1); // 17 was absent in a.
  assert.equal(m.states.get(1).hits, 0); // 7 was the special in a.
  assert.equal([...m.states.values()].reduce((s, v) => s + v.exposures, 0), 49);
  assert.equal(m.normal[0], 0);
  assert.equal(m.normal[10], 1);
});

test('cross-draw graph learns known synthetic transitions and normalizes', () => {
  for (const c of BEHAVIOR_CONFIGS.filter((c) => c.family === 'graph')) {
    const m = new TransitionGraph(c);
    for (let t = 0; t < 200; t++) m.update(t % 2 ? b : a);
    const s = m.scores(); // Latest b; next synthetic special is 7.
    assert.equal(s.indexOf(Math.max(...s)) + 1, 7);
    assert.ok(s[6] > s[16]);
    assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    assert.ok(s.every((p) => p > 0));
  }
});

test('current and future labels do not affect earlier predictions, and 2025 is ignored', () => {
  const rows = Array.from({ length: 266 }, (_, t) => row(Array.from({ length: 7 }, (_, j) => (t * 17 + j * 7) % 49 + 1), t + 1));
  const original = runBehaviors(rows);
  const changed = runBehaviors(rows.map((r, i) => i < 206 ? r : row([1, 2, 3, 4, 5, 6, 49], r.No)));
  const mixed = runBehaviors([{ ...a, year: 2025 }, ...rows]);
  original.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, changed.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].excluded6, changed.results[i].details.evaluation[0].excluded6);
    assert.deepEqual(r, mixed.results[i]);
  });
});
