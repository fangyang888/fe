import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectSixRanker, ListwiseMLP, TARGET_CONFIGS, runTargetSix, sixStats } from './target-six.mjs';
import { selectExclusions } from './exclusion.mjs';

function fixture(year, count) {
  return Array.from({ length: count }, (_, t) => ({ year, No: t + 1,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, (t * 17 + j * 7) % 49 + 1])) }));
}
const signal = Array.from({ length: 49 }, (_, n) => [Number(n === 24), ...Array(11).fill(0)]);

test('direct rank update pushes a known positive above the six-exclusion boundary', () => {
  const model = new DirectSixRanker(TARGET_CONFIGS[0]);
  for (let i = 0; i < 10; i++) model.update(signal, 25);
  assert.ok(model.scores(signal)[24] > model.scores(signal)[0]);
  assert.ok(!selectExclusions(model.scores(signal)).excluded10.slice(0, 6).includes(25));
});

test('neural gradients match finite differences for weights and hidden biases', () => {
  const model = new ListwiseMLP(TARGET_CONFIGS[2]);
  const x = Array.from({ length: 49 }, (_, n) => Array.from({ length: 12 }, (_, j) => Math.sin(n + j * 3) / 3));
  const g = model.gradients(x, 25), eps = 1e-5;
  const check = (array, i, expected) => {
    const old = array[i];
    array[i] = old + eps; const plus = -Math.log(model.forward(x).probabilities[24]);
    array[i] = old - eps; const minus = -Math.log(model.forward(x).probabilities[24]);
    array[i] = old;
    assert.ok(Math.abs((plus - minus) / (2 * eps) - expected) < 1e-7);
  };
  check(model.w[2], 4, g.dw[2][4]);
  check(model.v, 3, g.dv[3]);
  check(model.b, 1, g.db[1]);
});

test('listwise softmax probabilities sum to one and learn a synthetic signal', () => {
  const a = new ListwiseMLP(TARGET_CONFIGS[2]), b = new ListwiseMLP(TARGET_CONFIGS[2]);
  assert.deepEqual(a.scores(signal), b.scores(signal));
  for (let i = 0; i < 300; i++) a.update(signal, 25);
  const p = a.forward(signal).probabilities;
  assert.ok(Math.abs(p.reduce((s, x) => s + x) - 1) < 1e-12);
  assert.ok(p[24] > p[0] * 3);
});

test('six exclusion statistics use the 43/49 null probability', () => {
  assert.ok(Math.abs(sixStats([{ success6: true }, { success6: true }]).pAgainstRandom - (43 / 49) ** 2) < 1e-12);
});

test('future outcomes cannot change validation or first-2026 forecasts', () => {
  const rows = [...fixture(2025, 365), ...fixture(2026, 3)];
  const changed = rows.map((r) => r.year === 2025 ? r : { ...r,
    ...Object.fromEntries(Array.from({ length: 7 }, (_, j) => [`n${j + 1}`, 50 - r[`n${j + 1}`]])) });
  const a = runTargetSix(rows), b = runTargetSix(changed);
  assert.equal(a.selectedNewId, b.selectedNewId);
  a.results.forEach((r, i) => {
    assert.deepEqual(r.details.validation, b.results[i].details.validation);
    assert.deepEqual(r.details.evaluation[0].excluded6, b.results[i].details.evaluation[0].excluded6);
  });
});
