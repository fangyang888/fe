// Fixed before inspecting this model's replay results. No grid search or winner selection.
// Every input feature, neighbor label and empirical prior is built inside the last 100 draws.
export const ROLLING100_RULE = {
  version: 'rolling100-vector-v1', window: 100, context: 10, neighbors: 20,
  spacing: 3, temperature: 0.15, priorMass: 49,
} as const;
type Draw = {year: number; No: number; numbers: number[]};
type Issue = {year: number; No: number};
export type Rolling100Details = {
  version: string; ready: boolean; trainingCount: number; stateSamples: number;
  from: Issue | null; through: Issue | null; neighborCount: number; effectiveNeighbors: number;
  neighbors: {year: number; No: number; similarity: number; weight: number; special: number}[];
  groups: {candidates: number; specials: number; relativeRate: number}[];
  ranking: {n: number; score: number; specialCount: number}[];
};
const unit = (values: number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const centered = values.map(n => n - mean);
  const norm = Math.max(1e-12, Math.sqrt(centered.reduce((s, n) => s + n * n, 0)));
  return centered.map(n => n / norm);
};
function context(rows: Draw[]) {
  const past = rows.slice(-ROLLING100_RULE.context);
  const ids = Array.from({length: 49}, (_, i) => i + 1);
  const miss = ids.map(n => {let at = past.length - 1; while (at >= 0 && !past[at].numbers.includes(n)) at--; return at < 0 ? past.length : past.length - 1 - at;});
  const counts = (size: number, special: boolean) => {
    const count = Array<number>(49).fill(0);
    for (const r of past.slice(-size)) for (const n of special ? [r.numbers[6]] : r.numbers) count[n - 1]++;
    return count;
  };
  const blocks = [miss, counts(5, false), counts(10, false), counts(5, true), counts(10, true),
    ...[1, 2].map(lag => ids.map(n => Number(Boolean(past.at(-lag)?.numbers.includes(n)))))];
  const vector = blocks.flatMap(unit), norm = Math.max(1e-12, Math.sqrt(vector.reduce((s, n) => s + n * n, 0)));
  return {vector: vector.map(n => n / norm), groups: miss.map(n => n < 2 ? 0 : n < 6 ? 1 : 2)};
}
const issue = (r: Draw): Issue => ({year: r.year, No: r.No});

export function rolling100Prediction(history: Draw[]) {
  // Truncate before constructing anything: older draws cannot affect this model.
  const training = history.slice(-ROLLING100_RULE.window);
  const specialCounts = Array<number>(49).fill(0);
  for (const r of training) specialCounts[r.numbers[6] - 1]++;
  const current = context(training);
  const groups = Array.from({length: 3}, () => ({candidates: 0, specials: 0, relativeRate: 0}));
  const examples = [];
  for (let i = ROLLING100_RULE.context; i < training.length; i++) {
    const state = context(training.slice(i - ROLLING100_RULE.context, i));
    const special = training[i].numbers[6];
    for (const g of state.groups) groups[g].candidates++;
    groups[state.groups[special - 1]].specials++;
    examples.push({index: i, ...issue(training[i]), special,
      similarity: state.vector.reduce((s, n, j) => s + n * current.vector[j], 0)});
  }
  for (const g of groups) g.relativeRate = g.candidates ? g.specials * 49 / g.candidates : 0;
  examples.sort((a, b) => b.similarity - a.similarity || b.index - a.index);
  const neighbors: typeof examples = [];
  for (const item of examples) {
    if (neighbors.every(n => Math.abs(n.index - item.index) >= ROLLING100_RULE.spacing)) neighbors.push(item);
    if (neighbors.length === ROLLING100_RULE.neighbors) break;
  }
  const rawWeights = neighbors.map(n => Math.exp((n.similarity - neighbors[0].similarity) / ROLLING100_RULE.temperature));
  const mass = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map(w => w * neighbors.length / mass);
  const score = specialCounts.map(count => ROLLING100_RULE.priorMass * (count + 1) / (training.length + 49));
  neighbors.forEach((n, i) => {score[n.special - 1] += weights[i];});
  const ranking = score.map((value, i) => ({n: i + 1, score: value / (neighbors.length + ROLLING100_RULE.priorMass), specialCount: specialCounts[i]}))
    .sort((a, b) => b.score - a.score || a.n - b.n);
  const details: Rolling100Details = {version: ROLLING100_RULE.version, ready: training.length === ROLLING100_RULE.window,
    trainingCount: training.length, stateSamples: examples.length, from: training.length ? issue(training[0]) : null,
    through: training.length ? issue(training[training.length - 1]) : null, neighborCount: neighbors.length,
    effectiveNeighbors: weights.length ? neighbors.length ** 2 / weights.reduce((s, w) => s + w * w, 0) : 0,
    neighbors: neighbors.map((n, i) => ({year: n.year, No: n.No, special: n.special, similarity: n.similarity, weight: weights[i]})),
    groups, ranking};
  return {picks: ranking.slice(0, 32).map(x => x.n), details};
}
