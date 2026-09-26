import assert from 'node:assert/strict';
import { featuresAt, metrics } from './model.mjs';
import { selectExclusions } from './exclusion.mjs';

export const TARGET_CONFIGS = [
  { id: 'direct-rank-c0.05', family: 'rank', cap: 0.05, margin: 0.1, decay: 0.001, epochs: 20 },
  { id: 'direct-rank-c0.2', family: 'rank', cap: 0.2, margin: 0.1, decay: 0.001, epochs: 20 },
  { id: 'listwise-mlp-8', family: 'mlp', hidden: 8, seed: 42, learningRate: 0.03, l2: 0.01, epochs: 30 },
  { id: 'listwise-mlp-16', family: 'mlp', hidden: 16, seed: 42, learningRate: 0.03, l2: 0.01, epochs: 30 },
];

export class DirectSixRanker {
  constructor(config) { this.config = config; this.weights = Array(12).fill(0); }
  scores(x) { return x.map((row) => row.reduce((sum, v, j) => sum + v * this.weights[j], 0)); }
  update(x, actual) {
    this.weights = this.weights.map((w) => w * (1 - this.config.decay));
    const scores = this.scores(x);
    // If the true number scores above the sixth-lowest OTHER number,
    // it lies outside the six exclusions (up to ties). PA-inspired capped update.
    const boundary = selectExclusions(scores).pool20.filter((n) => n !== actual)[5];
    const loss = Math.max(0, this.config.margin + scores[boundary - 1] - scores[actual - 1]);
    const dx = x[actual - 1].map((v, j) => v - x[boundary - 1][j]);
    const norm2 = dx.reduce((sum, v) => sum + v * v, 0);
    if (loss === 0 || norm2 < 1e-12) return;
    const step = Math.min(this.config.cap, loss / norm2);
    this.weights = this.weights.map((w, j) => w + step * dx[j]);
  }
}

export class ListwiseMLP {
  constructor(config) {
    this.config = config;
    let state = config.seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    this.w = Array.from({ length: config.hidden }, () => Array.from({ length: 12 }, () => (random() - 0.5) * 0.2));
    this.b = Array(config.hidden).fill(0);
    this.v = Array.from({ length: config.hidden }, () => (random() - 0.5) * 0.2);
  }
  forward(x) {
    const hidden = x.map((row) => this.w.map((w, h) => Math.tanh(this.b[h] + row.reduce((s, a, j) => s + a * w[j], 0))));
    const logits = hidden.map((a) => a.reduce((s, v, h) => s + v * this.v[h], 0));
    const max = Math.max(...logits), exp = logits.map((z) => Math.exp(z - max));
    const denominator = exp.reduce((a, b) => a + b, 0);
    return { hidden, logits, probabilities: exp.map((z) => z / denominator) };
  }
  scores(x) { return this.forward(x).logits; }
  gradients(x, actual) {
    const f = this.forward(x);
    const dw = this.w.map((row) => row.map(() => 0)), db = this.b.map(() => 0), dv = this.v.map(() => 0);
    for (let n = 0; n < 49; n++) {
      const residual = f.probabilities[n] - Number(n + 1 === actual);
      for (let h = 0; h < this.config.hidden; h++) {
        const a = f.hidden[n][h];
        dv[h] += residual * a;
        const d = residual * this.v[h] * (1 - a * a);
        db[h] += d;
        for (let j = 0; j < 12; j++) dw[h][j] += d * x[n][j];
      }
    }
    return { dw, db, dv };
  }
  update(x, actual) {
    const { dw, db, dv } = this.gradients(x, actual);
    const { learningRate: lr, l2 } = this.config;
    const norm = Math.sqrt([...dw.flat(), ...db, ...dv].reduce((s, g) => s + g * g, 0));
    const scale = Math.max(1, norm);
    for (let h = 0; h < this.config.hidden; h++) {
      for (let j = 0; j < 12; j++) this.w[h][j] -= lr * (dw[h][j] / scale + l2 * this.w[h][j]);
      this.b[h] -= lr * db[h] / scale;
      this.v[h] -= lr * (dv[h] / scale + l2 * this.v[h]);
    }
  }
}

export function sixStats(rows) {
  const { hits: successes, longestMiss: longestFailure, pAgainstRandom: _ignored, ...summary } =
    metrics(rows.map((r) => ({ hit: r.success6 })));
  const baseline = 43 / 49;
  let logChoose = 0, p = 0;
  for (let k = 0; k <= summary.count; k++) {
    if (k >= successes) p += Math.exp(logChoose + k * Math.log(baseline) + (summary.count - k) * Math.log1p(-baseline));
    if (k < summary.count) logChoose += Math.log(summary.count - k) - Math.log(k + 1);
  }
  return { ...summary, successes, failures: summary.count - successes, longestFailure, baseline,
    excess: summary.count ? summary.rate - baseline : null, pAgainstRandom: summary.count ? Math.min(1, p) : null };
}

function selection(scores) {
  const { pool20, excluded10 } = selectExclusions(scores);
  return { pool20, excluded6: excluded10.slice(0, 6) };
}

export function runTargetSix(rows, configs = TARGET_CONFIGS) {
  assert.ok(rows.slice(0, 365).every((r) => r.year === 2025));
  assert.equal(rows[365].year, 2026);
  const start = 245, validationEnd = 365, warmup = 30;
  const features = Array.from({ length: rows.length + 1 }, (_, t) => t >= warmup ? featuresAt(rows, t).candidates : null);
  const runners = configs.map((config) => {
    const model = config.family === 'rank' ? new DirectSixRanker(config) : new ListwiseMLP(config);
    for (let epoch = 0; epoch < config.epochs; epoch++) {
      for (let t = warmup; t < start; t++) model.update(features[t], rows[t].n7);
    }
    return { config, model, validation: [], evaluation: [], next: null };
  });
  // Past-draw rules are controls; their top twenty include six preferred exclusions.
  for (const offset of [1, 2]) runners.push({ config: { id: offset === 1 ? 'previous-normal-six' : 'previous-last-six',
    family: 'rule', offset }, model: null, validation: [], evaluation: [], next: null });
  let selectedNewId;
  for (let t = start; t <= rows.length; t++) {
    if (t === validationEnd) selectedNewId = [...runners].sort((a, b) =>
      b.validation.filter((r) => r.success6).length - a.validation.filter((r) => r.success6).length)[0].config.id;
    for (const r of runners) {
      let scores;
      if (r.model) scores = r.model.scores(features[t]);
      else {
        const six = Array.from({ length: 6 }, (_, i) => rows[t - 1][`n${i + r.config.offset}`]);
        scores = Array.from({ length: 49 }, (_, i) => six.includes(i + 1) ? 0 : 1);
      }
      const picks = selection(scores);
      if (t === rows.length) {
        r.next = { after: { year: rows.at(-1).year, No: rows.at(-1).No }, ...picks,
          ascending6: [...picks.excluded6].sort((a, b) => a - b) };
      } else {
        r[t < validationEnd ? 'validation' : 'evaluation'].push({ year: rows[t].year, No: rows[t].No,
          actual: rows[t].n7, ...picks, success6: !picks.excluded6.includes(rows[t].n7) });
        if (r.model) r.model.update(features[t], rows[t].n7);
      }
    }
  }
  return { selectedNewId, results: runners.map((r) => ({ id: r.config.id, family: r.config.family,
    config: r.config, validation: sixStats(r.validation), evaluation: sixStats(r.evaluation),
    next: r.next, details: { validation: r.validation, evaluation: r.evaluation } })) };
}
