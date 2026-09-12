export const ZODIACS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const;
export type Zodiac = (typeof ZODIACS)[number];
export type ZodiacModel = 'stable' | 'recent';

const YEAR = 2026;
const MODEL_START = 48;
const BACKTEST_START = 151;
const LOOKBACK = 15;
const SWITCH_MARGIN = 1;
const PRIOR_STRENGTH = 12;
const ZODIAC_SET = new Set<string>(ZODIACS);
const PRIOR = ZODIACS.map(zodiac => (zodiac === '马' ? 5 : 4) / 49);

type ZodiacDraw = {
  year: number;
  No: number;
  specialNumber: number;
  zodiac: Zodiac;
};

type ModelConfig = {
  key: ZodiacModel;
  label: string;
  neighbors: number;
  marginalWindow: number | null;
};

export const ZODIAC_MODELS: Record<ZodiacModel, ModelConfig> = {
  stable: { key: 'stable', label: '稳定模型', neighbors: 60, marginalWindow: null },
  recent: { key: 'recent', label: '近期模型', neighbors: 50, marginalWindow: 80 },
};

export type ZodiacObservationRow = {
  targetNo: number;
  actual: ZodiacDraw | null;
  state: 'ready' | 'incomplete';
  choice: ZodiacModel | null;
  switched: boolean;
  rolling: { count: number; stableWins: number; recentWins: number };
  rankings: Record<ZodiacModel, Zodiac[]> | null;
  selected: Zodiac[];
  twoSuccess: boolean | null;
  threeSuccess: boolean | null;
  modelResults: Record<ZodiacModel, { twoSuccess: boolean | null; threeSuccess: boolean | null }>;
};

export type ZodiacBacktestSummary = {
  count: number;
  twoSuccessCount: number;
  twoSuccessRate: number;
  threeSuccessCount: number;
  threeSuccessRate: number;
};

function parseHistory(input: unknown) {
  if (!Array.isArray(input)) throw new Error('历史接口返回格式错误，应为记录数组');
  const buckets = new Map<number, Array<ZodiacDraw | null>>();
  let rejected = 0;
  let latestNo: number | null = null;

  for (const value of input) {
    if (!value || typeof value !== 'object') {
      rejected += 1;
      continue;
    }
    const record = value as Record<string, unknown>;
    if (
      record.year !== YEAR ||
      typeof record.No !== 'number' ||
      !Number.isSafeInteger(record.No) ||
      record.No < 1
    ) {
      rejected += 1;
      continue;
    }

    latestNo = Math.max(latestNo ?? 0, record.No);
    const periodEntries = buckets.get(record.No) ?? [];
    const specialNumber = record.n7;
    const numberInfos = record.numberInfos;
    const specialInfo = Array.isArray(numberInfos) ? numberInfos[6] : null;
    const validInfo = specialInfo && typeof specialInfo === 'object'
      ? specialInfo as Record<string, unknown>
      : null;
    const zodiac = validInfo?.zodiac;
    const valid =
      typeof specialNumber === 'number' &&
      Number.isInteger(specialNumber) &&
      specialNumber >= 1 &&
      specialNumber <= 49 &&
      validInfo?.number === specialNumber &&
      typeof zodiac === 'string' &&
      ZODIAC_SET.has(zodiac);

    if (!valid) {
      rejected += 1;
      periodEntries.push(null);
    } else {
      periodEntries.push({
        year: YEAR,
        No: record.No,
        specialNumber,
        zodiac: zodiac as Zodiac,
      });
    }
    buckets.set(record.No, periodEntries);
  }

  const draws: ZodiacDraw[] = [];
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
    },
  };
}

function modelRanking(
  byNo: Map<number, ZodiacDraw>,
  targetNo: number,
  config: ModelConfig,
): Zodiac[] | null {
  const currentState = Array.from({length: 5}, (_, index) => byNo.get(targetNo - 1 - index));
  if (currentState.some(draw => !draw)) return null;

  const candidates: Array<{ target: ZodiacDraw; distance: number }> = [];
  for (let candidateNo = MODEL_START + 5; candidateNo < targetNo; candidateNo += 1) {
    const target = byNo.get(candidateNo);
    if (!target) continue;
    let distance = 0;
    let complete = true;
    for (let lag = 1; lag <= 5; lag += 1) {
      const historic = byNo.get(candidateNo - lag);
      const current = byNo.get(targetNo - lag);
      if (!historic || !current) {
        complete = false;
        break;
      }
      distance += Number(historic.zodiac !== current.zodiac) * 0.7 ** (lag - 1);
    }
    if (complete) candidates.push({target, distance});
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance || a.target.No - b.target.No);

  const selected = candidates.slice(0, config.neighbors);
  const conditionalCounts = new Array<number>(ZODIACS.length).fill(0);
  for (const candidate of selected) {
    conditionalCounts[ZODIACS.indexOf(candidate.target.zodiac)] += 1;
  }

  const marginalStart = config.marginalWindow === null
    ? MODEL_START + 5
    : Math.max(MODEL_START + 5, targetNo - config.marginalWindow);
  const marginalCounts = new Array<number>(ZODIACS.length).fill(0);
  let marginalCount = 0;
  for (let no = marginalStart; no < targetNo; no += 1) {
    const draw = byNo.get(no);
    if (!draw) continue;
    marginalCounts[ZODIACS.indexOf(draw.zodiac)] += 1;
    marginalCount += 1;
  }
  if (marginalCount === 0) return null;

  const scores = ZODIACS.map((_, index) => {
    const conditional = (conditionalCounts[index] + PRIOR_STRENGTH * PRIOR[index])
      / (selected.length + PRIOR_STRENGTH);
    const marginal = (marginalCounts[index] + PRIOR_STRENGTH * PRIOR[index])
      / (marginalCount + PRIOR_STRENGTH);
    return conditional / marginal;
  });

  return [...ZODIACS].sort((a, b) => {
    const aIndex = ZODIACS.indexOf(a);
    const bIndex = ZODIACS.indexOf(b);
    return scores[aIndex] - scores[bIndex] || aIndex - bIndex;
  });
}

