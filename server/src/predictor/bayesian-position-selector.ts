export interface PositionOutcome {
  success: boolean[];
}

export interface RankedPosition {
  position: number;
  score: number;
  posteriorRate: number;
  uncertainty: number;
  effectiveSamples: number;
  recentRate: number;
  recentSamples: number;
}

export interface PositionSelectorOptions {
  positionCount?: number;
  lookback?: number;
  halfLife?: number;
  priorStrength?: number;
  baselineRate?: number;
  riskPenalty?: number;
}

export interface RecentChampionPosition {
  position: number;
  successes: number;
  samples: number;
  recentRate: number;
  adjustedRate: number;
  confidenceLowerBound: number;
}

export function rankRecentChampionPositions(
  outcomes: PositionOutcome[],
  options: {
    positionCount?: number;
    window?: number;
    priorStrength?: number;
    baselineRate?: number;
  } = {},
): RecentChampionPosition[] {
  const positionCount = options.positionCount ?? 22;
  const window = options.window ?? 10;
  const baselineRate = options.baselineRate ?? 42 / 49;
  const priorStrength = options.priorStrength ?? 14;
  const sample = outcomes.slice(-window);

  return Array.from({ length: positionCount }, (_, index) => {
    const observed = sample.filter(
      (row) => typeof row.success[index] === 'boolean',
    );
    const successes = observed.filter((row) => row.success[index]).length;
    const samples = observed.length;
    const recentRate = samples ? successes / samples : baselineRate;
    const adjustedRate =
      (baselineRate * priorStrength + successes) / (priorStrength + samples);
    const confidenceLowerBound = wilsonLowerBound(successes, samples);

    return {
      position: index + 1,
      successes,
      samples,
      recentRate,
      adjustedRate,
      confidenceLowerBound,
    };
  }).sort(
    (a, b) =>
      b.successes - a.successes ||
      b.adjustedRate - a.adjustedRate ||
      a.position - b.position,
  );
}

function wilsonLowerBound(successes: number, samples: number) {
  if (!samples) return 0;
  const z = 1.96;
  const probability = successes / samples;
  const denominator = 1 + (z * z) / samples;
  const center = probability + (z * z) / (2 * samples);
  const margin =
    z *
    Math.sqrt(
      (probability * (1 - probability)) / samples +
        (z * z) / (4 * samples * samples),
    );
  return Math.max(0, (center - margin) / denominator);
}

/**
 * Rank fully-observed position experts with a recency-weighted Beta posterior.
 * The returned score is a conservative posterior estimate, so a tiny hot streak
 * cannot beat a position supported by a larger and steadier sample immediately.
 */
export function rankBayesianPositions(
  outcomes: PositionOutcome[],
  options: PositionSelectorOptions = {},
): RankedPosition[] {
  const positionCount = options.positionCount ?? 22;
  const lookback = options.lookback ?? 120;
  const halfLife = options.halfLife ?? 30;
  const baselineRate = options.baselineRate ?? 42 / 49;
  const priorStrength = options.priorStrength ?? 14;
  const riskPenalty = options.riskPenalty ?? 0.8;
  const sample = outcomes.slice(-lookback);
  const decay = Math.log(2) / Math.max(1, halfLife);

  return Array.from({ length: positionCount }, (_, index) => {
    let weightedSuccess = 0;
    let weightedFailure = 0;

    sample.forEach((row, rowIndex) => {
      const value = row.success[index];
      if (typeof value !== 'boolean') return;
      const age = sample.length - 1 - rowIndex;
      const weight = Math.exp(-decay * age);
      if (value) weightedSuccess += weight;
      else weightedFailure += weight;
    });

    const alpha = baselineRate * priorStrength + weightedSuccess;
    const beta = (1 - baselineRate) * priorStrength + weightedFailure;
    const total = alpha + beta;
    const posteriorRate = alpha / total;
    const uncertainty = Math.sqrt(
      (alpha * beta) / (total * total * (total + 1)),
    );
    const recent = sample.slice(-20).filter((row) => typeof row.success[index] === 'boolean');
    const recentSuccesses = recent.filter((row) => row.success[index]).length;

    return {
      position: index + 1,
      score: posteriorRate - riskPenalty * uncertainty,
      posteriorRate,
      uncertainty,
      effectiveSamples: weightedSuccess + weightedFailure,
      recentRate: recent.length ? recentSuccesses / recent.length : baselineRate,
      recentSamples: recent.length,
    };
  }).sort(
    (a, b) =>
      b.score - a.score ||
      b.posteriorRate - a.posteriorRate ||
      a.position - b.position,
  );
}
