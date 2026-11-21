const {createHash, randomUUID} = require('node:crypto');
const {mkdir, readFile, rename, writeFile} = require('node:fs/promises');
const {resolve} = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');
const {buildLikely32Lab, features, labHistoryDigest, parseLabHistory} = require('../../src/lib/likely32Lab.ts');
const {
  VECTOR_NEIGHBOR_SPACING, VECTOR_NEIGHBOR_WARMUP, VECTOR_SWAP_WARMUP, VECTOR_WEIGHT_TEMPERATURE, createVectorState, dotProduct,
  numberContext, numberContextBlocks, predictFromVector, updateVectorState,
} = require('../../src/lib/likely32Vector.ts');
const {learnVectorSwaps, rememberVectorSwaps} = require('../../src/lib/likely32VectorLearning.ts');
const {FUSION_GATE_RULE, replayFusionGate} = require('../../src/lib/likely32FusionGate.ts');
const {updateFusionJournal} = require('./fusion-journal.cjs');

const runtimeDir = process.env.LIKELY32_EMBED_DATA_DIR;
const cacheDir = runtimeDir ? resolve(runtimeDir, 'cache') : resolve(__dirname, '.cache');
const reportPath = runtimeDir ? resolve(runtimeDir, 'likely32-embedding-report.json') : resolve(__dirname, '../../public/likely32-embedding-report.json');
const journalDir = runtimeDir ? resolve(runtimeDir, 'journal') : resolve(__dirname, '../../data/likely32-fusion-journal');
const blockLabels = ['log1p capped gap', 'capped gap ratio', 'scaled original rank',
  'last 20 draw frequency', 'last 40 special frequency', 'last draw membership', 'penultimate draw membership'];
const args = process.argv.slice(2);
const cachedOnly = args.includes('--cached-only');
const [historyArgument = 'http://127.0.0.1:3000/api/history'] = args.filter(arg => arg !== '--cached-only');
const liveHistory = /^https?:\/\//i.test(historyArgument);

async function readHistory(source) {
  if (!/^https?:\/\//i.test(source)) return JSON.parse(await readFile(source, 'utf8'));
  const response = await fetch(source, {
    cache: 'no-store',
    headers: {Connection: 'close'},
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`历史接口 HTTP ${response.status}`);
  return response.json();
}

async function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), {mode: 0o644});
  await rename(temporary, path);
}

function normalize(vector) {
  if (!Array.isArray(vector) || !vector.length || !vector.every(Number.isFinite)) {
    throw new Error('向量响应包含无效的数值');
  }
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm === 0) throw new Error('向量响应包含无效的长度');
  return vector.map(value => value / norm);
}

async function requestEmbeddings(url, model, key, input) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model, input, encoding_format: 'float'}),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
        await delay(1000 * 2 ** attempt);
        continue;
      }
      const code = payload?.error?.code ?? payload?.code;
      const suffix = typeof code === 'string' && /^[\w.:-]{1,100}$/.test(code) ? `（${code}）` : '';
      throw new Error(`向量接口 HTTP ${response.status}${suffix}`);
    }
    const payload = await response.json();
    const data = payload.data;
    if (!Array.isArray(data) || data.length !== input.length) throw new Error('向量响应的记录数不匹配');
    const ordered = [...data].sort((a, b) => a.index - b.index);
    if (ordered.some((row, index) => row.index !== index)) throw new Error('向量响应的索引不匹配');
    return {vectors: ordered.map(row => row.embedding), tokens: payload.usage?.prompt_tokens ?? 0};
  }
}

