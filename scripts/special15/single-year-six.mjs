import assert from 'node:assert/strict';
import { CONFIGS, normalizeRows, featuresAt } from './model.mjs';
import { EXTRA_CONFIGS, runExpanded } from './expanded-models.mjs';
import { TARGET_CONFIGS, DirectSixRanker, ListwiseMLP, sixStats } from './target-six.mjs';
import { selectExclusions } from './exclusion.mjs';

export function singleYearProtocol(rows) {
  assert.ok(rows.length >= 210, '至少需要210期同年度连续数据');
  assert.ok(rows.every((r) => r.year === 2026));
  const trainEnd = rows.length - 120, validationEnd = rows.length - 60;
  return { year: 2026, warmup: 30, trainEnd, validationEnd,
    training: { from: rows[0].No, to: rows[trainEnd - 1].No, count: trainEnd, labelCount: trainEnd - 30 },
    validation: { from: rows[trainEnd].No, to: rows[validationEnd - 1].No, count: 60 },
    evaluation: { from: rows[validationEnd].No, to: rows.at(-1).No, count: 60 },
    baseConfigs: [...CONFIGS, ...EXTRA_CONFIGS], targetConfigs: TARGET_CONFIGS,
    selection: 'Highest 2026 validation group success count for six exclusions. Ties follow original configuration declaration order; no evaluation-based reselection.',
    updatePolicy: 'Same fixed hyperparameters as previous experiments. Predict before consuming each result. All warmup, initialization, training, features and online updates use 2026 only.',
    caveat: 'Exploratory re-use of already examined 2026 outcomes; not a fresh independent test.' };
}

function runTargetYear(rows, p) {
  const features = Array.from({ length: rows.length + 1 }, (_, t) => t >= p.warmup ? featuresAt(rows, t).candidates : null);
  const runners = p.targetConfigs.map((config) => {
    const model = config.family === 'rank' ? new DirectSixRanker(config) : new ListwiseMLP(config);
    for (let epoch = 0; epoch < config.epochs; epoch++) {
      for (let t = p.warmup; t < p.trainEnd; t++) model.update(features[t], rows[t].n7);
    }
    return { config, model, validation: [], evaluation: [], next: null };
  });
  for (const offset of [1, 2]) runners.push({ config: { id: offset === 1 ? 'previous-normal-six' : 'previous-last-six',
    family: 'rule', offset }, model: null, validation: [], evaluation: [], next: null });
  for (let t = p.trainEnd; t <= rows.length; t++) {
    for (const r of runners) {
      const previousSix = r.model ? null : Array.from({ length: 6 }, (_, i) => rows[t - 1][`n${i + r.config.offset}`]);
      const scores = r.model ? r.model.scores(features[t]) : Array.from({ length: 49 }, (_, i) => previousSix.includes(i + 1) ? 0 : 1);
      const { pool20, excluded10 } = selectExclusions(scores), excluded6 = excluded10.slice(0, 6);
      if (t === rows.length) r.next = { after: { year: 2026, No: rows.at(-1).No }, pool20, excluded6,
        ascending6: [...excluded6].sort((a, b) => a - b) };
      else {
        r[t < p.validationEnd ? 'validation' : 'evaluation'].push({ year: 2026, No: rows[t].No,
          actual: rows[t].n7, pool20, excluded6, success6: !excluded6.includes(rows[t].n7) });
        if (r.model) r.model.update(features[t], rows[t].n7);
      }
    }
  }
  return runners.map((r) => ({ id: r.config.id, family: r.config.family, config: r.config,
    details: { validation: r.validation, evaluation: r.evaluation }, next: r.next }));
}

export function runSingleYearSix(input) {
  // Filter FIRST: no features, pretraining, or state from any other year survive.
  const { rows, audit } = normalizeRows(input, 2026);
  const protocol = singleYearProtocol(rows);
  const base = runExpanded(rows, { ...protocol, configs: protocol.baseConfigs });
  // Do NOT reuse runExpanded's exclude-10 winner; the objective here is exclude-6.
  const converted = base.results.map((r) => {
    const convert = (details) => details.map((d) => {
      const excluded6 = d.excluded10.slice(0, 6);
      return { year: d.year, No: d.No, actual: d.actual, pool20: d.pool20,
        excluded6, success6: !excluded6.includes(d.actual) };
    });
    const excluded6 = r.next.excluded10.slice(0, 6);
    return { id: r.id, family: r.family, config: r.config,
      details: { validation: convert(r.details.validation), evaluation: convert(r.details.evaluation) },
      next: { after: r.next.after, pool20: r.next.pool20, excluded6, ascending6: [...excluded6].sort((a, b) => a - b) } };
  });
  const candidates = [...converted, ...runTargetYear(rows, protocol)];
  const selectedId = [...candidates].sort((a, b) =>
    b.details.validation.filter((r) => r.success6).length - a.details.validation.filter((r) => r.success6).length)[0].id;
  const results = candidates.map((r) => ({ ...r, validation: sixStats(r.details.validation),
    evaluation: sixStats(r.details.evaluation),
    recent: [20, 50, 100].map((requested) => ({ requested, ...sixStats(r.details.evaluation.slice(-requested)) })) }));
  return { protocol, audit, selectedId, results };
}
