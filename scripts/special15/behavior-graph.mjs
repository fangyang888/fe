import assert from 'node:assert/strict';
import { normalizeRows } from './model.mjs';
import { selectExclusions } from './exclusion.mjs';
import { sixStats } from './target-six.mjs';

export const BEHAVIOR_CONFIGS = [
  { id: 'trajectory-5-exact', family: 'trajectory', length: 5, radius: 0, prior: 100 },
  { id: 'trajectory-10-near', family: 'trajectory', length: 10, radius: 1, prior: 100 },
  { id: 'transition-all', family: 'graph', decay: 1, prior: 20 },
  { id: 'transition-decay', family: 'graph', decay: 0.98, prior: 20 },
];

const popcount = (input) => { let n = input, count = 0; while (n) { n &= n - 1; count++; } return count; };
const ordinary = (r) => Array.from({ length: 6 }, (_, i) => r[`n${i + 1}`]);

// Pool candidate trajectories across number identities. Exposures from the same
// draw are correlated; they are never treated as independent evaluation trials.
export class TrajectoryModel {
  constructor(config) {
    this.config = config;
    this.normal = Array(49).fill(0);
    this.special = Array(49).fill(0);
    this.states = new Map();
    this.time = 0;
    this.mask = (1 << config.length) - 1;
  }
  key(n) { return (this.normal[n] << this.config.length) | this.special[n]; }
  update(row) {
    // Attribute the outcome to the state BEFORE inserting this draw.
    if (this.time >= this.config.length) for (let n = 0; n < 49; n++) {
      const key = this.key(n);
      if (!this.states.has(key)) this.states.set(key, { normal: this.normal[n], special: this.special[n], exposures: 0, hits: 0 });
      const state = this.states.get(key);
      state.exposures++;
      state.hits += Number(n + 1 === row.n7);
    }
    const normals = new Set(ordinary(row));
    for (let n = 0; n < 49; n++) {
      this.normal[n] = ((this.normal[n] << 1) | Number(normals.has(n + 1))) & this.mask;
      this.special[n] = ((this.special[n] << 1) | Number(row.n7 === n + 1)) & this.mask;
    }
    this.time++;
  }
  evidence(n) {
    let exposures = 0, hits = 0;
    for (const state of this.states.values()) {
      const distance = popcount(this.normal[n] ^ state.normal) + 2 * popcount(this.special[n] ^ state.special);
      if (distance > this.config.radius) continue;
      const weight = distance === 0 ? 1 : 0.5;
      exposures += weight * state.exposures;
      hits += weight * state.hits;
    }
    return { exposures, hits, score: (hits + this.config.prior / 49) / (exposures + this.config.prior) };
  }
  scores() {
    const cache = new Map();
    return this.normal.map((_, n) => {
      const key = this.key(n);
      if (!cache.has(key)) cache.set(key, this.evidence(n).score);
      return cache.get(key);
    });
  }
}

export class TransitionGraph {
  constructor(config) {
    this.config = config;
    this.edges = Array.from({ length: 2 }, () => Array.from({ length: 49 }, () => Array(49).fill(0)));
    this.totals = Array.from({ length: 2 }, () => Array(49).fill(0));
    this.global = Array(49).fill(0);
    this.total = 0;
    this.previous = null;
  }
  update(row) {
    const decay = this.config.decay;
    if (decay !== 1) {
      for (let g = 0; g < 2; g++) for (let n = 0; n < 49; n++) {
        this.totals[g][n] *= decay;
        for (let k = 0; k < 49; k++) this.edges[g][n][k] *= decay;
      }
      this.global = this.global.map((v) => v * decay);
      this.total *= decay;
    }
    if (this.previous) {
      for (const source of ordinary(this.previous)) {
        this.edges[0][source - 1][row.n7 - 1]++;
        this.totals[0][source - 1]++;
      }
      this.edges[1][this.previous.n7 - 1][row.n7 - 1]++;
      this.totals[1][this.previous.n7 - 1]++;
    }
    this.global[row.n7 - 1]++;
    this.total++;
    this.previous = row;
  }
  scores() {
    const baseline = this.global.map((v) => (v + 1) / (this.total + 49));
    if (!this.previous) return baseline;
    const conditional = (g, source, target) => (this.edges[g][source - 1][target] + this.config.prior * baseline[target]) /
      (this.totals[g][source - 1] + this.config.prior);
    return baseline.map((_, target) => 0.75 * ordinary(this.previous).reduce((sum, source) =>
      sum + conditional(0, source, target), 0) / 6 + 0.25 * conditional(1, this.previous.n7, target));
  }
}

export function runBehaviors(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  assert.equal(rows.length, 266, '固定使用2026年第1～266期');
  assert.equal(rows[0].No, 1);
  const results = BEHAVIOR_CONFIGS.map((config) => {
    const model = config.family === 'trajectory' ? new TrajectoryModel(config) : new TransitionGraph(config);
    const details = { validation: [], evaluation: [] };
    let next;
    for (let t = 0; t <= rows.length; t++) {
      if (t >= 146) {
        const scores = model.scores();
        assert.ok(scores.every((s) => Number.isFinite(s) && s > 0));
        const { pool20, excluded10 } = selectExclusions(scores);
        const excluded6 = excluded10.slice(0, 6);
        if (t === rows.length) {
          next = { after: { year: 2026, No: 266 }, target: { year: 2026, No: 267 }, pool20, excluded6,
            ascending6: [...excluded6].sort((a, b) => a - b), scores };
          if (config.family === 'trajectory') next.evidence = excluded6.map((n) => ({ number: n,
            ordinaryMask: model.normal[n - 1].toString(2).padStart(config.length, '0'),
            specialMask: model.special[n - 1].toString(2).padStart(config.length, '0'), ...model.evidence(n - 1) }));
        } else details[t < 206 ? 'validation' : 'evaluation'].push({ year: 2026, No: rows[t].No,
          actual: rows[t].n7, pool20, excluded6, success6: !excluded6.includes(rows[t].n7) });
      }
      if (t < rows.length) model.update(rows[t]);
    }
    return { id: config.id, config, details, validation: sixStats(details.validation), evaluation: sixStats(details.evaluation), next };
  });
  return { audit, results };
}