async function embed(contexts) {
  const {EDU_EMBED_BASE_URL: base, EDU_EMBED_MODEL: model, EDU_EMBED_API_KEY: key} = process.env;
  if (!base || !model || !cachedOnly && !key) throw new Error('请在本地 .env 设置 EDU_EMBED_BASE_URL、EDU_EMBED_MODEL、EDU_EMBED_API_KEY');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('EDU_EMBED_BASE_URL 应为 HTTPS API 基址');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/embeddings';
  await mkdir(cacheDir, {recursive: true});
  const vectors = [];
  let tokens = 0, requests = 0;
  for (let start = 0; start < contexts.length; start += 20) {
    const input = contexts.slice(start, start + 20).map(row => row.text);
    const digest = createHash('sha256').update(JSON.stringify([url.href, model, input])).digest('hex');
    const path = resolve(cacheDir, `${digest}.json`);
    const cached = await readFile(path, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (cached === null && cachedOnly) break;
    const batch = cached === null ? await requestEmbeddings(url, model, key, input) : JSON.parse(cached);
    const normalized = batch.vectors.map(normalize);
    const dimensions = vectors[0]?.length ?? normalized[0]?.length;
    if (normalized.length !== input.length || normalized.some(vector => vector.length !== dimensions)) {
      throw new Error('历史向量的维度或记录数不一致');
    }
    if (cached === null) {
      await writeJson(path, batch);
      tokens += batch.tokens;
      requests++;
    }
    vectors.push(...normalized);
    if (vectors.length % 200 === 0 || vectors.length === contexts.length) {
      console.log(`向量 ${vectors.length}/${contexts.length} · 本次请求 ${requests} 批`);
    }
  }
  console.log(`已覆盖 ${vectors.length}/${contexts.length} 个状态`);
  console.log(`本次接口输入 ${tokens} tokens`);
  return {model, vectors};
}

function pairedP(gains, losses) {
  const n = gains + losses, tail = Math.min(gains, losses);
  let logTerm = -n * Math.LN2;
  let probability = Math.exp(logTerm);
  for (let k = 1; k <= tail; k++) {
    logTerm += Math.log(n - k + 1) - Math.log(k);
    probability += Math.exp(logTerm);
  }
  return Math.min(1, 2 * probability);
}

function summarize(label, rows) {
  const hit = key => rows.filter(row => row[key]).length;
  const gains = rows.filter(row => row.embedding && !row.vector).length;
  const losses = rows.filter(row => !row.embedding && row.vector).length;
  return {label, count: rows.length, embedding: hit('embedding'), vector: hit('vector'),
    vectorLearn: hit('vectorLearn'), original: hit('original'), gains, losses, pairedP: pairedP(gains, losses)};
}

function centeredUnit(vector) {
  const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length;
  return normalize(vector.map(value => value - mean));
}

function rankUnit(vector) {
  const sorted = vector.map((_, index) => index).sort((a, b) => vector[a] - vector[b]);
  const ranks = Array(vector.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && vector[sorted[end]] === vector[sorted[start]]) end++;
    for (let i = start; i < end; i++) ranks[sorted[i]] = (start + end - 1) / 2;
    start = end;
  }
  return centeredUnit(ranks);
}

function replayEmbedding(vectors, contexts, history, {similarity = dotProduct, learn = false} = {}) {
  const state = createVectorState();
  const learnedSwaps = [];
  const hits = vectors.map((vector, index) => {
    const {order} = contexts[index];
    const prediction = predictFromVector(vector, order, state, (a, b, prior) => similarity(a, b, prior, index));
    const original = order.slice(0, 32);
    const picks = learn ? learnVectorSwaps(original, prediction.details.swaps, learnedSwaps).picks : prediction.picks;
    const actual = history[index + 10];
    updateVectorState(state, prediction.context, actual, original, prediction.picks);
    if (learn) rememberVectorSwaps(learnedSwaps, actual, prediction.details.swaps);
    return picks.includes(actual.numbers[6]);
  }).slice(VECTOR_SWAP_WARMUP);
  return {hits, state};
}

