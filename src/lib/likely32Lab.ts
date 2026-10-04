import {learnVectorSwaps, rememberVectorSwaps} from './likely32VectorLearning';
import type {VectorLearningDetails, VectorLearningRecord} from './likely32VectorLearning';
import {rolling100Prediction} from './likely32Rolling100';
import type {Rolling100Details} from './likely32Rolling100';
import {createVectorState, vectorPrediction, updateVectorState} from './likely32Vector';
import type {VectorDetails} from './likely32Vector';
// An isolated snapshot of the original ranking. Do not import this into the legacy service.
export const LAB_VERSION = 'likely32-lab-v2';
export const BASELINE = 32 / 49;
export const MODELS = ['vectorLearn', 'rolling100', 'vector', 'vectorGuard', 'adaptive', 'original', 'smooth', 'learned', 'balanced'] as const;
export type Model = typeof MODELS[number];
export const MODEL_INFO: Record<Model, {name: string; description: string}> = {
  vectorLearn: {name: '向量历史学习', description: '保留向量近邻，每期用前100期学习四个替换位置的救回与损失，只启用历史证据达标的替换。'},
  rolling100: {name: '前100期滚动学习', description: '只用当前开奖前100期，构造状态并匹配20个近邻。固定学习规则，每次新开奖自动滚动，直接选32码。'},
  vector: {name: '向量间隔近邻', description: '343维号码状态，匹配40个有时间间隔的近邻；每期最多替换4码。历史探索方案，等待后续验证。'},
  vectorGuard: {name: '向量收益门槛', description: '跟踪向量换码相对原规则的收益；只有过去的净收益超过门槛，下一期才启用换码。'},
  adaptive: {name: '动态阶段适应', description: '每期开奖后更新三类状态的表现，校正候选数量，只替换估计更有优势的号码，每期最多4个。'},
  original: {name: '原规则对照', description: '复现原页面32码排序，作为固定对照。'},
  smooth: {name: '连续遗漏评分', description: '将阶梯遗漏加分与连续遗漏比例混合，观察评分空档。'},
  learned: {name: '特别码分组学习', description: '只用此前开奖，按遗漏状态的候选次数与特别码次数估计得分，并向随机基准收缩。'},
  balanced: {name: '分组配额对照', description: '按近期出现、中间遗漏、长期遗漏的号码数量分配32个名额，组内沿用原排序。'},
};
export const GROUPS = ['前两期出现', '遗漏2～5期', '遗漏6期及以上'];
export type Config = {smoothWeight: number; lookback: number; prior: number};
export const DEFAULT_CONFIG: Config = {smoothWeight: 0.5, lookback: 200, prior: 490};
export type Draw = {year: number; No: number; numbers: number[]};
type Features = {n: number; miss: number; ratio: number; score: number; overdue: number; group: number; bucket: number};
export type AdaptiveState = {samples: number; recentExposures: number[]; recentHits: number[]; longExposures: number[]; longHits: number[]};
export type AdaptiveDecision = {recentShares: number[]; longShares: number[]; exposureShares: number[]; relativeRates: number[]; samples: number;
  swaps: {from: number; to: number; fromGroup: number; toGroup: number; advantage: number}[]};
export function createAdaptiveState(): AdaptiveState {
  return {samples: 0, recentExposures: Array<number>(6).fill(0), recentHits: Array<number>(6).fill(0), longExposures: Array<number>(6).fill(0), longHits: Array<number>(6).fill(0)};
}
export type LabRow = {
  year: number; No: number; special: number; miss: number; group: number;
  originalRank: number; originalScore: number;
  picks: Record<Model, number[]>; hits: Record<Model, boolean>;
  pools: number[]; selectedGroups: Record<Model, number[]>;
  adaptive: AdaptiveDecision;
  vector: VectorDetails;
  rolling100: Rolling100Details;
  vectorLearning: VectorLearningDetails;
};
export type Frozen = {version: string; modelVersion?: string; config: Config; model: Model; after: {year: number; No: number}; savedAt: string};

export function validateConfig(config: Config) {
  if (!Number.isFinite(config.smoothWeight) || config.smoothWeight < 0 || config.smoothWeight > 1 ||
    !Number.isInteger(config.lookback) || config.lookback < 20 || config.lookback > 500 ||
    !Number.isInteger(config.prior) || config.prior < 49 || config.prior > 4900) throw new Error('实验参数超出范围');
  return config;
}

