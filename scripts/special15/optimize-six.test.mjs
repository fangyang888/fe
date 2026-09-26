import test from 'node:test';
import assert from 'node:assert/strict';
import { AveragedRanker, runOptimization } from './optimize-six.mjs';
import { DirectSixRanker, TARGET_CONFIGS } from './target-six.mjs';

function fixture() {
  return Array.from({ length: 266 }, (_, t) => ({ year: 2026, No: t + 1,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, (t * 17 + j * 7) % 49 + 1])) }));
}

test('averaging changes inference weights by the specified exponential formula', () => {
  const x = Array.from({ length: 49 }, (_, i) => [Number(i === 24), ...Array(11).fill(0)]);
  const avg = new AveragedRanker(0.5);
  const raw = new DirectSixRanker(TARGET_CONFIGS.find((c) => c.id === 'direct-rank-c0.2'));
  raw.update(x, 25); avg.update(x, 25);
  assert.deepEqual(avg.average, raw.weights.map((w) => w / 2));
  const previous = [...avg.average];
  raw.update(x, 25); avg.update(x, 25);
  assert.deepEqual(avg.average, raw.weights.map((w, i) => 0.5 * previous[i] + 0.5 * w));
});

test('no other year or final-test outcomes enter model selection or earlier predictions', () => {
  const rows = fixture();
  const a = runOptimization(rows);
  const changed = rows.map((r, i) => i < 206 ? r : { ...r,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, 50 - r[`n${j + 1}`]])) });
  const b = runOptimization([{ year: 2025, No: 1, n7: 'ignored' }, ...changed]);
  assert.equal(a.selectedId, b.selectedId);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].excluded6, b.results[i].details.evaluation[0].excluded6);
    assert.equal(r.evaluation.count, 60);
    assert.equal(r.forward.count, 0);
  });
  const windows = a.results.find((r) => r.id === 'window-100').fitWindows;
  assert.deepEqual(windows.map((w) => w.forecastPeriod), [147, 167, 187, 207, 227, 247, 267]);
  assert.ok(windows.every((w) => w.labels === 100 && w.lastLabel < w.forecastPeriod));
});
