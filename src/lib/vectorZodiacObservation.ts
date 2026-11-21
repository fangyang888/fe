import {ZODIACS} from './zodiacLabels';
import type {Zodiac} from './zodiacLabels';

const ZODIAC_COUNT = ZODIACS.length;
export const ZODIAC_VECTOR_CONFIG = {dimensions: 6 * ZODIAC_COUNT, neighbors: 32, minimumNeighbors: 24, temperature: 0.2} as const;
export const ZODIAC_VECTOR_WINDOWS = [
  {lookback: 12, shortWindow: 4},
  {lookback: 24, shortWindow: 6},
  {lookback: 36, shortWindow: 9},
] as const;
export const ZODIAC_VECTOR_SWITCH_WINDOW = 20;
export const ZODIAC_VECTOR_FEEDBACK_WINDOW = 60;
export const ZODIAC_VECTOR_SHORT_HALF_LIFE = 60;
export const ZODIAC_VECTOR_TRIAL_START = 325;

export type VectorZodiacDraw = {No: number; zodiac: Zodiac; specialNumber: number; regularNumbers: number[] | null};
export type VectorZodiacScheme = 'learning' | 'short';
const SCHEMES: VectorZodiacScheme[] = ['learning', 'short'];
type Neighbor = {No: number; zodiac: Zodiac; alignedZodiac: Zodiac; similarity: number; weight: number};
type WindowSettings = {lookback: number; shortWindow: number};
type SlotNeighbor = {No: number; zodiac: Zodiac; slot: number; similarity: number; weight: number};
type WindowForecast = WindowSettings & {neighborCount: number; nearest: SlotNeighbor[]; scores: number[]};
export type VectorZodiacPrediction = {
  selected: Zodiac[];
  scores: {zodiac: Zodiac; score: number}[];
  windows: (WindowSettings & {neighborCount: number; nearest: Neighbor[]; share: number})[];
};
export type VectorZodiacRecent = {count: number; learningWins: number; shortWins: number};
export type VectorZodiacDecision = {
  scheme: VectorZodiacScheme;
  forecasts: Record<VectorZodiacScheme, VectorZodiacPrediction>;
  results: Record<VectorZodiacScheme, boolean | null>;
  recent: VectorZodiacRecent;
};

const zodiacIndex = new Map(ZODIACS.map((zodiac, index) => [zodiac, index]));
const slotFor = (number: number) => (number - 1) % ZODIAC_COUNT;
export const zodiacMapping = (number: number, zodiac: Zodiac) => (zodiacIndex.get(zodiac)! + slotFor(number)) % ZODIAC_COUNT;
const zodiacAtSlot = (mapping: number, slot: number) => ZODIACS[(mapping + ZODIAC_COUNT - slot) % ZODIAC_COUNT];
export const zodiacForNumber = (mapping: number, number: number) => zodiacAtSlot(mapping, slotFor(number));

export function selectVectorZodiacScheme(recent: VectorZodiacRecent): VectorZodiacScheme {
  return recent.count === ZODIAC_VECTOR_SWITCH_WINDOW && recent.shortWins > recent.learningWins ? 'short' : 'learning';
}

function centeredUnit(block: number[]) {
  const mean = block.reduce((total, value) => total + value, 0) / block.length;
  const centered = block.map(value => value - mean);
  const norm = Math.hypot(...centered);
  return norm ? centered.map(value => value / norm) : centered;
}

function buildContext(byNo: Map<number, VectorZodiacDraw>, target: number, {lookback, shortWindow}: WindowSettings) {
  const regularShort = Array<number>(ZODIAC_COUNT).fill(0);
  const regularLong = [...regularShort], specialShort = [...regularShort], specialLong = [...regularShort];
  const regularGap = Array<number>(ZODIAC_COUNT).fill(lookback);
  const specialGap = [...regularGap];
  for (let lag = 0; lag < lookback; lag++) {
    const draw = byNo.get(target - lag - 1);
    if (!draw?.regularNumbers) return null;
    for (const number of draw.regularNumbers) {
      const slot = slotFor(number);
      regularLong[slot]++;
      if (lag < shortWindow) regularShort[slot]++;
      regularGap[slot] = Math.min(regularGap[slot], lag);
    }
    const special = slotFor(draw.specialNumber);
    specialLong[special]++;
    if (lag < shortWindow) specialShort[special]++;
    specialGap[special] = Math.min(specialGap[special], lag);
  }
  const vector = [regularShort, regularLong, specialShort, specialLong, regularGap.map(Math.log1p), specialGap.map(Math.log1p)]
    .flatMap(centeredUnit);
  const norm = Math.hypot(...vector);
  return norm ? vector.map(value => value / norm) : null;
}