export function parseLabHistory(input: unknown): Draw[] {
  if (!Array.isArray(input)) throw new Error('历史接口应返回记录数组');
  const rows = input.map(value => {
    if (!value || typeof value !== 'object') throw new Error('历史记录格式无效');
    const row = value as Record<string, unknown>;
    const year = Number(row.year), No = Number(row.No);
    const numbers = Array.from({length: 7}, (_, i) => Number(row[`n${i + 1}`]));
    if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(No) || No < 1 ||
      numbers.some(n => !Number.isInteger(n) || n < 1 || n > 49) || new Set(numbers).size !== 7) {
      throw new Error('存在无效期号或开奖号码，请先修正历史数据');
    }
    return {year, No, numbers};
  }).sort((a, b) => a.year - b.year || a.No - b.No);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.year === b.year && b.No !== a.No + 1) throw new Error('历史数据存在重复或缺期，暂停实验以免错误计算遗漏');
    if (a.year !== b.year && (b.year !== a.year + 1 || b.No !== 1)) throw new Error('跨年历史不连续，暂停实验');
  }
  return rows;
}

const groupFor = (miss: number) => miss <= 1 ? 0 : miss <= 5 ? 1 : 2;
const bucketFor = (miss: number) => miss <= 5 ? miss : miss <= 10 ? 6 : 7;

function features(history: Draw[]): Features[] {
  const hist = history.map(r => r.numbers);
  const lastRow = new Set(hist.at(-1) ?? []);
  return Array.from({length: 49}, (_, index) => {
    const n = index + 1, appearances: number[] = [];
    hist.forEach((row, i) => {if (row.includes(n)) appearances.push(i);});
    const miss = appearances.length ? hist.length - 1 - appearances[appearances.length - 1] : hist.length;
    const avgGap = appearances.length >= 2
      ? appearances.slice(1).reduce((sum, at, i) => sum + at - appearances[i], 0) / (appearances.length - 1)
      : hist.length / 7;
    const ratio = miss / avgGap;
    let score = 0, overdue = 0;
    if (appearances.length >= 2) {
      overdue = ratio >= 2 ? 3 : ratio >= 1.5 ? 2 : ratio >= 1.2 ? 1.2 : ratio >= 0.9 ? 0.5 : 0;
      score += overdue;
    }
    if (lastRow.has(n)) {
      let rc = 0, rt = 0;
      for (let i = 0; i < hist.length - 1; i++) {
        if (hist[i].includes(n)) {rt++; if (hist[i + 1].includes(n)) rc++;}
      }
      score += (rt > 1 ? rc / rt : 0.14) * 2.5;
    }
    if (hist.length >= 2 && hist[hist.length - 2].includes(n) && !lastRow.has(n)) score += 0.4;
    const c3 = hist.slice(-3).filter(row => row.includes(n)).length;
    if (c3 >= 2) score += c3 * 0.5;
    if (appearances.length >= 3) {
      const gaps = appearances.slice(1).map((at, i) => at - appearances[i]);
      const sd = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - avgGap) ** 2, 0) / gaps.length);
      const cv = avgGap > 0 ? sd / avgGap : 1;
      if (cv < 0.5 && miss >= avgGap * 0.8 && miss <= avgGap * 1.5) score += (1 - cv) * 1.2;
    }
    if ([...lastRow].some(x => Math.abs(x - n) === 1) && miss >= 2) score += 0.3;
    return {n, miss, ratio, score, overdue, group: groupFor(miss), bucket: bucketFor(miss)};
  });
}

export function originalRanking(history: Draw[]) {
  return features(history).sort((a, b) => b.score - a.score || a.n - b.n).map(x => x.n);
}