function summarize(
  rows: ZodiacObservationRow[],
  model: ZodiacModel | 'adaptive' = 'adaptive',
): ZodiacBacktestSummary {
  const settled = rows.filter(row => {
    if (!row.actual || row.state !== 'ready') return false;
    return model === 'adaptive' ? row.choice !== null : row.rankings !== null;
  });
  const resultFor = (row: ZodiacObservationRow) => model === 'adaptive'
    ? { twoSuccess: row.twoSuccess, threeSuccess: row.threeSuccess }
    : row.modelResults[model];
  const twoSuccessCount = settled.filter(row => resultFor(row).twoSuccess).length;
  const threeSuccessCount = settled.filter(row => resultFor(row).threeSuccess).length;
  return {
    count: settled.length,
    twoSuccessCount,
    twoSuccessRate: settled.length ? twoSuccessCount / settled.length : 0,
    threeSuccessCount,
    threeSuccessRate: settled.length ? threeSuccessCount / settled.length : 0,
  };
}

export function buildAdaptiveZodiacObservation(input: unknown) {
  const history = parseHistory(input);
  const byNo = new Map(history.draws.map(draw => [draw.No, draw]));
  const rows: ZodiacObservationRow[] = [];
  const finalTarget = history.latestNo === null ? BACKTEST_START : history.latestNo + 1;

  for (let targetNo = BACKTEST_START; targetNo <= finalTarget; targetNo += 1) {
    const stable = modelRanking(byNo, targetNo, ZODIAC_MODELS.stable);
    const recent = modelRanking(byNo, targetNo, ZODIAC_MODELS.recent);
    const rankings = stable && recent ? {stable, recent} : null;
    const eligibleHistory = rows
      .filter(row => row.actual && row.rankings)
      .slice(-LOOKBACK);
    const stableWins = eligibleHistory.filter(row => row.modelResults.stable.twoSuccess).length;
    const recentWins = eligibleHistory.filter(row => row.modelResults.recent.twoSuccess).length;
    const choice: ZodiacModel | null = rankings
      ? eligibleHistory.length === LOOKBACK && recentWins - stableWins >= SWITCH_MARGIN
        ? 'recent'
        : 'stable'
      : null;
    const selected = choice && rankings ? rankings[choice].slice(0, 3) : [];
    const actual = byNo.get(targetNo) ?? null;
    const previousChoice = [...rows].reverse().find(row => row.choice)?.choice ?? null;
    const result = (ranking: Zodiac[] | null, take: number) =>
      actual && ranking ? !ranking.slice(0, take).includes(actual.zodiac) : null;

    rows.push({
      targetNo,
      actual,
      state: rankings ? 'ready' : 'incomplete',
      choice,
      switched: previousChoice !== null && choice !== null && previousChoice !== choice,
      rolling: {count: eligibleHistory.length, stableWins, recentWins},
      rankings,
      selected,
      twoSuccess: actual && selected.length === 3 ? !selected.slice(0, 2).includes(actual.zodiac) : null,
      threeSuccess: actual && selected.length === 3 ? !selected.includes(actual.zodiac) : null,
      modelResults: {
        stable: {twoSuccess: result(stable, 2), threeSuccess: result(stable, 3)},
        recent: {twoSuccess: result(recent, 2), threeSuccess: result(recent, 3)},
      },
    });
  }

  const settledRows = rows.filter(row => row.actual);
  const rangeDefinitions = [
    {label: '初段记录 · 151～180期', min: 151, max: 180},
    {label: '确认记录 · 181～200期', min: 181, max: 200},
    {label: '近期回看 · 201～254期', min: 201, max: 254},
    {label: '后续观察 · 255期起', min: 255, max: Infinity},
  ];
  const windows = [15, 30, 54, 104].map(window => ({
    window,
    ...summarize(settledRows.slice(-window)),
  }));

  return {
    year: YEAR,
    validCount: history.draws.length,
    latestNo: history.latestNo,
    integrity: history.integrity,
    rows,
    current: rows.at(-1) ?? null,
    total: summarize(settledRows),
    stableTotal: summarize(settledRows, 'stable'),
    recentTotal: summarize(settledRows, 'recent'),
    ranges: rangeDefinitions.map(range => ({
      label: range.label,
      ...summarize(settledRows.filter(row => row.targetNo >= range.min && row.targetNo <= range.max)),
    })),
    windows,
    settings: {lookback: LOOKBACK, switchMargin: SWITCH_MARGIN, backtestStart: BACKTEST_START},
  };
}

export type AdaptiveZodiacObservation = ReturnType<typeof buildAdaptiveZodiacObservation>;
