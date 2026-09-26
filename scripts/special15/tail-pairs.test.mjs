import test from 'node:test';
import assert from 'node:assert/strict';
import { PAIRS, CONFIGS, PairModel, pairBase, selectPair, runPairs } from './tail-pairs.mjs';
import { runOptimization } from './tail-optimize.mjs';
const row = (No, n7) => ({ year: 2026, No, n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, n7 });

test('45 distinct pairs; pair frequencies are exactly additive, not independent events', () => {
  assert.equal(PAIRS.length, 45);
  assert.equal(new Set(PAIRS.map((p) => p.join(','))).size, 45);
  assert.ok(Math.abs(pairBase([0, 1]) - 9 / 49) < 1e-12);
  assert.ok(Math.abs(pairBase([1, 2]) - 10 / 49) < 1e-12);
  const m = new PairModel(CONFIGS[1]);
  for (let t = 0; t < 130; t++) m.update(row(t + 1, 10 + t % 39));
  const marginal = m.marginal(100), scores = m.scores();
  PAIRS.forEach(([a, b], i) => assert.equal(scores[i], marginal[a] + marginal[b]));
  const sorted = [...marginal].sort((a, b) => a - b);
  assert.ok(Math.abs(selectPair(scores).score - sorted[0] - sorted[1]) < 1e-12);
});

test('shared groups use pre-outcome gaps and one draw-weight per occupied group', () => {
  const m = new PairModel(CONFIGS[3]);
  m.update(row(1, 10));
  assert.equal(m.groups[3].draws, 1);
  assert.equal(m.groups[3].hits, 1); // all never-seen zero-containing pairs hit tail0
  assert.equal(m.groups[7].draws, 1);
  assert.equal(m.groups[7].hits, 0);
  assert.equal(m.groups.reduce((s, g) => s + g.draws, 0), 2); // not45 independent trials
  assert.equal(m.gap([0, 1]), 0);
  assert.equal(m.gap([1, 2]), -1);
  m.update(row(2, 11));
  assert.equal(m.groups[0].draws, 1);
  assert.ok(Math.abs(m.groups[0].hits - 1 / 9) < 1e-12);
  assert.ok(m.scores().every((s) => s > 0 && s < 1));
});

test('future labels and other years cannot change earlier predictions; incumbent reproduced', () => {
  const rows = Array.from({ length: 266 }, (_, i) => row(i + 1, 10 + (i * 17) % 39));
  const a = runPairs(rows), b = runPairs(rows.map((r, i) => i < 206 ? r : { ...r, n7: 49 }));
  assert.equal(a.selectedId, b.selectedId);
  assert.deepEqual(a.results, runPairs([{ ...row(1, 49), year: 2025 }, ...rows]).results);
  assert.deepEqual(a.results[0].details, runOptimization(rows).results.find((r) => r.id === 'gap-prior20').details);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].excludedTails, b.results[i].details.evaluation[0].excludedTails);
  });
});