// Separate original-inside/outside categories retain evidence of the original
// ranking's usefulness within each state, rather than assuming a whole group is equal.
export function adaptivePrediction(items: Features[], original: number[], state: AdaptiveState) {
  const inside = new Set(original.slice(0, 32));
  const order = new Map(original.map((n, i) => [n, i]));
  const category = (x: Features) => x.group * 2 + (inside.has(x.n) ? 0 : 1);
  const estimate = (x: Features) => {
    const b = category(x);
    const longPrior = (state.longHits[b] + 2) / (state.longExposures[b] + 98);
    return (state.recentHits[b] + 98 * longPrior) / (state.recentExposures[b] + 98);
  };
  const outgoing = items.filter(x => inside.has(x.n)).sort((a, b) => estimate(a) - estimate(b) || order.get(b.n)! - order.get(a.n)!);
  const incoming = items.filter(x => !inside.has(x.n)).sort((a, b) => estimate(b) - estimate(a) || order.get(a.n)! - order.get(b.n)!);
  const picks = original.slice(0, 32), swaps: AdaptiveDecision['swaps'] = [];
  if (state.samples >= 40) for (let i = 0; i < 4; i++) {
    const from = outgoing[i], to = incoming[i], advantage = estimate(to) - estimate(from);
    if (advantage < 0.003) break;
    picks[picks.indexOf(from.n)] = to.n;
    swaps.push({from: from.n, to: to.n, fromGroup: from.group, toGroup: to.group, advantage});
  }
  const shares = (hits: number[]) => GROUPS.map((_, g) => (hits[g * 2] + hits[g * 2 + 1]) / Math.max(1, hits.reduce((a, b) => a + b, 0)));
  const relativeRates = GROUPS.map((_, g) => {
    const exposure = state.recentExposures[g * 2] + state.recentExposures[g * 2 + 1];
    return exposure ? 49 * (state.recentHits[g * 2] + state.recentHits[g * 2 + 1]) / exposure : 1;
  });
  return {picks, adaptive: {samples: state.samples, recentShares: shares(state.recentHits), longShares: shares(state.longHits), exposureShares: shares(state.recentExposures), relativeRates, swaps}};
}

export function updateAdaptiveState(state: AdaptiveState, items: Features[], original: number[], special: number) {
  const inside = new Set(original), category = (x: Features) => x.group * 2 + (inside.has(x.n) ? 0 : 1);
  for (let b = 0; b < 6; b++) {
    state.recentExposures[b] *= 0.5 ** (1 / 20); state.recentHits[b] *= 0.5 ** (1 / 20);
    state.longExposures[b] *= 0.5 ** (1 / 80); state.longHits[b] *= 0.5 ** (1 / 80);
  }
  for (const x of items) {state.recentExposures[category(x)]++; state.longExposures[category(x)]++;}
  const actual = items.find(x => x.n === special)!;
  state.recentHits[category(actual)]++; state.longHits[category(actual)]++; state.samples++;
}

function predictions(items: Features[], config: Config, exposures: number[], successes: number[], adaptiveState: AdaptiveState, vector: ReturnType<typeof vectorPrediction>, rolling100: ReturnType<typeof rolling100Prediction>, vectorHistory: VectorLearningRecord[]) {
  const original = [...items].sort((a, b) => b.score - a.score || a.n - b.n);
  const smoothScore = (x: Features) => x.score + config.smoothWeight * (Math.min(3, x.ratio) - x.overdue);
  const learnedScore = (x: Features) => (successes[x.bucket] + config.prior / 49) / (exposures[x.bucket] + config.prior);
  const pools = GROUPS.map((_, i) => original.filter(x => x.group === i));
  const exact = pools.map(p => p.length * 32 / 49), quota = exact.map(Math.floor);
  const remainder = exact.map((x, i) => ({i, value: x - quota[i]})).sort((a, b) => b.value - a.value || a.i - b.i);
  const remaining = 32 - quota.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) quota[remainder[i].i]++;
  const adaptive = adaptivePrediction(items, original.map(x => x.n), adaptiveState);
  const vectorLearning = learnVectorSwaps(original.slice(0, 32).map(x => x.n), vector.details.swaps, vectorHistory);
  const picks: Record<Model, number[]> = {
    vectorLearn: vectorLearning.picks,
    rolling100: rolling100.picks,
    vector: vector.picks, vectorGuard: vector.guardedPicks,
    adaptive: adaptive.picks,
    original: original.slice(0, 32).map(x => x.n),
    smooth: [...items].sort((a, b) => smoothScore(b) - smoothScore(a) || a.n - b.n).slice(0, 32).map(x => x.n),
    learned: [...items].sort((a, b) => learnedScore(b) - learnedScore(a) || b.score - a.score || a.n - b.n).slice(0, 32).map(x => x.n),
    balanced: pools.flatMap((p, i) => p.slice(0, quota[i]).map(x => x.n)),
  };
  return {picks, vectorLearning: vectorLearning.details, rolling100: rolling100.details, vector: vector.details, adaptive: adaptive.adaptive, pools: pools.map(p => p.length), selectedGroups: Object.fromEntries(MODELS.map(m => [m, GROUPS.map((_, g) => items.filter(x => x.group === g && picks[m].includes(x.n)).length)])) as Record<Model, number[]>};
}

