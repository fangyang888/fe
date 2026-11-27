import {summarizeMissStreaks} from './likely32Tracker';

export type BallColor = '红' | '蓝' | '绿';
export type BallParity = '单' | '双';
export type BallSize = '小' | '大';
export type ObservationMode = 'subWave' | 'halfWave';
export type ColorParityModelKey = 'ensemble' | 'prior';

export const COLOR_PARITY_YEAR = 2026;
export const COLOR_PARITY_BACKTEST_START = 61;
export const COLOR_PARITY_VECTOR_WINDOWS = [
  {lookback: 12, shortWindow: 4},
  {lookback: 24, shortWindow: 6},
  {lookback: 36, shortWindow: 9},
] as const;
export const COLOR_PARITY_VECTOR_CONFIG = {
  neighbors: 32,
  minimumNeighbors: 18,
  temperature: 0.2,
  halfLife: 60,
  priorWeight: 24,
  feedbackWindow: 60,
} as const;
export const COLOR_PARITY_SEQ_CONFIG = {
  lags: 5,
  neighbors: 50,
  marginalWindow: 80,
  priorWeight: 18,
} as const;
export const COLOR_PARITY_MARKOV_PRIOR = 24;
export const COLOR_PARITY_BAYES_WINDOW = 60;
export const COLOR_PARITY_BAYES_PRIOR = 30;
export const COLOR_PARITY_ROLLING_WINDOWS = [15, 30, 50, 100] as const;

export const HALF_WAVE_LABELS = ['红单', '红双', '绿单', '绿双', '蓝单', '蓝双'] as const;
export type HalfWaveLabel = (typeof HALF_WAVE_LABELS)[number];

export const SUB_WAVE_LABELS = [
  '红小单', '红大单', '红小双', '红大双',
  '绿小单', '绿大单', '绿小双', '绿大双',
  '蓝小单', '蓝大单', '蓝小双', '蓝大双',
] as const;
export type SubWaveLabel = (typeof SUB_WAVE_LABELS)[number];

export type WaveLabel = HalfWaveLabel | SubWaveLabel;

const RED_NUMBERS = new Set([1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]);
const BLUE_NUMBERS = new Set([3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48]);
const GREEN_NUMBERS = new Set([5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]);

export function standardColorForNumber(n: number): BallColor | null {
  if (RED_NUMBERS.has(n)) return '红';
  if (BLUE_NUMBERS.has(n)) return '蓝';
  if (GREEN_NUMBERS.has(n)) return '绿';
  return null;
}

export function isBallColor(value: unknown): value is BallColor {
  return value === '红' || value === '蓝' || value === '绿';
}

export function parityForNumber(n: number): BallParity {
  return n % 2 === 1 ? '单' : '双';
}

export function sizeForNumber(n: number): BallSize {
  return n >= 25 ? '大' : '小';
}

export function halfWaveLabelOf(n: number, color: BallColor): HalfWaveLabel {
  return `${color}${parityForNumber(n)}` as HalfWaveLabel;
}

export function subWaveLabelOf(n: number, color: BallColor): SubWaveLabel {
  return `${color}${sizeForNumber(n)}${parityForNumber(n)}` as SubWaveLabel;
}

export type ClassMeta = {
  label: string;
  color: BallColor;
  parity: BallParity;
  size: BallSize | null;
  numbers: number[];
  ballCount: number;
  prior: number;
  theoreticalNotRate: number;
  isMinPool: boolean;
};

function buildClassMetas(mode: ObservationMode): ClassMeta[] {
  const labels: readonly string[] = mode === 'halfWave' ? HALF_WAVE_LABELS : SUB_WAVE_LABELS;
  const buckets = new Map<string, number[]>(labels.map(label => [label, []]));
  for (let n = 1; n <= 49; n++) {
    const color = standardColorForNumber(n)!;
    const label = mode === 'halfWave' ? halfWaveLabelOf(n, color) : subWaveLabelOf(n, color);
    buckets.get(label)!.push(n);
  }
  const minCount = Math.min(...[...buckets.values()].map(arr => arr.length));
  return labels.map(label => {
    const numbers = buckets.get(label)!;
    const color = label[0] as BallColor;
    const parity = label[label.length - 1] as BallParity;
    const size = mode === 'subWave' ? (label[1] as BallSize) : null;
    const ballCount = numbers.length;
    return {
      label,
      color,
      parity,
      size,
      numbers,
      ballCount,
      prior: ballCount / 49,
      theoreticalNotRate: (49 - ballCount) / 49,
      isMinPool: ballCount === minCount,
    };
  });
}

