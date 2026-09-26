import assert from 'node:assert/strict';
import {
  featuresAt, frequencyScores, LogisticModel, knnScores, top15, metrics,
} from './model.mjs';

// Same label-independent tie order as the original forecast, verified on replay.
function tieValue(n) {
  let x = Math.imul(n, 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function selectExclusions(scores) {
  assert.equal(scores.length, 49);
  assert.ok(scores.every(Number.isFinite));
  const ranking = scores.map((score, i) => ({ number: i + 1, score }))
    .sort((a, b) => b.score - a.score || tieValue(a.number) - tieValue(b.number))
    .map((r) => r.number);
  assert.deepEqual(ranking.slice(0, 15), top15(scores));
  const pool20 = ranking.slice(-20).reverse();
  const excluded10 = pool20.slice(0, 10);
  return { pool20, excluded10 };
}

function binomialTail(hits, n, p) {
  let logChoose = 0, tail = 0;
  for (let k = 0; k <= n; k++) {
    if (k >= hits) tail += Math.exp(logChoose + k * Math.log(p) + (n - k) * Math.log1p(-p));
    if (k < n) logChoose += Math.log(n - k) - Math.log(k + 1);
  }
  return Math.min(1, tail);
}

export function exclusionMetrics(details, size) {
  assert.ok(size === 10 || size === 20);
  const key = size === 10 ? 'excluded10' : 'pool20';
  const outcomes = details.map((r) => {
    assert.equal(r[key].length, size);
    assert.equal(new Set(r[key]).size, size);
    return { hit: !r[key].includes(r.actual) };
  });
  // Reuse the Wilson/streak calculation, explicitly replace its Top-15 null probability.
  const { pAgainstRandom: _unused, hits: successes, longestMiss: longestFailure, ...base } = metrics(outcomes);
  const baseline = (49 - size) / 49;
  return { ...base, size, successes, failures: base.count - successes, longestFailure,
    baseline, excess: base.count ? base.rate - baseline : null,
    pAgainstRandom: base.count ? binomialTail(successes, base.count, baseline) : null };
}

export function replayExclusions(rows, previous) {
  const p = previous.protocol;
  assert.ok(rows.every((r) => r.year === 2026));
  const start = p.validation.startIndex, testStart = p.test.startIndex;
  const features = Array.from({ length: rows.length + 1 }, (_, t) => t >= p.warmup ? featuresAt(rows, t) : null);
  const results = p.configs.map((config) => {
    const model = config.family === 'logistic' ? new LogisticModel(config) : null;
    const samples = [];
    if (model) {
      for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (let t = p.warmup; t < start; t++) model.update(features[t].candidates, rows[t].n7);
      }
    }
    if (config.family === 'knn') {
      for (let t = p.warmup; t < start; t++) samples.push({ state: features[t].state, actual: rows[t].n7 });
    }
    const original = previous.results.find((r) => r.id === config.id);
    const details = { validation: [], test: [] };
    let next;
    for (let t = start; t <= rows.length; t++) {
      const scores = model ? model.scores(features[t].candidates)
        : config.family === 'knn' ? knnScores(features[t].state, samples, config)
          : frequencyScores(rows, t, config);
      const selection = selectExclusions(scores);
      if (t === rows.length) {
        assert.deepEqual(top15(scores), original.next.picks);
        next = { after: { year: rows.at(-1).year, No: rows.at(-1).No }, ...selection,
          ascending10: [...selection.excluded10].sort((a, b) => a - b),
          scoreMeaning: '分数用于排序；不是已校准的排除成功概率' };
        break;
      }
      const split = t < testStart ? 'validation' : 'test';
      // Every original forecast must be reproduced exactly; do not retune the model.
      assert.deepEqual(top15(scores), original.details[split][details[split].length].picks);
      details[split].push({ year: rows[t].year, No: rows[t].No, actual: rows[t].n7,
        ...selection, success20: !selection.pool20.includes(rows[t].n7),
        success10: !selection.excluded10.includes(rows[t].n7) });
      if (model) model.update(features[t].candidates, rows[t].n7);
      if (config.family === 'knn') samples.push({ state: features[t].state, actual: rows[t].n7 });
    }
    return { id: config.id, family: config.family, next, details };
  });
  // Only validation labels select a configuration. Final-test scores cannot select it.
  const selectedId = [...results].sort((a, b) =>
    exclusionMetrics(b.details.validation, 10).successes - exclusionMetrics(a.details.validation, 10).successes)[0].id;
  return {
    selectedId,
    results: results.map((r) => ({ ...r,
      validation: { stage20: exclusionMetrics(r.details.validation, 20), final10: exclusionMetrics(r.details.validation, 10) },
      test: { stage20: exclusionMetrics(r.details.test, 20), final10: exclusionMetrics(r.details.test, 10),
        rescuedByReduction: r.details.test.filter((d) => !d.success20 && d.success10).length },
    })),
  };
}
