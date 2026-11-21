import {ZODIACS} from './zodiacLabels';
import type {Zodiac} from './zodiacLabels';

export const ZODIAC_VECTOR_CONFIG = {
  lookback: 24, shortWindow: 6, dimensions: 6 * ZODIACS.length, neighbors: 32,
  minimumNeighbors: 24, temperature: 0.2,
} as const;

export type VectorZodiacDraw = {No: number; zodiac: Zodiac; regularZodiacs: Zodiac[] | null};
type Neighbor = {No: number; zodiac: Zodiac; similarity: number; weight: number};
export type VectorZodiacPrediction = {
  selected: Zodiac[];
  scores: {zodiac: Zodiac; score: number}[];
  neighborCount: number;
  nearest: Neighbor[];
};

const zodiacIndex = new Map(ZODIACS.map((zodiac, index) => [zodiac, index]));

function centeredUnit(block: number[]) {
  const mean = block.reduce((total, value) => total + value, 0) / block.length;
  const centered = block.map(value => value - mean);
  const norm = Math.hypot(...centered);
  return norm ? centered.map(value => value / norm) : centered;
}

function buildContext(byNo: Map<number, VectorZodiacDraw>, target: number) {
  const {lookback, shortWindow} = ZODIAC_VECTOR_CONFIG;
  const regularShort = Array<number>(ZODIACS.length).fill(0);
  const regularLong = [...regularShort], specialShort = [...regularShort], specialLong = [...regularShort];
  const regularGap = Array<number>(ZODIACS.length).fill(lookback);
  const specialGap = [...regularGap];
  for (let lag = 0; lag < lookback; lag++) {
    const draw = byNo.get(target - lag - 1);
    if (!draw?.regularZodiacs) return null;
    for (const zodiac of draw.regularZodiacs) {
      const index = zodiacIndex.get(zodiac)!;
      regularLong[index]++;
      if (lag < shortWindow) regularShort[index]++;
      regularGap[index] = Math.min(regularGap[index], lag);
    }
    const special = zodiacIndex.get(draw.zodiac)!;
    specialLong[special]++;
    if (lag < shortWindow) specialShort[special]++;
    specialGap[special] = Math.min(specialGap[special], lag);
  }
  const vector = [regularShort, regularLong, specialShort, specialLong, regularGap.map(Math.log1p), specialGap.map(Math.log1p)]
    .flatMap(centeredUnit);
  const norm = Math.hypot(...vector);
  return norm ? vector.map(value => value / norm) : null;
}

export function buildVectorZodiacPredictions(draws: VectorZodiacDraw[], targets: number[]) {
  const {lookback, neighbors, minimumNeighbors, temperature} = ZODIAC_VECTOR_CONFIG;
  const byNo = new Map(draws.map(draw => [draw.No, draw]));
  const library = draws.flatMap(draw => {
    const vector = buildContext(byNo, draw.No);
    return vector ? [{draw, vector}] : [];
  });
  const predictions = new Map<number, VectorZodiacPrediction>();

  for (const target of targets) {
    const context = buildContext(byNo, target);
    if (!context) continue;
    const matched = library.filter(({draw}) => draw.No < target - lookback)
      .map(({draw, vector}) => ({No: draw.No, zodiac: draw.zodiac,
        similarity: vector.reduce((sum, value, index) => sum + value * context[index], 0)}))
      .sort((a, b) => b.similarity - a.similarity || b.No - a.No)
      .slice(0, neighbors);
    if (matched.length < minimumNeighbors) continue;

    const weights = matched.map(row => Math.exp((row.similarity - matched[0].similarity) / temperature));
    const mass = weights.reduce((sum, weight) => sum + weight, 0);
    const scores = ZODIACS.map(zodiac => ({zodiac, score: 1}));
    const nearest = matched.map((row, index) => ({...row, weight: weights[index] * matched.length / mass}));
    for (const row of nearest) scores[zodiacIndex.get(row.zodiac)!].score += row.weight;
    for (const score of scores) score.score /= matched.length + ZODIACS.length;
    scores.sort((a, b) => a.score - b.score || zodiacIndex.get(a.zodiac)! - zodiacIndex.get(b.zodiac)!);
    predictions.set(target, {
      selected: scores.slice(0, 3).map(row => row.zodiac), scores, neighborCount: matched.length, nearest: nearest.slice(0, 5),
    });
  }
  return predictions;
}
