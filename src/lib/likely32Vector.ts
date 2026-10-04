// Fixed exploratory rule, discovered using history through 2026-275.
// Historical replay is causal; model selection on that history is not independent validation.
export const VECTOR_VERSION = 'number-cosine-spaced-v1';
type Draw = {year: number; No: number; numbers: number[]};
type Item = {n: number; miss: number; ratio: number};
type Neighbor = {year: number; No: number; similarity: number; weight: number; special: number};
export type VectorDetails = {
  version: string; samples: number; neighbors: Neighbor[]; neighborCount: number; effectiveNeighbors: number;
  guardActive: boolean; meanGain: number | null; standardError: number | null;
  swaps: {from: number; to: number; advantage: number}[];
};
export type VectorState = {
  records: {vector: number[]; year: number; No: number; special: number}[];
  total: number; square: number; mass: number; squaredMass: number;
};
export const createVectorState = (): VectorState => ({records: [], total: 0, square: 0, mass: 0, squaredMass: 0});
const unit = (x: number[]) => {
  const norm = Math.max(1e-12, Math.sqrt(x.reduce((s, n) => s + n * n, 0)));
  return x.map(n => n / norm);
};
const dot = (a: number[], b: number[]) => a.reduce((sum, n, i) => sum + n * b[i], 0);

export function numberContext(history: Draw[], items: Item[], order: number[]) {
  const rank = new Map(order.map((n, i) => [n, i]));
  const frequency = Array<number>(49).fill(0), special = Array<number>(49).fill(0);
  for (const row of history.slice(-20)) for (const n of row.numbers) frequency[n - 1]++;
  for (const row of history.slice(-40)) special[row.numbers[6] - 1]++;
  const blocks = [items.map(x => Math.log1p(Math.min(x.miss, 40))), items.map(x => Math.min(x.ratio, 3)),
    items.map(x => rank.get(x.n)! / 48), frequency, special,
    ...[1, 2].map(lag => items.map(x => Number(history.at(-lag)?.numbers.includes(x.n))))];
  return unit(blocks.flatMap(block => {
    const mean = block.reduce((a, b) => a + b, 0) / 49;
    return unit(block.map(x => x - mean));
  }));
}

export function vectorPrediction(history: Draw[], items: Item[], order: number[], state: VectorState) {
  const context = numberContext(history, items, order), i = state.records.length;
  const candidates = state.records.map((record, index) => ({record, index}))
    .filter(x => x.index >= 40 && x.index <= i - 5)
    .map(x => ({...x, similarity: dot(x.record.vector, context)}))
    .sort((a, b) => b.similarity - a.similarity || b.index - a.index);
  const neighbors: typeof candidates = [];
  for (const candidate of candidates) {
    if (neighbors.every(n => Math.abs(n.index - candidate.index) >= 5)) neighbors.push(candidate);
    if (neighbors.length === 40) break;
  }
  const rawWeights = neighbors.map(n => Math.exp((n.similarity - neighbors[0].similarity) / 0.15));
  const mass = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map(w => w * neighbors.length / mass);
  const score = Array<number>(49).fill(1);
  neighbors.forEach((n, at) => {score[n.record.special - 1] += weights[at];});
  for (let n = 0; n < 49; n++) score[n] /= neighbors.length + 49;
  const rank = new Map(order.map((n, at) => [n, at]));
  const outgoing = order.slice(0, 32).sort((a, b) => score[a - 1] - score[b - 1] || rank.get(b)! - rank.get(a)!);
  const incoming = order.slice(32).sort((a, b) => score[b - 1] - score[a - 1] || rank.get(a)! - rank.get(b)!);
  const picks = order.slice(0, 32), swaps: VectorDetails['swaps'] = [];
  if (i - 40 >= 80) for (let k = 0; k < 4; k++) {
    const from = outgoing[k], to = incoming[k], advantage = score[to - 1] - score[from - 1];
    if (advantage < 0.003) break;
    picks[picks.indexOf(from)] = to; swaps.push({from, to, advantage});
  }
  const meanGain = state.mass >= 40 ? state.total / state.mass : null;
  const standardError = meanGain === null ? null : Math.sqrt(Math.max(0, state.square / state.mass - meanGain ** 2) / (state.mass ** 2 / state.squaredMass));
  const guardActive = meanGain !== null && standardError !== null && meanGain > 0.75 * standardError;
  const details: VectorDetails = {version: VECTOR_VERSION, samples: i, neighborCount: neighbors.length,
    effectiveNeighbors: weights.length ? neighbors.length ** 2 / weights.reduce((s, w) => s + w * w, 0) : 0,
    neighbors: neighbors.slice(0, 10).map((n, at) => ({year: n.record.year, No: n.record.No, similarity: n.similarity, weight: weights[at], special: n.record.special})),
    swaps, guardActive, meanGain, standardError};
  return {context, picks, guardedPicks: guardActive ? [...picks] : order.slice(0, 32), details};
}

export function updateVectorState(state: VectorState, context: number[], actual: Draw, original: number[], rawPicks: number[]) {
  const special = actual.numbers[6], delta = Number(rawPicks.includes(special)) - Number(original.includes(special));
  const decay = 0.5 ** (1 / 30);
  state.total = state.total * decay + delta; state.square = state.square * decay + delta * delta;
  state.mass = state.mass * decay + 1; state.squaredMass = state.squaredMass * decay ** 2 + 1;
  state.records.push({vector: context, year: actual.year, No: actual.No, special});
}