export const MODE_META: Record<ObservationMode, {
  title: string;
  shortTitle: string;
  description: string;
  classes: ClassMeta[];
  theoreticalMaxNotRate: number;
  marginalDf: number;
  marginalCritical05: number;
  markovDf: number;
  markovCritical05: number;
}> = {
  subWave: {
    title: '12类半半波（波色 × 大小 × 单双）',
    shortTitle: '12类半半波 · 90%+',
    description: '将 6 类半波按小(01–24)/大(25–49)细分为 12 类；最小号池为 3 球桶（红大单 / 绿小双 / 蓝小单），理论不开上限 93.88%，真正达标 90%+。',
    classes: buildClassMetas('subWave'),
    theoreticalMaxNotRate: 46 / 49,
    marginalDf: 11,
    marginalCritical05: 19.68,
    markovDf: 121,
    markovCritical05: 147.67,
  },
  halfWave: {
    title: '6类半波（波色 × 单双）',
    shortTitle: '6类半波',
    description: '对应红单、红双、绿单、绿双、蓝单、蓝双。最小号池为绿双（7/49 球），独立随机下理论不开上限 85.71%。',
    classes: buildClassMetas('halfWave'),
    theoreticalMaxNotRate: 42 / 49,
    marginalDf: 5,
    marginalCritical05: 11.07,
    markovDf: 25,
    markovCritical05: 37.65,
  },
};

export const COLOR_PARITY_MODELS: Record<ColorParityModelKey, {
  key: ColorParityModelKey;
  label: string;
  shortLabel: string;
  summary: Record<ObservationMode, string>;
}> = {
  ensemble: {
    key: 'ensemble',
    label: '多信号先验融合',
    shortLabel: '多信号先验融合',
    summary: {
      subWave: '内部融合先验锚定(35%) + 12/24/36期余弦向量 Top-K(25%) + 5期序列 Top-K(20%) + 马尔可夫疲劳(10%) + 60期贝叶斯频率(10%)，并在 3 个最小 3 球桶（红大单 / 绿小双 / 蓝小单）内动态三选一，既随走势轮换又严格锁定 93.88% 理论天花板。',
      halfWave: '概率层融合先验锚定(35%) + 12/24/36期余弦向量 Top-K(25%) + 5期序列 Top-K(20%) + 马尔可夫疲劳(10%) + 60期贝叶斯频率(10%)，动态排除综合预测开出概率最低项。',
    },
  },
  prior: {
    key: 'prior',
    label: '理论先验最小号池',
    shortLabel: '理论先验最小号池',
    summary: {
      subWave: '无参数静态理论最优基准：固定排除 3 球最小号池「红大单」（29 / 35 / 45），理论不开率 46/49 = 93.88%，无过拟合风险。',
      halfWave: '无参数静态理论最优基准：固定排除唯一 7 球最小号池「绿双」（06 / 16 / 22 / 28 / 32 / 38 / 44），理论不开率 42/49 = 85.71%。',
    },
  },
};

export const MODEL_KEYS: ColorParityModelKey[] = ['ensemble', 'prior'];

export type ParsedColorParityDraw = {
  year: number;
  No: number;
  specialNumber: number;
  specialColor: BallColor;
  specialParity: BallParity;
  specialSize: BallSize;
  specialClassIdx: number;
  specialLabel: string;
  regularNumbers: number[] | null;
  regularClassIndices: number[] | null;
};

export type DataIntegrity = {
  rejected: number;
  duplicatePeriods: number;
  missingOrInvalidPeriods: number;
  vectorMissingMetadata: number;
};

export type VectorNeighborInfo = {
  No: number;
  specialNumber: number;
  label: string;
  similarity: number;
  weight: number;
};

export type VectorWindowDetail = {
  lookback: number;
  shortWindow: number;
  neighborCount: number;
  share: number;
  nearest: VectorNeighborInfo[];
};

export type ClassScoreItem = {
  classIdx: number;
  label: string;
  color: BallColor;
  parity: BallParity;
  size: BallSize | null;
  ballCount: number;
  isMinPool: boolean;
  openProb: number;
  excludeProb: number;
  theoreticalNotRate: number;
};

export type ModelForecast = {
  pickIdx: number;
  pickLabel: string;
  runnerUpIdx: number;
  runnerUpLabel: string;
  probs: number[];
  ranked: ClassScoreItem[];
};

