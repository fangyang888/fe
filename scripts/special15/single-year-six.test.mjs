import test from 'node:test';
import assert from 'node:assert/strict';
import { singleYearProtocol, runSingleYearSix } from './single-year-six.mjs';

function fixture(year, count) {
  return Array.from({ length: count }, (_, i) => ({ year, No: i + 1,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, (i * 17 + j * 7) % 49 + 1])) }));
}

test('266 draws keep the original 146 / 60 / 60 split', () => {
  const p = singleYearProtocol(fixture(2026, 266));
  assert.equal(p.trainEnd, 146);
  assert.equal(p.validationEnd, 206);
  assert.deepEqual([p.evaluation.from, p.evaluation.to], [207, 266]);
  assert.equal(p.training.labelCount, 116);
});

test('all models ignore prior-year data and cannot leak final-test outcomes into selection', () => {
  const rows = fixture(2026, 210), p = singleYearProtocol(rows);
  const a = runSingleYearSix(rows);
  const withOldYear = runSingleYearSix([...fixture(2025, 365), ...rows]);
  assert.deepEqual(a.results, withOldYear.results);
  assert.equal(a.selectedId, withOldYear.selectedId);
  const changed = rows.map((r, i) => i < p.validationEnd ? r : { ...r,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, 50 - r[`n${j + 1}`]])) });
  const b = runSingleYearSix(changed);
  assert.equal(a.selectedId, b.selectedId);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].excluded6, b.results[i].details.evaluation[0].excluded6);
    assert.equal(r.evaluation.count, 60);
    assert.equal(r.evaluation.baseline, 43 / 49);
    assert.equal(new Set(r.next.excluded6).size, 6);
  });
  assert.equal(a.results.length, 16);
});