function compareCandidates(candidates, vectors, contexts, history, rows) {
  const indexed = rows.map((row, index) => ({...row, index}));
  const windows = [
    {label: '2025 年及以前', rows: indexed.filter(row => row.year <= 2025)},
    {label: '2026 年起', rows: indexed.filter(row => row.year >= 2026)},
    {label: '2026-276期起', rows: indexed.filter(row => row.year > 2026 || row.year === 2026 && row.No >= 276)},
    {label: '近100期', rows: indexed.slice(-100)},
    {label: '近20期', rows: indexed.slice(-20)},
    {label: '全历史', rows: indexed},
  ];
  const validation = windows[1].rows;
  const comparisons = candidates.map(({name, input = vectors, precomputedHits, ...options}) => {
    const hits = precomputedHits ?? replayEmbedding(input, contexts, history, options).hits;
    const gains = validation.filter(row => hits[row.index] && !row.vector).length;
    const losses = validation.filter(row => !hits[row.index] && row.vector).length;
    return {name, hits: windows.map(window => window.rows.filter(row => hits[row.index]).length),
      validationVsVector: {gains, losses, pairedP: pairedP(gains, losses)}};
  });
  // Ties preserve the declared order. The later periods never participate in selection.
  const selection = windows[0].rows.length ? [...comparisons].sort((a, b) => b.hits[0] - a.hits[0])[0].name : null;
  const baselines = [['原向量（手工特征）', 'vector'], ['向量历史学习', 'vectorLearn']].map(([name, key]) => ({
    name, hits: windows.map(window => window.rows.filter(row => row[key]).length),
  }));
  console.table([...comparisons, ...baselines].map(row => ({
    scheme: row.name,
    ...Object.fromEntries(windows.map((window, index) => [window.label, `${row.hits[index]}/${window.rows.length}`])),
  })));
  console.log(`按 2025 年及以前回测选择：${selection ?? '暂无数据'}`);
  return {selection, windows: windows.map(({label, rows}) => ({label, count: rows.length})), rows: [...comparisons, ...baselines]};
}

function compareSimilarities(vectors, contexts, history, rows) {
  // Every eligible neighbor and forecast comes after these warmup states.
  const reference = vectors.slice(0, VECTOR_NEIGHBOR_WARMUP);
  const centroid = vectors[0].map((_, i) => reference.reduce((sum, vector) => sum + vector[i], 0) / reference.length);
  const candidates = [
    {name: '余弦', precomputedHits: rows.map(row => row.embedding)},
    // Angular and L2 preserve cosine rank on unit vectors, but change the neighbor weights.
    {name: '角度', similarity: (a, b) => 1 - 2 * Math.acos(Math.min(1, Math.max(-1, dotProduct(a, b)))) / Math.PI},
    {name: '欧氏距离', similarity: (a, b) => 1 - Math.sqrt(Math.max(0, 2 - 2 * dotProduct(a, b)))},
    {name: '曼哈顿距离', similarity: (a, b) => {
      let distance = 0;
      for (let i = 0; i < a.length; i++) distance += Math.abs(a[i] - b[i]);
      return 1 - distance / Math.sqrt(a.length);
    }},
    {name: 'Pearson', input: vectors.map(centeredUnit)},
    {name: 'Spearman', input: vectors.map(rankUnit)},
    {name: '中心化余弦', input: vectors.map(vector => normalize(vector.map((value, i) => value - centroid[i])))},
  ];
  return compareCandidates(candidates, vectors, contexts, history, rows);
}

function neighborPercentiles(vectors, index) {
  const eligible = [];
  for (let prior = VECTOR_NEIGHBOR_WARMUP; prior <= index - VECTOR_NEIGHBOR_SPACING; prior++) {
    eligible.push({prior, score: dotProduct(vectors[prior], vectors[index])});
  }
  eligible.sort((a, b) => b.score - a.score || b.prior - a.prior);
  const ranks = new Float64Array(index);
  eligible.forEach(({prior}, rank) => {ranks[prior] = 1 - rank / Math.max(1, eligible.length - 1);});
  return ranks;
}

function rollingCentered(vectors, window) {
  const sum = Array(vectors[0].length).fill(0);
  return vectors.map((vector, index) => {
    const count = Math.min(index, window);
    const centered = count ? normalize(vector.map((value, i) => value - sum[i] / count)) : vector;
    const expired = vectors[index - window];
    vector.forEach((value, i) => {sum[i] += value - (expired?.[i] ?? 0);});
    return centered;
  });
}

const fusedRank = (qwen, manual, weight, prior) => weight * qwen[prior] + (1 - weight) * manual[prior];

