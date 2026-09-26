import test from 'node:test';
import assert from 'node:assert/strict';
import { NUMBERS, BASE, colorOf, ColorModel, CONFIGS, runColors, auditMetadata } from './color-two.mjs';
const row = (No, n7) => ({ year: 2026, No, n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, n7 });
test('color partition covers49 numbers once and two-color baselines differ', () => {
  assert.equal(NUMBERS.flat().length, 49); assert.equal(new Set(NUMBERS.flat()).size, 49);
  for (let n = 1; n <= 49; n++) assert.ok(colorOf(n) >= 0);
  assert.ok(Math.abs(BASE[0] + BASE[1] - 33 / 49) < 1e-12);
  assert.ok(Math.abs(BASE[1] + BASE[2] - 32 / 49) < 1e-12);
  assert.throws(() => auditMetadata([{ ...row(1, 49), numberInfos: Array.from({ length: 7 }, (_, i) => ({ number: i + 1, color: '绿' })) }]));
});
test('transition learns a synthetic cycle, forecasts stay normalized', () => {
  const m = new ColorModel();
  for (let t = 0; t < 200; t++) m.update(row(t + 1, t % 2 ? 9 : 7));
  const scores = m.scores({ type: 'transition' });
  assert.equal(scores.indexOf(Math.max(...scores)), 0);
  for (const c of CONFIGS) assert.ok(Math.abs(m.scores(c).reduce((a, b) => a + b, 0) - 1) < 1e-12);
});
test('no current/future special or ordinary inputs enter earlier predictions;2025 ignored', () => {
  const rows = Array.from({ length: 266 }, (_, i) => row(i + 1, 10 + (i * 17) % 39));
  const a = runColors(rows), b = runColors(rows.map((r, i) => i < 206 ? r : { ...r, n1: 10, n7: 49 }));
  assert.equal(a.selectedId, b.selectedId);
  assert.deepEqual(a.results, runColors([{ ...row(1, 49), year: 2025 }, ...rows]).results);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].selectedColors, b.results[i].details.evaluation[0].selectedColors);
  });
});
