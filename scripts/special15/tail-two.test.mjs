import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, TailModel, CONFIGS, nullSuccess, runTails } from './tail-two.mjs';
const row = (No, special) => ({ year: 2026, No, ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`n${i + 1}`, i + 1])), n7: special });

test('two tails exclude nine or ten numbers; zero-tail prior is smaller', () => {
  assert.ok(Math.abs(nullSuccess([0, 1]) - 40 / 49) < 1e-12);
  assert.ok(Math.abs(nullSuccess([1, 2]) - 39 / 49) < 1e-12);
  assert.equal(BASE[0], 4 / 49);
  assert.ok(Math.abs(BASE.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('gap and transition counts use previous state, and learn synthetic alternating tails', () => {
  const m = new TailModel();
  m.update(row(1, 17));
  m.update(row(2, 18));
  assert.equal(m.edges[7][8], 1);
  assert.equal(m.hits[8][6], 1);
  assert.equal(m.exposures[7][0], 1);
  assert.equal(m.hits[7][0], 0);
  for (let i = 2; i < 200; i++) m.update(row(i + 1, i % 2 ? 18 : 17));
  const scores = m.scores({ type: 'transition' });
  assert.equal(scores.indexOf(Math.max(...scores)), 7);
  for (const c of CONFIGS.filter((c) => ['frequency', 'hazard', 'transition', 'consensus'].includes(c.type))) {
    const s = m.scores(c);
    assert.ok(s.every((v) => v > 0));
    assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  }
});

test('future outcomes cannot change validation or first evaluation forecast; other years ignored', () => {
  const rows = Array.from({ length: 266 }, (_, i) => row(i + 1, 10 + i % 39));
  const a = runTails(rows), b = runTails(rows.map((r, i) => i < 206 ? r : { ...r, n7: 49 }));
  const mixed = runTails([{ ...row(1, 49), year: 2025 }, ...rows]);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].excludedTails, b.results[i].details.evaluation[0].excludedTails);
    assert.deepEqual(r, mixed.results[i]);
  });
  assert.equal(a.selectedId, b.selectedId);
});