function compareStrategies(vectors, contexts, history, rows) {
  const manual = contexts.slice(0, vectors.length).map(row => row.manual);
  // Use only the eligible earlier states for each query's ranks.
  const qwenRanks = vectors.map((_, index) => neighborPercentiles(vectors, index));
  const manualRanks = manual.map((_, index) => neighborPercentiles(manual, index));
  const blend = weight => (_a, _b, prior, index) => fusedRank(qwenRanks[index], manualRanks[index], weight, prior);
  const weight = FUSION_GATE_RULE.qwenWeight;
  const fusion = replayEmbedding(vectors, contexts, history, {similarity: blend(weight)});
  // Convert an age half-life to a penalty on the similarity used by the softmax.
  const recency = halfLife => (a, b, prior, index) =>
    dotProduct(a, b) - VECTOR_WEIGHT_TEMPERATURE * Math.LN2 * (index - prior) / halfLife;
  const candidates = [
    {name: 'Qwen 排名百分位', similarity: blend(1)},
    ...[0.25, 0.5].map(weight => ({name: `融合 Qwen ${weight * 100}%`, similarity: blend(weight)})),
    {name: `融合 Qwen ${weight * 100}%`, precomputedHits: fusion.hits},
    ...[90, 250].map(halfLife => ({name: `Qwen 近邻半衰期 ${halfLife} 期`, similarity: recency(halfLife)})),
    {name: 'Qwen 前100期滚动中心化', input: rollingCentered(vectors, 100)},
    {name: 'Qwen 余弦＋换码学习', learn: true},
    {name: '融合 Qwen 50%＋换码学习', similarity: blend(0.5), learn: true},
  ];
  return {strategies: compareCandidates(candidates, vectors, contexts, history, rows), fusion};
}

function buildContext(past) {
  const items = features(past);
  const order = [...items].sort((a, b) => b.score - a.score || a.n - b.n).map(item => item.n);
  const blocks = numberContextBlocks(past, items, order);
  // Number positions are 01 to 49. No target period number or outcome is sent.
  const text = ['Lottery number state before the draw. Each sequence is ordered by numbers 01 to 49.',
    ...blocks.map((block, index) => `${blockLabels[index]}: ${block.map(value => Number(value.toFixed(3))).join(' ')}`)].join('\n');
  return {text, order, manual: numberContext(past, items, order)};
}

async function evaluateGate(rows, fusion, vectors, contexts, history, lab) {
  const rule = FUSION_GATE_RULE;
  const replay = replayFusionGate(rows.map((row, index) => ({...row, fusion: fusion.hits[index]})));
  const {after} = rule;
  const isLater = ({year, No}) => year > after.year || year === after.year && No > after.No;
  const summarizeGate = (label, window) => {
    const gains = window.filter(row => row.hit && !row.vector).length;
    const losses = window.filter(row => !row.hit && row.vector).length;
    return {
      label, count: window.length, gated: window.filter(row => row.hit).length,
      vector: window.filter(row => row.vector).length, fusion: window.filter(row => row.fusion).length,
      activations: window.filter(row => row.enabled).length, gains, losses, pairedP: window.length ? pairedP(gains, losses) : null,
    };
  };
  const windows = [
    summarizeGate('规则固定后', replay.rows.filter(isLater)),
    summarizeGate('2026 年起回放', replay.rows.filter(row => row.year >= 2026)),
    summarizeGate('近100期回放', replay.rows.slice(-100)),
    summarizeGate('全历史回放', replay.rows),
  ];
  let current = null;
  const {year, No} = history.at(-1);
  const afterLatest = {year, No};
  if (vectors.length === contexts.length && (isLater(afterLatest) || year === after.year && No === after.No)) {
    const decision = replay.current;
    let picks = decision.enabled ? null : lab.current.picks.vector;
    if (decision.enabled) {
      const context = buildContext(history);
      try {
        const {vectors: [vector]} = await embed([context]);
        if (vector && vector.length !== vectors[0].length) throw new Error('当前向量的维度与历史不一致');
        if (vector) {
          const index = vectors.length;
          const qwen = neighborPercentiles([...vectors, vector], index);
          const manual = neighborPercentiles([...contexts.map(row => row.manual), context.manual], index);
          picks = predictFromVector(vector, context.order, fusion.state,
            (_a, _b, prior) => fusedRank(qwen, manual, rule.qwenWeight, prior)).picks;
        }
      } catch (error) {
        console.error(`当前状态向量未生成（${error.message}）`);
      }
    }
    current = {after: afterLatest, ...decision, picks};
  }
  console.table(windows);
  if (current) console.log(`当前融合门槛 ${current.gains} 救回 / ${current.losses} 损失，${current.enabled ? '启用融合' : '使用原向量'}`);
  return {rule, windows, current};
}

