import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import engine from '../generated/vector/likely32Lab.js';
import {SCHEDULERS} from './scheduler.js';

const models = ['vectorLearn', 'vector'];
const issue = row => ({year: row.year, No: row.No});
const key = row => `${row.year}-${String(row.No).padStart(3, '0')}`;
const caveat = '历史回放逐期只使用此前数据，但这些方案已经在历史上探索过，回测并非独立样本外验证，也不是下一期概率。';
const expansion = '保留原32码，按当期开奖前的原规则排名补入4个未选号码；不重新训练。';
const issueSchema = {type: 'object', properties: {year: {type: 'integer', minimum: 2000}, No: {type: 'integer', minimum: 1}}, required: ['year', 'No'], additionalProperties: false};
const common = {as_of: {...issueSchema, description: '可选数据截止期（包含该期）；计算前先截断，较晚开奖不能参与学习。'}};
const tool = (name, description, properties) => ({name, description,
  inputSchema: {type: 'object', properties: {...common, ...properties}, additionalProperties: false},
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true}});
export const vectorTools = [
  tool('get_number_forecast', '号码级学习：使用此前100个已结算样本拟合49码共享特征权重，返回全49码排序与前32码。评分未经概率校准，不修改页面。', {}),
  tool('backtest_number_learner', '固定号码级模型的逐期回测，与原向量和历史学习按相同目标期比较；报告救回与损失，以及共同漏中特别码救回情况。', {window:{type:'integer',enum:[20,50,100],default:100},include_rows:{type:'boolean',default:false}}),
  tool('diagnose_candidate_pool', '诊断参数候选是否重复、共享多少号码、哪些特别码被全部候选漏掉。事后任一候选命中仅表示候选覆盖上限，不是可实现预测率，不参与调度选择。', {window: {type: 'integer', enum: [20,50,100], default: 100}}),
  tool('get_scheduled_forecast', '用固定的历史调度规则从16个算法/参数候选选择下一期32码；返回参数和只含此前数据的选择依据。不是LLM自由猜号。', {scheduler: {type: 'string', enum: SCHEDULERS, default: 'rolling100'}}),
  tool('backtest_scheduler', '对照四种固定调度规则与现有32码方案；每期先按此前100期选择参数，后读取开奖结果。全量回放为探索结果，不自动部署回测赢家。', {window: {type: 'integer', enum: [20,50,100], default: 20}, include_rows: {type: 'boolean', default: false}}),
  tool('get_draw_history', '读取已配置历史源的开奖数据，按期号升序；包含数据指纹和截止期，不修改历史。', {limit: {type: 'integer', minimum: 1, maximum: 2000, default: 100}}),
  tool('get_vector_forecast', '返回向量历史学习与原向量方案的下一期32或36码；预测目标为特别码。36码只按固定补码规则扩展。', {pick_count: {type: 'integer', enum: [32, 36], default: 32}}),
  tool('backtest_vector_models', '对照两组向量方案近20、50、100期32/36码覆盖次数、增益、随机覆盖基准和逐期命中。不自动搜索最优参数。', {window: {type: 'integer', enum: [20, 50, 100], default: 20}, include_rows: {type: 'boolean', default: true}}),
  tool('explain_vector_forecast', '查看当前向量近邻、候选替换和前100期学习证据；相似度与支持度不是命中概率。', {}),
];

export function validateArgs(name, args = {}) {
  const definition = vectorTools.find(t => t.name === name);
  if (!definition) throw new Error(`未知工具: ${name}`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('参数必须是对象');
  for (const k of Object.keys(args)) if (!(k in definition.inputSchema.properties)) throw new Error(`不支持参数: ${k}`);
  if (args.as_of !== undefined) {
    const v = args.as_of;
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['year', 'No'].includes(k)) || !Number.isInteger(v.year) || v.year < 2000 || !Number.isInteger(v.No) || v.No < 1) throw new Error('as_of 必须包含有效的 year 和 No');
  }
  if (args.scheduler !== undefined && !SCHEDULERS.includes(args.scheduler)) throw new Error('不支持的调度规则');
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 2000)) throw new Error('limit 必须为1～2000的整数');
  if (args.pick_count !== undefined && ![32, 36].includes(args.pick_count)) throw new Error('pick_count 仅支持32或36');
  if (args.window !== undefined && ![20, 50, 100].includes(args.window)) throw new Error('window 仅支持20、50或100');
  if (args.include_rows !== undefined && typeof args.include_rows !== 'boolean') throw new Error('include_rows 必须为布尔值');
  return args;
}

export function cutoffHistory(raw, asOf) {
  if (!Array.isArray(raw)) throw new Error('历史接口应返回数组');
  // Cut first: even an invalid or changed future record cannot affect an as-of run.
  const cutoff = asOf ? raw.filter(r => Number(r?.year) < asOf.year || Number(r?.year) === asOf.year && Number(r?.No) <= asOf.No) : raw;
  const history = engine.parseLabHistory(cutoff);
  if (!history.length) throw new Error('历史数据为空');
  if (asOf && !history.some(r => r.year === asOf.year && r.No === asOf.No)) throw new Error('历史中不存在指定截止期');
  return history.map(r => ({...issue(r), ...Object.fromEntries(r.numbers.map((n, i) => [`n${i + 1}`, n]))}));
}

function calculate(history, analysis) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./vector-engine.worker.js', import.meta.url), {workerData: {history, analysis}});
    const timer = setTimeout(() => {reject(new Error('回测计算超时，请稍后重试')); void worker.terminate();}, 90_000);
    worker.once('message', message => {
      clearTimeout(timer); void worker.terminate();
      if (message.error) reject(new Error(message.error)); else resolve(message.result);
    });
    worker.once('error', error => {clearTimeout(timer); reject(error);});
    worker.once('exit', code => {clearTimeout(timer); if (code !== 0) reject(new Error('回测计算线程退出'));});
  });
}