export type ColorParityRow = {
  targetNo: number;
  actual: ParsedColorParityDraw | null;
  forecasts: Record<ColorParityModelKey, ModelForecast>;
  results: Record<ColorParityModelKey, boolean | null>;
  vectorWindows: VectorWindowDetail[];
  agreed: boolean;
};

export type ModelBacktestSummary = {
  count: number;
  successCount: number;
  failureCount: number;
  successRate: number;
};

export type ModelStreakSummary = {
  current: number | null;
  recentLongest: number | null;
  allLongest: number | null;
};

export type ClassDiagnostic = ClassMeta & {
  actualCount: number;
  expectedCount: number;
  actualNotRate: number;
  currentOmission: number;
  maxOmission: number;
};

export type StatisticalDiagnostics = {
  sampleCount: number;
  marginalChi2: number;
  marginalDf: number;
  marginalCritical05: number;
  marginalSignificant: boolean;
  markovChi2: number;
  markovDf: number;
  markovCritical05: number;
  markovSignificant: boolean;
  theoreticalMaxNotRate: number;
  classes: ClassDiagnostic[];
};

export type ColorParityObservation = {
  year: number;
  mode: ObservationMode;
  validCount: number;
  latestNo: number | null;
  integrity: DataIntegrity;
  rows: ColorParityRow[];
  current: ColorParityRow | null;
  totals: Record<ColorParityModelKey, ModelBacktestSummary>;
  streaks: Record<ColorParityModelKey, ModelStreakSummary>;
  ranges: Array<{
    label: string;
    min: number;
    max: number;
    stats: Record<ColorParityModelKey, ModelBacktestSummary>;
  }>;
  windows: Array<{
    window: number;
    stats: Record<ColorParityModelKey, ModelBacktestSummary>;
  }>;
  diagnostics: StatisticalDiagnostics;
};

