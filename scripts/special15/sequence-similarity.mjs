import assert from 'node:assert/strict';
import { normalizeRows, frequencyScores } from './model.mjs';
import { selectExclusions } from './exclusion.mjs';
import { sixStats } from './target-six.mjs';

export const SEQUENCE_CONFIGS = [
  { id: 'sequence-3-knn10', length: 3, neighbors: 10, decay: 0.8, temperature: 8, prior: 20 },
  { id: 'sequence-3-knn20', length: 3, neighbors: 20, decay: 0.8, temperature: 8, prior: 20 },
  { id: 'sequence-5-knn10', length: 5, neighbors: 10, decay: 0.8, temperature: 8, prior: 20 },
  { id: 'sequence-5-knn20', length: 5, neighbors: 20, decay: 0.8, temperature: 8, prior: 20 },
];

// Each chronological slot has 49 ordinary-number indicators and 49 special-number
// indicators. The two blocks have equal norm. Overall L2 norm is one.
// Ordinary positions are pooled; draw order and the special position are retained.
export function sequenceVector(rows, t, config) {
  const { length, decay } = config;
  assert.ok(t >= length && t <= rows.length);
  const out = new Float64Array(length * 98);
  const sumWeight = Array.from({ length }, (_, j) => decay ** (length - 1 - j)).reduce((a, b) => a + b, 0);
  for (let slot = 0; slot < length; slot++) {
    const row = rows[t - length + slot];
    const blockWeight = Math.sqrt(0.5 * decay ** (length - 1 - slot) / sumWeight);
    for (let p = 1; p <= 6; p++) out[slot * 98 + row[`n${p}`] - 1] = blockWeight / Math.sqrt(6);
    out[slot * 98 + 49 + row.n7 - 1] = blockWeight;
  }
  return out;
}

export function cosine(a, b) {
  assert.equal(a.length, b.length);
  let sum = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { sum += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? Math.max(0, Math.min(1, sum / Math.sqrt(na * nb))) : 0;
}

export function findAnalogues(rows, t, config, cache) {
  const vector = (i) => cache?.[i] || sequenceVector(rows, i, config);
  const query = vector(t), candidates = [];
  // Label i must precede the entire query window [t-L, t-1].
  // This blocks both target leakage and overlap with the query itself.
  for (let i = config.length; i < t - config.length; i++) {
    candidates.push({ index: i, similarity: cosine(query, vector(i)) });
  }
  candidates.sort((a, b) => b.similarity - a.similarity || a.index - b.index);
  const selected = [];
  for (const c of candidates) {
    // Include each neighbour's NEXT draw in the non-overlap constraint.
    if (selected.some((other) => Math.abs(c.index - other.index) <= config.length)) continue;
    selected.push(c);
    if (selected.length === config.neighbors) break;
  }
  return selected.map((c) => ({ similarity: c.similarity,
    from: rows[c.index - config.length].No, to: rows[c.index - 1].No,
    nextPeriod: rows[c.index].No, nextSpecial: rows[c.index].n7,
    specialSequence: rows.slice(c.index - config.length, c.index).map((r) => r.n7) }));
}

export function predictSequence(rows, t, config, cache) {
  const neighbours = findAnalogues(rows, t, config, cache);
  assert.ok(neighbours.length > 0);
  // Sparse analogues do not imply zero probability for unobserved numbers.
  // Shrink neighbour votes toward the same 100-draw baseline used by the control.
  const baseline = frequencyScores(rows, t, { window: 100, prior: 49 });
  const weights = neighbours.map((r) => Math.exp(config.temperature * r.similarity));
  const sum = weights.reduce((a, b) => a + b, 0);
  const scores = baseline.map((p) => config.prior * p);
  neighbours.forEach((r, i) => { scores[r.nextSpecial - 1] += neighbours.length * weights[i] / sum; });
  const normalized = scores.map((s) => s / (config.prior + neighbours.length));
  const { pool20, excluded10 } = selectExclusions(normalized);
  return { pool20, excluded6: excluded10.slice(0, 6), neighbours,
    actualNeighborCount: neighbours.length,
    distinctFollowingSpecials: new Set(neighbours.map((r) => r.nextSpecial)).size,
    scores: normalized };
}

export function runSequences(input) {
  const { rows, audit } = normalizeRows(input, 2026);
  assert.equal(rows.length, 266, '本次固定使用2026年第1～266期快照');
  assert.equal(rows[0].No, 1);
  const result = [];
  for (const config of SEQUENCE_CONFIGS) {
    const cache = Array.from({ length: rows.length + 1 }, (_, t) => t >= config.length ? sequenceVector(rows, t, config) : null);
    const details = { validation: [], evaluation: [] };
    for (let t = 146; t < rows.length; t++) {
      const prediction = predictSequence(rows, t, config, cache);
      details[t < 206 ? 'validation' : 'evaluation'].push({ year: 2026, No: rows[t].No, actual: rows[t].n7,
        pool20: prediction.pool20, excluded6: prediction.excluded6,
        success6: !prediction.excluded6.includes(rows[t].n7),
        actualNeighborCount: prediction.actualNeighborCount,
        nearestSimilarity: prediction.neighbours[0].similarity });
    }
    const next = predictSequence(rows, rows.length, config, cache);
    result.push({ id: config.id, config, validation: sixStats(details.validation), evaluation: sixStats(details.evaluation),
      details, next: { after: { year: 2026, No: rows.at(-1).No }, target: { year: 2026, No: rows.at(-1).No + 1 },
        queryFrom: rows[rows.length - config.length].No, queryTo: rows.at(-1).No,
        querySpecialSequence: rows.slice(-config.length).map((r) => r.n7),
        ...next, ascending6: [...next.excluded6].sort((a, b) => a - b) } });
  }
  const selectedId = [...result].sort((a, b) => b.validation.successes - a.validation.successes)[0].id;
  return { audit, selectedId, results: result };
}