function buildWindowForecasts(draws: VectorZodiacDraw[], byNo: Map<number, VectorZodiacDraw>, through: number, window: WindowSettings) {
  const {neighbors, minimumNeighbors, temperature} = ZODIAC_VECTOR_CONFIG;
  const library = draws.flatMap(draw => {
    const vector = buildContext(byNo, draw.No, window);
    return vector ? [{draw, vector}] : [];
  });
  const forecasts = new Map<number, Record<VectorZodiacScheme, WindowForecast>>();
  for (let target = 1; target <= through; target++) {
    const context = buildContext(byNo, target, window);
    if (!context) continue;
    const matched = library.filter(({draw}) => draw.No < target - window.lookback)
      .map(({draw, vector}) => ({No: draw.No, zodiac: draw.zodiac, slot: slotFor(draw.specialNumber),
        similarity: vector.reduce((sum, value, index) => sum + value * context[index], 0)}))
      .sort((a, b) => b.similarity - a.similarity || b.No - a.No)
      .slice(0, neighbors);
    if (matched.length < minimumNeighbors) continue;

    const forecast = (scheme: VectorZodiacScheme): WindowForecast => {
      const weights = matched.map(row => {
        const recency = scheme === 'short' ? Math.LN2 * (target - row.No) / ZODIAC_VECTOR_SHORT_HALF_LIFE : 0;
        return Math.exp((row.similarity - matched[0].similarity) / temperature - recency);
      });
      const mass = weights.reduce((sum, weight) => sum + weight, 0);
      const scores = Array<number>(ZODIAC_COUNT).fill(1);
      const nearest = matched.map((row, index) => ({...row, weight: weights[index] * matched.length / mass}));
      for (const row of nearest) scores[row.slot] += row.weight;
      return {...window, scores: scores.map(score => score / (matched.length + ZODIAC_COUNT)),
        neighborCount: matched.length, nearest: nearest.slice(0, 5)};
    };
    forecasts.set(target, {learning: forecast('learning'), short: forecast('short')});
  }
  return forecasts;
}

function windowShares(count: number, feedback: number[][]) {
  if (feedback.length === 0) return Array<number>(count).fill(1 / count);
  const recent = feedback.slice(-ZODIAC_VECTOR_FEEDBACK_WINDOW);
  const means = Array.from({length: count}, (_, index) =>
    recent.reduce((sum, scores) => sum + scores[index], 0) / recent.length);
  const peak = Math.max(...means);
  const scaled = means.map(value => Math.exp(8 * (value - peak)));
  const mass = scaled.reduce((sum, weight) => sum + weight, 0);
  return scaled.map(weight => 0.5 / count + 0.5 * weight / mass);
}

function combineForecast(windows: WindowForecast[], mapping: number, shares: number[]): VectorZodiacPrediction {
  const scores = ZODIACS.map((zodiac, index) => {
    const slot = (mapping + ZODIAC_COUNT - index) % ZODIAC_COUNT;
    return {zodiac, score: windows.reduce((sum, window, at) => sum + window.scores[slot] * shares[at], 0)};
  });
  scores.sort((a, b) => a.score - b.score || zodiacIndex.get(a.zodiac)! - zodiacIndex.get(b.zodiac)!);
  return {
    selected: scores.slice(0, 3).map(row => row.zodiac), scores,
    windows: windows.map(({lookback, shortWindow, neighborCount, nearest}, index) => ({
      lookback, shortWindow, neighborCount, share: shares[index],
      nearest: nearest.map(({No, zodiac, slot, similarity, weight}) => ({
        No, zodiac, alignedZodiac: zodiacAtSlot(mapping, slot), similarity, weight,
      })),
    })),
  };
}

export function buildVectorZodiacDecisions(draws: VectorZodiacDraw[], through: number) {
  const byNo = new Map(draws.map(draw => [draw.No, draw]));
  const models = ZODIAC_VECTOR_WINDOWS.map(window => buildWindowForecasts(draws, byNo, through, window));
  const feedback: Record<VectorZodiacScheme, number[][]> = {learning: [], short: []};
  const outcomes: {No: number; learning: boolean; short: boolean}[] = [];
  const decisions = new Map<number, VectorZodiacDecision>();

  for (let target = 1; target <= through; target++) {
    const last = byNo.get(target - 1);
    const middle = models[1].get(target);
    if (!last || !middle) continue;
    const mapping = zodiacMapping(last.specialNumber, last.zodiac);
    const short = models[0].get(target), long = models[2].get(target);
    const sources = short && long ? [short, middle, long] : [middle];
    const predict = (scheme: VectorZodiacScheme) => combineForecast(sources.map(source => source[scheme]), mapping,
      sources.length === 1 ? [1] : windowShares(sources.length, feedback[scheme]));
    const forecasts = {learning: predict('learning'), short: predict('short')};
    const sample = outcomes.slice(-ZODIAC_VECTOR_SWITCH_WINDOW).filter(row => row.No >= target - ZODIAC_VECTOR_SWITCH_WINDOW);
    const recent = {count: sample.length, learningWins: sample.filter(row => row.learning).length,
      shortWins: sample.filter(row => row.short).length};
    const scheme = selectVectorZodiacScheme(recent);
    const actual = byNo.get(target);
    const results = {
      learning: actual ? !forecasts.learning.selected.includes(actual.zodiac) : null,
      short: actual ? !forecasts.short.selected.includes(actual.zodiac) : null,
    };
    decisions.set(target, {scheme, forecasts, results, recent});

    // Reveal the result only after both forecasts and the choice have been made.
    if (actual && results.learning !== null && results.short !== null) {
      outcomes.push({No: target, learning: results.learning, short: results.short});
      if (sources.length !== ZODIAC_VECTOR_WINDOWS.length) continue;
      const slot = (mapping + ZODIAC_COUNT - zodiacIndex.get(actual.zodiac)!) % ZODIAC_COUNT;
      for (const key of SCHEMES) feedback[key].push(sources.map(source => Math.log(source[key].scores[slot])));
    }
  }
  return decisions;
}