async function main() {
  const raw = await readHistory(historyArgument);
  const history = parseLabHistory(raw);
  if (runtimeDir) {
    const digest = labHistoryDigest(history);
    const published = await readFile(reportPath, 'utf8').then(JSON.parse).catch(() => null);
    if (published?.version === 1 && published.historyDigest === digest && published.model === process.env.EDU_EMBED_MODEL
      && published.fusionGate?.rule?.version === FUSION_GATE_RULE.version && published.missingPeriods === 0
      && published.fusionGate.current?.picks && (!liveHistory || published.journal?.currentPending)) return;
  }
  const warmup = VECTOR_SWAP_WARMUP;
  if (history.length <= 10 + warmup) throw new Error('至少需要131期连续历史用于向量回测');
  const contexts = [];
  for (let target = 10; target < history.length; target++) {
    contexts.push(buildContext(history.slice(0, target)));
  }
  const {model, vectors} = await embed(contexts);
  if (vectors.length <= warmup) throw new Error('已缓存的连续向量不足以完成回测');
  const lab = buildLikely32Lab(raw);
  const rows = replayEmbedding(vectors, contexts, history).hits.map((embedding, index) => {
    const {year, No, hits} = lab.rows[index + warmup];
    return {year, No, embedding, vector: hits.vector, vectorLearn: hits.vectorLearn, original: hits.original};
  });
  const issue = ({year, No}) => ({year, No});
  const windows = [
    summarize('近20期', rows.slice(-20)),
    summarize('近100期', rows.slice(-100)),
    summarize('2026-276期起', rows.filter(row => row.year > 2026 || row.year === 2026 && row.No >= 276)),
    summarize('预热后全历史', rows),
  ].filter(window => window.count);
  const similarities = compareSimilarities(vectors, contexts, history, rows);
  const {strategies, fusion} = compareStrategies(vectors, contexts, history, rows);
  const fusionGate = await evaluateGate(rows, fusion, vectors, contexts, history, lab);
  if (runtimeDir && fusionGate.current?.enabled && !fusionGate.current.picks) throw new Error('当前融合号码未生成');
  let confirmation = null;
  if (liveHistory && fusionGate.current?.picks) {
    try {
      confirmation = parseLabHistory(await readHistory(historyArgument));
    } catch (error) {
      if (runtimeDir) throw new Error(`历史接口复核失败（${error.message}）`);
      console.error(`本次留档跳过，历史接口复核失败（${error.message}）`);
    }
    if (runtimeDir && labHistoryDigest(confirmation) !== lab.historyDigest) throw new Error('开奖数据已变化，等待下一次更新');
  }
  const journal = await updateFusionJournal({root: journalDir, model, version: FUSION_GATE_RULE.version,
    history, sourceRows: liveHistory ? raw : null, confirmation, current: fusionGate.current, baseline: lab.current.picks.vector});
  const report = {version: 1, model, dimensions: vectors[0].length, historyDigest: lab.historyDigest, missingPeriods: contexts.length - vectors.length,
    from: issue(rows[0]), through: issue(rows.at(-1)), windows, similarities, strategies, fusionGate, journal};
  await writeJson(reportPath, report);
  console.table(windows);
  console.log(`回测截至 ${report.through.year}-${report.through.No}，已写入 ${reportPath}`);
}

main().catch(error => {
  console.error(error.message, error.cause?.code ?? '');
  process.exitCode = 1;
});
