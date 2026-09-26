import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTwoYears, makeExpandedProtocol, ShrunkMarkov, GapHazard,
  BoostedStumps, consensusSelection, runExpanded, EXTRA_CONFIGS } from './expanded-models.mjs';

function fixture(year, count) {
  return Array.from({ length: count }, (_, t) => ({ year, No: t + 1,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, (t * 17 + j * 7) % 49 + 1])) }));
}

test('two-year normalization includes 2025 context, excludes 2024 and checks completeness', () => {
  const source = [...fixture(2024, 5), ...fixture(2025, 365), ...fixture(2026, 12)];
  const { rows, audit } = normalizeTwoYears([...source].reverse());
  assert.equal(rows.length, 377);
  assert.deepEqual([rows[0].year, rows[364].No, rows[365].year, rows[365].No], [2025, 365, 2026, 1]);
  assert.equal(audit.ignoredOtherYears, 5);
  assert.throws(() => normalizeTwoYears([...fixture(2025, 364), ...fixture(2026, 1)]), /365/);
});

test('smoothed Markov learns an observed transition without assigning zero probabilities', () => {
  const model = new ShrunkMarkov(50);
  for (let i = 0; i < 201; i++) model.update(i % 2 + 1);
  const scores = model.scores();
  assert.ok(scores[1] > scores[0]);
  assert.ok(scores.every((x) => x > 0));
  assert.ok(Math.abs(scores.reduce((a, b) => a + b) - 1) < 1e-12);
});

test('hazard exposure is recorded before the revealed result and unknown gaps stay separate', () => {
  const model = new GapHazard();
  assert.equal(model.bin(0), 7);
  model.update(1);
  assert.equal(model.bin(0), 0);
  assert.equal(model.bin(1), 7);
  assert.equal(model.pooledExposures[7], 49);
  assert.equal(model.pooledHits[7], 1);
  model.update(2);
  assert.equal(model.bin(0), 1);
  assert.equal(model.hits[1][7], 1);
  const scores = model.scores();
  assert.ok(scores.every((p) => Number.isFinite(p) && p > 0));
  assert.ok(Math.abs(scores.reduce((a, b) => a + b) - 1) < 1e-12);
});

test('boosted stumps learn a synthetic binary feature signal and refitting resets state', () => {
  const config = { ...EXTRA_CONFIGS.find((c) => c.family === 'boosting'), minLeaf: 5, l2: 1, rounds: 12 };
  const model = new BoostedStumps(config);
  const candidates = Array.from({ length: 49 }, (_, n) => [Number(n === 24), ...Array(11).fill(0)]);
  const samples = Array.from({ length: 30 }, () => ({ candidates, actual: 25 }));
  model.fit(samples);
  const scores = model.scores(candidates);
  assert.ok(model.trees.length > 0 && model.trees.length <= 12);
  assert.ok(scores[24] > scores[0] * 3);
  model.fit(samples);
  assert.deepEqual(model.scores(candidates), scores);
});

test('consensus keeps ten inside its twenty and avoids a member warning within the pool', () => {
  const a = Array.from({ length: 49 }, (_, i) => i);
  const b = [...a]; b[0] = 100;
  const s = consensusSelection([a, a, b]);
  assert.equal(new Set(s.pool20).size, 20);
  assert.equal(new Set(s.excluded10).size, 10);
  assert.ok(s.excluded10.every((n) => s.pool20.includes(n)));
  assert.ok(s.pool20.includes(1));
  assert.ok(!s.excluded10.includes(1));
});

test('2026 outcomes cannot alter 2025 selection, past forecasts or the first 2026 prediction', () => {
  const rows = [...fixture(2025, 365), ...fixture(2026, 12)];
  const altered = rows.map((r) => r.year === 2025 ? r : ({ ...r,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, 50 - r[`n${j + 1}`]])) }));
  const protocol = makeExpandedProtocol(rows);
  const a = runExpanded(rows, protocol), b = runExpanded(altered, protocol);
  assert.equal(a.selectedId, b.selectedId);
  a.results.forEach((result, i) => {
    assert.deepEqual(result.details.validation, b.results[i].details.validation);
    assert.deepEqual(result.details.evaluation[0].excluded10, b.results[i].details.evaluation[0].excluded10);
    assert.deepEqual(result.details.evaluation[0].pool20, b.results[i].details.evaluation[0].pool20);
    assert.equal(result.evaluation.final10.count, 12);
  });
});
