import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIGS, GapModel, runOptimization } from './tail-optimize.mjs';
import { TailModel, BASE } from './tail-two.mjs';
const row = (No, special) => ({ year: 2026, No, ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`n${i + 1}`, i + 1])), n7: special });

test('original gap model is reproduced exactly before each update', () => {
  const old = new TailModel(), current = new GapModel(CONFIGS[1]);
  for (let t = 0; t < 300; t++) {
    assert.deepEqual(current.scores(), old.scores({ type: 'hazard' }));
    const r = row(t + 1, 10 + (t * 17) % 39);
    old.update(r); current.update(r);
  }
});

test('unknown gaps are separate, decayed exposures remain bounded, priors remain nonzero', () => {
  const m = new GapModel(CONFIGS.at(-1));
  assert.equal(m.bin(0), m.config.bounds.length);
  m.update(row(1, 10));
  assert.equal(m.bin(0), 0);
  for (let t = 1; t < 1000; t++) m.update(row(t + 1, 10));
  const total = m.exposures[0].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1 / (1 - m.config.decay)) < 1e-6);
  assert.ok(m.scores().every((p) => p > 0));
  assert.ok(Math.abs(m.scores().reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('future labels cannot change forecasts or selection and other years are ignored', () => {
  const rows = Array.from({ length: 266 }, (_, i) => row(i + 1, 10 + (i * 17) % 39));
  const a = runOptimization(rows), b = runOptimization(rows.map((r, i) => i < 206 ? r : { ...r, n7: 49 }));
  assert.equal(a.selectedId, b.selectedId);
  assert.deepEqual(a.results, runOptimization([{ ...row(1, 49), year: 2025 }, ...rows]).results);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].excludedTails, b.results[i].details.evaluation[0].excludedTails);
  });
});