export function buildLikely32Lab(input: unknown, config: Config = DEFAULT_CONFIG) {
  validateConfig(config);
  const history = parseLabHistory(input);
  if (history.length < 11) throw new Error('至少需要11期连续历史才能开始实验');
  const rows: LabRow[] = [], exposures = Array<number>(8).fill(0), successes = Array<number>(8).fill(0);
  const training: Array<{exposures: number[]; bucket: number}> = [];
  const adaptiveState = createAdaptiveState(), vectorState = createVectorState();
  const vectorHistory: VectorLearningRecord[] = [];
  for (let t = 10; t < history.length; t++) {
    const past = history.slice(0, t), items = features(past);
    const vector = vectorPrediction(past, items, [...items].sort((a, b) => b.score - a.score || a.n - b.n).map(x => x.n), vectorState);
    // Predict first, then reveal the outcome and update the training window.
    const result = predictions(items, config, exposures, successes, adaptiveState, vector, rolling100Prediction(past), vectorHistory);
    const actual = history[t], special = actual.numbers[6], item = items[special - 1];
    const order = [...items].sort((a, b) => b.score - a.score || a.n - b.n);
    rows.push({year: actual.year, No: actual.No, special, miss: item.miss, group: item.group,
      originalRank: order.findIndex(x => x.n === special) + 1, originalScore: item.score, ...result,
      hits: Object.fromEntries(MODELS.map(m => [m, result.picks[m].includes(special)])) as Record<Model, boolean>});
    updateAdaptiveState(adaptiveState, items, result.picks.original, special);
    updateVectorState(vectorState, vector.context, actual, result.picks.original, result.picks.vector);
    rememberVectorSwaps(vectorHistory, actual, vector.details.swaps);
    const counts = Array<number>(8).fill(0);
    items.forEach(x => {counts[x.bucket]++;});
    counts.forEach((count, b) => {exposures[b] += count;});
    successes[item.bucket]++;
    training.push({exposures: counts, bucket: item.bucket});
    if (training.length > config.lookback) {
      const oldest = training.shift()!;
      oldest.exposures.forEach((count, b) => {exposures[b] -= count;});
      successes[oldest.bucket]--;
    }
  }
  // Diagnostic digest only: local snapshots are not a tamper-proof server ledger.
  let digest = 14695981039346656037n;
  for (const char of history.map(r => `${r.year}:${r.No}:${r.numbers.join(',')}`).join('|')) {
    digest = BigInt.asUintN(64, (digest ^ BigInt(char.charCodeAt(0))) * 1099511628211n);
  }
  const currentItems = features(history);
  const currentVector = vectorPrediction(history, currentItems, [...currentItems].sort((a, b) => b.score - a.score || a.n - b.n).map(x => x.n), vectorState);
  return {version: LAB_VERSION, config, historyDigest: digest.toString(16), historyCount: history.length, latest: history[history.length - 1], rows,
    current: predictions(currentItems, config, exposures, successes, adaptiveState, currentVector, rolling100Prediction(history), vectorHistory), learnedSamples: training.length};
}
export type LabResult = ReturnType<typeof buildLikely32Lab>;

export function summarizeLab(rows: LabRow[], model: Model) {
  if (model === 'rolling100') rows = rows.filter(r => r.rolling100.ready);
  if (model === 'vectorLearn') rows = rows.filter(r => r.vectorLearning.ready);
  const hits = rows.filter(r => r.hits[model]).length;
  const originalHits = rows.filter(r => r.hits.original).length;
  return {count: rows.length, hits, originalHits, rate: rows.length ? hits / rows.length : null,
    gains: rows.filter(r => !r.hits.original && r.hits[model]).length,
    losses: rows.filter(r => r.hits.original && !r.hits[model]).length};
}

export function parseFrozen(value: string | null): Frozen | null {
  try {
    const x = JSON.parse(value ?? 'null') as Frozen | null;
    if (!x || x.version !== LAB_VERSION || !MODELS.includes(x.model) || !Number.isInteger(x.after.year) ||
      !Number.isInteger(x.after.No) || x.after.year < 2000 || x.after.No < 1 || !Number.isFinite(Date.parse(x.savedAt))) return null;
    if (x.modelVersion !== undefined && typeof x.modelVersion !== 'string') return null;
    validateConfig(x.config);
    return x;
  } catch {return null;}
}
