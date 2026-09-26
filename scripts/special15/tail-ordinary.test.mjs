import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIGS, OrdinaryTailModel, runOrdinary } from './tail-ordinary.mjs';
const row = (No, n7) => ({ year: 2026, No, n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, n7 });
test('labels use previous ordinary counts and do not use same-draw normal numbers', () => {
  const m = new OrdinaryTailModel(CONFIGS[2]);
  m.update(row(1, 17));
  assert.equal(m.groups.reduce((s, g) => s + g.exposures, 0), 0);
  m.update({ ...row(2, 11), n1: 10, n2: 20, n3: 30, n4: 40 });
  assert.equal(m.groups[1 * 3 + 1].hits, 1); // tail1 appeared once in previous normals.
  assert.equal(m.groups[0].exposures, 1); // tail0 was absent previously.
  assert.equal(m.counts()[0], 4);
  assert.ok(m.scores().every((p) => p > 0));
});
test('future rows cannot affect forecasts or selection; 2025 ignored', () => {
  const rows = Array.from({ length: 266 }, (_, i) => row(i + 1, 10 + (i * 17) % 39));
  const a = runOrdinary(rows), b = runOrdinary(rows.map((r, i) => i < 206 ? r : { ...r, n1: 10, n7: 49 }));
  assert.equal(a.selectedId, b.selectedId);
  assert.deepEqual(a.results, runOrdinary([{ ...row(1, 49), year: 2025 }, ...rows]).results);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].excludedTails, b.results[i].details.evaluation[0].excludedTails);
  });
});
