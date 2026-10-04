import {LAB_VERSION, MODELS, validateConfig} from './likely32Lab';
import type {Config, Frozen, LabResult, Model} from './likely32Lab';

type Issue = {year: number; No: number};
export type ForecastSnapshot = {
  id: string; run: string; version: string; model: Model; config: Config;
  after: Issue; createdAt: string; historyDigest: string;
  picks: number[]; original: number[];
  settled: {issue: Issue; special: number; hit: boolean; originalHit: boolean; settledAt: string} | null;
  historyChanged: boolean;
  learning?: {version: string; from: Issue; through: Issue; trainingCount: number; stateSamples: number};
  vectorLearning?: {version: string; from: Issue; through: Issue; trainingCount: number; enabledSlots: number[]};
};
const sameIssue = (a: Issue, b: Issue) => a.year === b.year && a.No === b.No;
const validIssue = (x: Issue) => Number.isInteger(x?.year) && x.year >= 2000 && Number.isInteger(x?.No) && x.No > 0;
const validPicks = (x: number[]) => Array.isArray(x) && x.length === 32 && new Set(x).size === 32 && x.every(n => Number.isInteger(n) && n >= 1 && n <= 49);

export function parseJournal(text: string | null): ForecastSnapshot[] {
  if (!text) return [];
  const items = JSON.parse(text) as ForecastSnapshot[];
  if (!Array.isArray(items)) throw new Error('预测快照格式无效');
  const ids = new Set<string>();
  for (const x of items) {
    if (!x || typeof x.id !== 'string' || ids.has(x.id) || typeof x.run !== 'string' ||
      !MODELS.includes(x.model) || x.version !== LAB_VERSION || !validIssue(x.after) ||
      !Number.isFinite(Date.parse(x.createdAt)) || typeof x.historyDigest !== 'string' ||
      !validPicks(x.picks) || !validPicks(x.original) || typeof x.historyChanged !== 'boolean') throw new Error('预测快照校验失败');
    validateConfig(x.config); ids.add(x.id);
    if (x.learning !== undefined && (!x.learning || typeof x.learning.version !== 'string' || !validIssue(x.learning.from) || !validIssue(x.learning.through) ||
      !sameIssue(x.learning.through, x.after) || x.learning.trainingCount !== 100 || x.learning.stateSamples !== 90)) throw new Error('学习窗口快照无效');
    if (x.vectorLearning !== undefined && (!x.vectorLearning || typeof x.vectorLearning.version !== 'string' || !validIssue(x.vectorLearning.from) || !validIssue(x.vectorLearning.through) ||
      !sameIssue(x.vectorLearning.through, x.after) || x.vectorLearning.trainingCount !== 100 || !Array.isArray(x.vectorLearning.enabledSlots) ||
      new Set(x.vectorLearning.enabledSlots).size !== x.vectorLearning.enabledSlots.length || x.vectorLearning.enabledSlots.some(n => !Number.isInteger(n) || n < 1 || n > 4))) throw new Error('向量学习窗口快照无效');
    if (x.settled && (!validIssue(x.settled.issue) || !Number.isInteger(x.settled.special) || x.settled.special < 1 || x.settled.special > 49 ||
      !Number.isFinite(Date.parse(x.settled.settledAt)) || x.settled.hit !== x.picks.includes(x.settled.special) ||
      x.settled.originalHit !== x.original.includes(x.settled.special))) throw new Error('快照结算记录无效');
    if (x.settled !== null && !x.settled) throw new Error('快照结算格式无效');
  }
  return items;
}

// Only the next draw after a saved snapshot may settle it. Never reconstruct
// unrecorded predictions from later history and label them prospective results.
export function reconcileJournal(records: ForecastSnapshot[], result: LabResult, frozen: Frozen, now: string): ForecastSnapshot[] {
  if (frozen.version !== result.version || Object.keys(frozen.config).some(key => frozen.config[key as keyof Config] !== result.config[key as keyof Config])) throw new Error('冻结配置与计算结果不一致');
  if (result.latest.year < frozen.after.year || result.latest.year === frozen.after.year && result.latest.No < frozen.after.No) throw new Error('历史数据早于冻结起点');
  if (frozen.model === 'rolling100' && !result.current.rolling100.ready) throw new Error('学习数据不足100期');
  if (frozen.model === 'rolling100' && frozen.modelVersion !== result.current.rolling100.version) throw new Error('学习规则版本与冻结记录不一致');
  if (frozen.model === 'vectorLearn' && !result.current.vectorLearning.ready) throw new Error('向量学习数据不足100期');
  if (frozen.model === 'vectorLearn' && frozen.modelVersion !== result.current.vectorLearning.version) throw new Error('向量学习规则版本与冻结记录不一致');
  const vectorLearning = frozen.model === 'vectorLearn' ? {version: result.current.vectorLearning.version, from: result.current.vectorLearning.from!, through: result.current.vectorLearning.through!,
    trainingCount: result.current.vectorLearning.trainingCount, enabledSlots: result.current.vectorLearning.slots.filter(s => s.enabled).map(s => s.position)} : undefined;
  const learning = frozen.model === 'rolling100' ? {version: result.current.rolling100.version, from: result.current.rolling100.from!, through: result.current.rolling100.through!,
    trainingCount: result.current.rolling100.trainingCount, stateSamples: result.current.rolling100.stateSamples} : undefined;
  const next = records.map(snapshot => {
    if (snapshot.run !== frozen.savedAt) return snapshot;
    const at = result.rows.findIndex(r => sameIssue(r, snapshot.after));
    const outcome = at >= 0 ? result.rows[at + 1] : undefined;
    if (snapshot.settled) {
      if (!outcome || !sameIssue(outcome, snapshot.settled.issue) || outcome.special !== snapshot.settled.special) return {...snapshot, historyChanged: true};
      return snapshot;
    }
    if (!outcome) return snapshot;
    return {...snapshot, settled: {issue: {year: outcome.year, No: outcome.No}, special: outcome.special,
      hit: snapshot.picks.includes(outcome.special), originalHit: snapshot.original.includes(outcome.special), settledAt: now}};
  });
  const id = `${frozen.savedAt}/${result.latest.year}/${result.latest.No}`;
  if (!next.some(x => x.id === id)) next.push({id, run: frozen.savedAt, version: result.version, model: frozen.model,
    config: {...result.config}, after: {year: result.latest.year, No: result.latest.No}, createdAt: now,
    historyDigest: result.historyDigest, picks: [...result.current.picks[frozen.model]], original: [...result.current.picks.original],
    settled: null, historyChanged: false, learning, vectorLearning});
  return next;
}