export function createVectorAnalysis({historyUrl = process.env.LOTTERY_HISTORY_URL || 'http://127.0.0.1:3000/api/history', historyFile = process.env.LOTTERY_HISTORY_FILE, loadHistory} = {}) {
  let cache = null;
  // One worker at a time; each call loads current history, with a bounded one-result cache.
  let queue = Promise.resolve();
  const load = loadHistory || (async () => {
    if (historyFile) return JSON.parse(await readFile(historyFile, 'utf8'));
    const url = new URL(historyUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('历史接口必须使用HTTP或HTTPS');
    const response = await fetch(url, {signal: AbortSignal.timeout(20_000), headers: {accept: 'application/json'}});
    if (!response.ok) throw new Error(`历史接口 HTTP ${response.status}`);
    return response.json();
  });
  return async function call(name, input) {
    const args = validateArgs(name, input);
    const history = cutoffHistory(await load(), args.as_of);
    const digest = createHash('sha256').update(JSON.stringify(history)).digest('hex');
    const meta = {historyCount: history.length, from: issue(history[0]), through: issue(history.at(-1)), historySha256: digest, fetchedAt: new Date().toISOString(), asOf: args.as_of || null};
    if (name === 'get_draw_history') return {...meta, order: 'oldest-first', draws: history.slice(-(args.limit ?? 100))};
    const analysis = ['get_number_forecast','backtest_number_learner'].includes(name) ? 'number' : 'base';
    const run = queue.then(async () => {
      if (!cache || cache.digest !== digest || cache.analysis !== analysis) cache = {digest, analysis, result: await calculate(history, analysis)};
      return cache.result;
    });
    queue = run.then(() => undefined, () => undefined);
    const result = await run;
    const provenance = {...meta, labVersion: result.version, modelVersions: {vector: result.current.vector.version, vectorLearn: result.current.vectorLearning.version}, caveat};
    if (name === 'get_number_forecast') return {...provenance,protocol:result.numberLearning.protocol,features:result.numberLearning.features,prediction:result.numberLearning.current};
    if (name === 'backtest_number_learner') {
      const window=args.window??100;
      return {...provenance,protocol:result.numberLearning.protocol,window,comparisons:result.numberLearning.windows[window],
        windows:result.numberLearning.windows,all:result.numberLearning.all,earlier:result.numberLearning.earlier,
        rows:args.include_rows?result.numberLearning.recentRows.slice(-window):undefined};
    }
    if (name === 'diagnose_candidate_pool') {
      const window = args.window ?? 100;
      return {...provenance, window, candidateCount: result.scheduler.candidates.length, reference: 'vector',
        warning: '事后知道特别码后计算任一候选是否命中，不是可执行的选码策略或未来命中概率；不应用它来挑选当期方案。',
        ...result.scheduler.diagnostics[window]};
    }
    if (name === 'get_scheduled_forecast') {
      const scheduler = args.scheduler ?? 'rolling100';
      return {...provenance, protocol: result.scheduler.protocol, scheduler, pickCount: 32, ...result.scheduler.current[scheduler]};
    }
    if (name === 'backtest_scheduler') {
      const window = args.window ?? 20;
      return {...provenance, protocol: result.scheduler.protocol, candidates: result.scheduler.candidates,
        requestedWindow: window, comparisons: result.scheduler.windows[window], windows: result.scheduler.windows,
        earlier: result.scheduler.earlier, all: result.scheduler.all,
        rows: args.include_rows ? result.scheduler.recentRows.slice(-window) : undefined};
    }
    if (name === 'explain_vector_forecast') return {...provenance, vector: result.current.vector, learning: result.current.vectorLearning, expansion36: expansion};
    if (name === 'get_vector_forecast') {
      const count = args.pick_count ?? 32;
      return {...provenance, target: `下一次开奖（${key(result.latest)}期之后）`, pickCount: count, expansion36: count === 36 ? expansion : undefined,
        predictions: models.map(model => ({model, ready: model !== 'vectorLearn' || result.current.vectorLearning.ready,
          picks: [...(count === 36 ? result.current36[model] : result.current.picks[model])].sort((a, b) => a - b)}))};
    }
    const window = args.window ?? 20, rows = result.rows.slice(-window);
    const comparisons = models.flatMap(model => [32, 36].map(count => {
      const eligible = rows.filter(r => model !== 'vectorLearn' || r.vectorLearning.ready);
      const picks = row => count === 32 ? row.picks[model] : row.picks36[model];
      const hits = eligible.filter(r => picks(r).includes(r.special)).length;
      const originalHits = eligible.filter(r => r.hits[model]).length;
      return {model, pickCount: count, sampleCount: eligible.length, warmupExcluded: rows.length - eligible.length, hits, rate: eligible.length ? hits / eligible.length : null,
        equalProbabilityBaseline: count / 49, gainsOverSameModel32: hits - originalHits};
    }));
    return {...provenance, requestedWindow: window, availableRows: rows.length, expansion36: expansion, comparisons,
      rows: args.include_rows === false ? undefined : rows.map(r => ({...issue(r), special: r.special,
        models: models.map(model => ({model, ready: model !== 'vectorLearn' || r.vectorLearning.ready, picks32: [...r.picks[model]].sort((a,b)=>a-b), picks36: [...r.picks36[model]].sort((a,b)=>a-b),
          hit32: r.hits[model], hit36: r.picks36[model].includes(r.special)}))}))};
  };
}