function parseRawNumberInfos(record: Record<string, unknown>): unknown[] | null {
  const raw = record.numberInfos ?? record.number_infos;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function classIndexOf(n: number, color: BallColor, mode: ObservationMode, indexByLabel: Map<string, number>): number {
  const label = mode === 'halfWave' ? halfWaveLabelOf(n, color) : subWaveLabelOf(n, color);
  return indexByLabel.get(label)!;
}

function parseHistory(input: unknown, mode: ObservationMode) {
  if (!Array.isArray(input)) throw new Error('历史接口返回格式错误，应为记录数组');
  const classes = MODE_META[mode].classes;
  const indexByLabel = new Map(classes.map((item, idx) => [item.label, idx]));
  const buckets = new Map<number, Array<ParsedColorParityDraw | null>>();
  let rejected = 0;
  let latestNo: number | null = null;

  for (const item of input) {
    if (!item || typeof item !== 'object') {
      rejected += 1;
      continue;
    }
    const record = item as Record<string, unknown>;
    if (
      record.year !== COLOR_PARITY_YEAR ||
      typeof record.No !== 'number' ||
      !Number.isSafeInteger(record.No) ||
      record.No < 1
    ) {
      rejected += 1;
      continue;
    }

    latestNo = Math.max(latestNo ?? 0, record.No);
    const entries = buckets.get(record.No) ?? [];
    const specialNumber = record.n7;
    const infos = parseRawNumberInfos(record);
    const specialInfo = infos && infos.length >= 7 && infos[6] && typeof infos[6] === 'object'
      ? infos[6] as Record<string, unknown>
      : null;

    const validSpecialNumber =
      typeof specialNumber === 'number' &&
      Number.isInteger(specialNumber) &&
      specialNumber >= 1 &&
      specialNumber <= 49;

    const specialColor = specialInfo && specialInfo.number === specialNumber && isBallColor(specialInfo.color)
      ? specialInfo.color
      : null;

    if (!validSpecialNumber || !specialColor) {
      rejected += 1;
      entries.push(null);
      buckets.set(record.No, entries);
      continue;
    }

    let regularNumbers: number[] | null = [];
    let regularClassIndices: number[] | null = [];
    const seen = new Set<number>([specialNumber]);
    for (let pos = 0; pos < 6; pos++) {
      const num = record[`n${pos + 1}`];
      const info = infos && infos[pos] && typeof infos[pos] === 'object'
        ? infos[pos] as Record<string, unknown>
        : null;
      if (
        typeof num !== 'number' ||
        !Number.isInteger(num) ||
        num < 1 ||
        num > 49 ||
        seen.has(num) ||
        !info ||
        info.number !== num ||
        !isBallColor(info.color)
      ) {
        regularNumbers = null;
        regularClassIndices = null;
        break;
      }
      seen.add(num);
      regularNumbers.push(num);
      regularClassIndices.push(classIndexOf(num, info.color, mode, indexByLabel));
    }

    const specialClassIdx = classIndexOf(specialNumber, specialColor, mode, indexByLabel);
    entries.push({
      year: COLOR_PARITY_YEAR,
      No: record.No,
      specialNumber,
      specialColor,
      specialParity: parityForNumber(specialNumber),
      specialSize: sizeForNumber(specialNumber),
      specialClassIdx,
      specialLabel: classes[specialClassIdx].label,
      regularNumbers,
      regularClassIndices,
    });
    buckets.set(record.No, entries);
  }

  const draws: ParsedColorParityDraw[] = [];
  let duplicatePeriods = 0;
  for (const entries of buckets.values()) {
    if (entries.length !== 1) {
      duplicatePeriods += 1;
      continue;
    }
    if (entries[0]) draws.push(entries[0]);
  }
  draws.sort((a, b) => a.No - b.No);

  return {
    draws,
    latestNo,
    integrity: {
      rejected,
      duplicatePeriods,
      missingOrInvalidPeriods: latestNo === null ? 0 : latestNo - draws.length,
      vectorMissingMetadata: draws.filter(draw => !draw.regularClassIndices).length,
    },
  };
}

function normalizeProbs(values: number[]): number[] {
  const sum = values.reduce((acc, v) => acc + v, 0);
  if (sum <= 0) return values.map(() => 1 / values.length);
  return values.map(v => v / sum);
}

function forecastFromProbs(
  probs: number[],
  classes: ClassMeta[],
  lockToMinPool = false,
): ModelForecast {
  const normalized = normalizeProbs(probs);
  const ranked: ClassScoreItem[] = classes.map((meta, classIdx) => ({
    classIdx,
    label: meta.label,
    color: meta.color,
    parity: meta.parity,
    size: meta.size,
    ballCount: meta.ballCount,
    isMinPool: meta.isMinPool,
    openProb: normalized[classIdx],
    excludeProb: 1 - normalized[classIdx],
    theoreticalNotRate: meta.theoreticalNotRate,
  }));

  ranked.sort((a, b) => {
    if (lockToMinPool && a.isMinPool !== b.isMinPool) return a.isMinPool ? -1 : 1;
    return a.openProb - b.openProb || a.ballCount - b.ballCount || a.classIdx - b.classIdx;
  });

  return {
    pickIdx: ranked[0].classIdx,
    pickLabel: ranked[0].label,
    runnerUpIdx: ranked[1].classIdx,
    runnerUpLabel: ranked[1].label,
    probs: normalized,
    ranked,
  };
}

function centeredUnit(block: number[]): number[] {
  const mean = block.reduce((acc, v) => acc + v, 0) / block.length;
  const centered = block.map(v => v - mean);
  const norm = Math.hypot(...centered);
  return norm > 0 ? centered.map(v => v / norm) : centered;
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function buildContextVector(
  byNo: Map<number, ParsedColorParityDraw>,
  targetNo: number,
  lookback: number,
  shortWindow: number,
  classCount: number,
): number[] | null {
  const regShort = Array<number>(classCount).fill(0);
  const regLong = Array<number>(classCount).fill(0);
  const spShort = Array<number>(classCount).fill(0);
  const spLong = Array<number>(classCount).fill(0);
  const regGap = Array<number>(classCount).fill(lookback);
  const spGap = Array<number>(classCount).fill(lookback);

  for (let lag = 0; lag < lookback; lag++) {
    const draw = byNo.get(targetNo - 1 - lag);
    if (!draw || !draw.regularClassIndices) return null;
    for (const cIdx of draw.regularClassIndices) {
      regLong[cIdx] += 1;
      if (lag < shortWindow) regShort[cIdx] += 1;
      if (lag < regGap[cIdx]) regGap[cIdx] = lag;
    }
    const sIdx = draw.specialClassIdx;
    spLong[sIdx] += 1;
    if (lag < shortWindow) spShort[sIdx] += 1;
    if (lag < spGap[sIdx]) spGap[sIdx] = lag;
  }

  const vector = [
    regShort,
    regLong,
    spShort,
    spLong,
    regGap.map(Math.log1p),
    spGap.map(Math.log1p),
  ].flatMap(centeredUnit);
  const norm = Math.hypot(...vector);
  return norm > 0 ? vector.map(v => v / norm) : null;
}

type WindowRawForecast = {
  lookback: number;
  shortWindow: number;
  neighborCount: number;
  probs: number[];
  nearest: VectorNeighborInfo[];
};

function precomputeVectorWindows(
  draws: ParsedColorParityDraw[],
  byNo: Map<number, ParsedColorParityDraw>,
  firstTarget: number,
  finalTarget: number,
  classes: ClassMeta[],
) {
  const {neighbors, minimumNeighbors, temperature, halfLife, priorWeight} = COLOR_PARITY_VECTOR_CONFIG;
  const classCount = classes.length;
  const priors = classes.map(c => c.prior);

  return COLOR_PARITY_VECTOR_WINDOWS.map(({lookback, shortWindow}) => {
    const library: Array<{draw: ParsedColorParityDraw; vector: number[]}> = [];
    for (const draw of draws) {
      const vector = buildContextVector(byNo, draw.No, lookback, shortWindow, classCount);
      if (vector) library.push({draw, vector});
    }

    const byTarget = new Map<number, WindowRawForecast>();
    for (let targetNo = firstTarget; targetNo <= finalTarget; targetNo++) {
      const context = buildContextVector(byNo, targetNo, lookback, shortWindow, classCount);
      if (!context) continue;

      const matched = library
        .filter(({draw}) => draw.No < targetNo - lookback)
        .map(({draw, vector}) => ({
          draw,
          similarity: dotProduct(vector, context),
        }))
        .sort((a, b) => b.similarity - a.similarity || b.draw.No - a.draw.No)
        .slice(0, neighbors);

      if (matched.length < minimumNeighbors) continue;

      const rawWeights = matched.map(row => {
        const recencyPenalty = (Math.LN2 * (targetNo - row.draw.No)) / halfLife;
        return Math.exp((row.similarity - matched[0].similarity) / temperature - recencyPenalty);
      });
      const weightSum = rawWeights.reduce((acc, w) => acc + w, 0);
      const scaledWeights = rawWeights.map(w => (w * matched.length) / weightSum);

      const scores = priors.map(p => p * priorWeight);
      for (let i = 0; i < matched.length; i++) {
        scores[matched[i].draw.specialClassIdx] += scaledWeights[i];
      }
      const probs = scores.map(s => s / (matched.length + priorWeight));

      byTarget.set(targetNo, {
        lookback,
        shortWindow,
        neighborCount: matched.length,
        probs,
        nearest: matched.slice(0, 5).map((row, idx) => ({
          No: row.draw.No,
          specialNumber: row.draw.specialNumber,
          label: row.draw.specialLabel,
          similarity: row.similarity,
          weight: scaledWeights[idx],
        })),
      });
    }
    return byTarget;
  });
}

function computeWindowShares(count: number, feedback: number[][]): number[] {
  if (feedback.length === 0) return Array<number>(count).fill(1 / count);
  const recent = feedback.slice(-COLOR_PARITY_VECTOR_CONFIG.feedbackWindow);
  const means = Array.from({length: count}, (_, idx) =>
    recent.reduce((sum, row) => sum + row[idx], 0) / recent.length,
  );
  const peak = Math.max(...means);
  const expScores = means.map(v => Math.exp(6 * (v - peak)));
  const mass = expScores.reduce((acc, v) => acc + v, 0);
  return expScores.map(w => 0.5 / count + (0.5 * w) / mass);
}

function computeSeqTopKProbs(
  byNo: Map<number, ParsedColorParityDraw>,
  targetNo: number,
  classes: ClassMeta[],
): number[] | null {
  const {lags, neighbors, marginalWindow, priorWeight} = COLOR_PARITY_SEQ_CONFIG;
  const classCount = classes.length;
  const currentSeq: number[] = [];
  for (let lag = 1; lag <= lags; lag++) {
    const draw = byNo.get(targetNo - lag);
    if (!draw) return null;
    currentSeq.push(draw.specialClassIdx);
  }

  const candidates: Array<{target: ParsedColorParityDraw; distance: number}> = [];
  for (let candNo = lags + 1; candNo < targetNo; candNo++) {
    const target = byNo.get(candNo);
    if (!target) continue;
    let distance = 0;
    let complete = true;
    for (let lag = 1; lag <= lags; lag++) {
      const hist = byNo.get(candNo - lag);
      if (!hist) {
        complete = false;
        break;
      }
      if (hist.specialClassIdx !== currentSeq[lag - 1]) {
        distance += 0.7 ** (lag - 1);
      }
    }
    if (complete) candidates.push({target, distance});
  }

  if (candidates.length < 15) return null;
  candidates.sort((a, b) => a.distance - b.distance || a.target.No - b.target.No);
  const selected = candidates.slice(0, neighbors);

  const condCounts = Array<number>(classCount).fill(0);
  for (const row of selected) condCounts[row.target.specialClassIdx] += 1;

  const margStart = Math.max(1, targetNo - marginalWindow);
  const margCounts = Array<number>(classCount).fill(0);
  let margTotal = 0;
  for (let no = margStart; no < targetNo; no++) {
    const draw = byNo.get(no);
    if (!draw) continue;
    margCounts[draw.specialClassIdx] += 1;
    margTotal += 1;
  }
  if (margTotal === 0) return null;

  const raw = classes.map((meta, idx) => {
    const cond = (condCounts[idx] + priorWeight * meta.prior) / (selected.length + priorWeight);
    const marg = (margCounts[idx] + priorWeight * meta.prior) / (margTotal + priorWeight);
    return (cond / marg) * meta.prior;
  });
  return normalizeProbs(raw);
}

function computeMarkovPatternProbs(
  byNo: Map<number, ParsedColorParityDraw>,
  targetNo: number,
  classes: ClassMeta[],
): number[] | null {
  const prev = byNo.get(targetNo - 1);
  if (!prev) return null;
  const prev2 = byNo.get(targetNo - 2);
  const classCount = classes.length;

  const transCounts = Array<number>(classCount).fill(0);
  let transTotal = 0;
  for (let no = 2; no < targetNo; no++) {
    const from = byNo.get(no - 1);
    const to = byNo.get(no);
    if (!from || !to) continue;
    if (from.specialClassIdx === prev.specialClassIdx) {
      transCounts[to.specialClassIdx] += 1;
      transTotal += 1;
    }
  }

  const prevAllCounts = Array<number>(classCount).fill(0);
  prevAllCounts[prev.specialClassIdx] += 1;
  if (prev.regularClassIndices) {
    for (const cIdx of prev.regularClassIndices) prevAllCounts[cIdx] += 1;
  }

  const raw = classes.map((meta, idx) => {
    const base = (transCounts[idx] + COLOR_PARITY_MARKOV_PRIOR * meta.prior) / (transTotal + COLOR_PARITY_MARKOV_PRIOR);
    let fatigue = 1.0;
    if (prev2 && prev2.specialClassIdx === idx && prev.specialClassIdx === idx) {
      fatigue *= 0.92;
    }
    if (prevAllCounts[idx] >= 3) {
      fatigue *= 0.90;
    }
    return base * fatigue;
  });
  return normalizeProbs(raw);
}

function computeBayesFreqProbs(
  byNo: Map<number, ParsedColorParityDraw>,
  targetNo: number,
  classes: ClassMeta[],
): number[] {
  const start = Math.max(1, targetNo - COLOR_PARITY_BAYES_WINDOW);
  const counts = Array<number>(classes.length).fill(0);
  let total = 0;
  for (let no = start; no < targetNo; no++) {
    const draw = byNo.get(no);
    if (!draw) continue;
    counts[draw.specialClassIdx] += 1;
    total += 1;
  }
  return classes.map((meta, idx) =>
    (counts[idx] + COLOR_PARITY_BAYES_PRIOR * meta.prior) / (total + COLOR_PARITY_BAYES_PRIOR),
  );
}

function summarizeModel(rows: ColorParityRow[], model: ColorParityModelKey): ModelBacktestSummary {
  const settled = rows.filter(row => row.actual !== null && row.results[model] !== null);
  const successCount = settled.filter(row => row.results[model] === true).length;
  return {
    count: settled.length,
    successCount,
    failureCount: settled.length - successCount,
    successRate: settled.length > 0 ? successCount / settled.length : 0,
  };
}

function summarizeAllModels(rows: ColorParityRow[]): Record<ColorParityModelKey, ModelBacktestSummary> {
  return {
    ensemble: summarizeModel(rows, 'ensemble'),
    prior: summarizeModel(rows, 'prior'),
  };
}

function computeDiagnostics(
  draws: ParsedColorParityDraw[],
  byNo: Map<number, ParsedColorParityDraw>,
  mode: ObservationMode,
): StatisticalDiagnostics {
  const meta = MODE_META[mode];
  const classCount = meta.classes.length;
  const sampleCount = draws.length;
  const counts = Array<number>(classCount).fill(0);
  const maxOmission = Array<number>(classCount).fill(0);
  const curOmission = Array<number>(classCount).fill(0);

  for (const draw of draws) {
    counts[draw.specialClassIdx] += 1;
    for (let c = 0; c < classCount; c++) {
      if (c === draw.specialClassIdx) {
        curOmission[c] = 0;
      } else {
        curOmission[c] += 1;
        if (curOmission[c] > maxOmission[c]) maxOmission[c] = curOmission[c];
      }
    }
  }

  let marginalChi2 = 0;
  const classDiagnostics: ClassDiagnostic[] = meta.classes.map((cls, idx) => {
    const expectedCount = sampleCount * cls.prior;
    if (expectedCount > 0) {
      marginalChi2 += (counts[idx] - expectedCount) ** 2 / expectedCount;
    }
    return {
      ...cls,
      actualCount: counts[idx],
      expectedCount,
      actualNotRate: sampleCount > 0 ? 1 - counts[idx] / sampleCount : cls.theoreticalNotRate,
      currentOmission: curOmission[idx],
      maxOmission: maxOmission[idx],
    };
  });

  const obs = Array.from({length: classCount}, () => Array<number>(classCount).fill(0));
  const rowSum = Array<number>(classCount).fill(0);
  const colSum = Array<number>(classCount).fill(0);
  let pairs = 0;
  for (const draw of draws) {
    const prev = byNo.get(draw.No - 1);
    if (!prev) continue;
    obs[prev.specialClassIdx][draw.specialClassIdx] += 1;
    rowSum[prev.specialClassIdx] += 1;
    colSum[draw.specialClassIdx] += 1;
    pairs += 1;
  }

  let markovChi2 = 0;
  if (pairs > 0) {
    for (let r = 0; r < classCount; r++) {
      for (let c = 0; c < classCount; c++) {
        const exp = (rowSum[r] * colSum[c]) / pairs;
        if (exp > 0) markovChi2 += (obs[r][c] - exp) ** 2 / exp;
      }
    }
  }

  return {
    sampleCount,
    marginalChi2,
    marginalDf: meta.marginalDf,
    marginalCritical05: meta.marginalCritical05,
    marginalSignificant: sampleCount >= 30 && marginalChi2 > meta.marginalCritical05,
    markovChi2,
    markovDf: meta.markovDf,
    markovCritical05: meta.markovCritical05,
    markovSignificant: pairs >= 60 && markovChi2 > meta.markovCritical05,
    theoreticalMaxNotRate: meta.theoreticalMaxNotRate,
    classes: classDiagnostics,
  };
}

export function buildColorParityObservation(
  input: unknown,
  mode: ObservationMode = 'subWave',
): ColorParityObservation {
  const history = parseHistory(input, mode);
  const classes = MODE_META[mode].classes;
  const priors = classes.map(c => c.prior);
  const byNo = new Map(history.draws.map(draw => [draw.No, draw]));
  const finalTarget = history.latestNo === null ? COLOR_PARITY_BACKTEST_START : history.latestNo + 1;
  const firstTarget = Math.min(COLOR_PARITY_BACKTEST_START, finalTarget);
  const lockEnsembleToMinPool = mode === 'subWave';

  const vectorWindowMaps = precomputeVectorWindows(
    history.draws,
    byNo,
    firstTarget,
    finalTarget,
    classes,
  );
  const vectorFeedback: number[][] = [];
  const rows: ColorParityRow[] = [];

  for (let targetNo = firstTarget; targetNo <= finalTarget; targetNo++) {
    const priorForecast = forecastFromProbs(priors, classes, false);

    const activeWindows = vectorWindowMaps
      .map(windowMap => windowMap.get(targetNo))
      .filter((entry): entry is WindowRawForecast => Boolean(entry));

    let vectorProbs: number[] | null = null;
    let vectorWindows: VectorWindowDetail[] = [];
    if (activeWindows.length > 0) {
      const shares = activeWindows.length === COLOR_PARITY_VECTOR_WINDOWS.length
        ? computeWindowShares(activeWindows.length, vectorFeedback)
        : Array<number>(activeWindows.length).fill(1 / activeWindows.length);
      vectorProbs = classes.map((_, idx) =>
        activeWindows.reduce((sum, win, wi) => sum + win.probs[idx] * shares[wi], 0),
      );
      vectorWindows = activeWindows.map((win, wi) => ({
        lookback: win.lookback,
        shortWindow: win.shortWindow,
        neighborCount: win.neighborCount,
        share: shares[wi],
        nearest: win.nearest,
      }));
    }

    const seqProbs = computeSeqTopKProbs(byNo, targetNo, classes);
    const markovProbs = computeMarkovPatternProbs(byNo, targetNo, classes);
    const bayesProbs = computeBayesFreqProbs(byNo, targetNo, classes);

    const components: Array<{weight: number; probs: number[]}> = [
      {weight: 0.35, probs: priors},
      {weight: 0.10, probs: bayesProbs},
    ];
    if (vectorProbs) components.push({weight: 0.25, probs: vectorProbs});
    if (seqProbs) components.push({weight: 0.20, probs: seqProbs});
    if (markovProbs) components.push({weight: 0.10, probs: markovProbs});

    const totalWeight = components.reduce((acc, item) => acc + item.weight, 0);
    const ensembleProbs = classes.map((_, idx) =>
      components.reduce((sum, item) => sum + item.probs[idx] * (item.weight / totalWeight), 0),
    );

    const ensembleForecast = forecastFromProbs(ensembleProbs, classes, lockEnsembleToMinPool);
    const forecasts: Record<ColorParityModelKey, ModelForecast> = {
      ensemble: ensembleForecast,
      prior: priorForecast,
    };

    const actual = byNo.get(targetNo) ?? null;
    const results: Record<ColorParityModelKey, boolean | null> = {
      ensemble: actual ? actual.specialClassIdx !== ensembleForecast.pickIdx : null,
      prior: actual ? actual.specialClassIdx !== priorForecast.pickIdx : null,
    };

    rows.push({
      targetNo,
      actual,
      forecasts,
      results,
      vectorWindows,
      agreed: ensembleForecast.pickIdx === priorForecast.pickIdx,
    });

    if (actual && activeWindows.length === COLOR_PARITY_VECTOR_WINDOWS.length) {
      vectorFeedback.push(
        activeWindows.map(win => Math.log(Math.max(1e-6, win.probs[actual.specialClassIdx]))),
      );
    }
  }

  const settledRows = rows.filter(row => row.actual !== null);
  const streakRows = settledRows.map(row => ({...row, year: COLOR_PARITY_YEAR, No: row.targetNo}));
  const streaks = Object.fromEntries(
    MODEL_KEYS.map(model => {
      const all = summarizeMissStreaks(
        streakRows,
        row => row.results[model] === true,
        row => row.results[model] !== null,
      );
      const recent = summarizeMissStreaks(
        streakRows.slice(-20),
        row => row.results[model] === true,
        row => row.results[model] !== null,
      );
      return [
        model,
        {
          current: all.eligibleCount && streakRows.at(-1)?.results[model] !== null ? all.current : null,
          recentLongest: recent.eligibleCount ? recent.longest : null,
          allLongest: all.eligibleCount ? all.longest : null,
        },
      ];
    }),
  ) as Record<ColorParityModelKey, ModelStreakSummary>;

  const rangeDefinitions = [
    {label: '初段回看 · 61～150期', min: 61, max: 150},
    {label: '中段验证 · 151～230期', min: 151, max: 230},
    {label: '近期观察 · 231期起', min: 231, max: Infinity},
  ];

  const ranges = rangeDefinitions.map(def => ({
    ...def,
    stats: summarizeAllModels(settledRows.filter(row => row.targetNo >= def.min && row.targetNo <= def.max)),
  }));

  const windows = COLOR_PARITY_ROLLING_WINDOWS.map(window => ({
    window,
    stats: summarizeAllModels(settledRows.slice(-window)),
  }));

  return {
    year: COLOR_PARITY_YEAR,
    mode,
    validCount: history.draws.length,
    latestNo: history.latestNo,
    integrity: history.integrity,
    rows,
    current: rows.at(-1) ?? null,
    totals: summarizeAllModels(settledRows),
    streaks,
    ranges,
    windows,
    diagnostics: computeDiagnostics(history.draws, byNo, mode),
  };
}
