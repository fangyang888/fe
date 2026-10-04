import {useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {BASELINE, DEFAULT_CONFIG, GROUPS, LAB_VERSION, MODEL_INFO, MODELS, parseFrozen, summarizeLab} from './lib/likely32Lab';
import type {Config, Frozen, LabResult, LabRow, Model} from './lib/likely32Lab';
import {parseJournal, reconcileJournal} from './lib/likely32Journal';
import type {ForecastSnapshot} from './lib/likely32Journal';
import './Likely32Lab.css';

const STORAGE_KEY = 'likely32-lab:freeze:v2';
const JOURNAL_KEY = 'likely32-lab:journal:v1';
function persistJournal(result: LabResult, frozen: Frozen | null) {
  const previous = parseJournal(localStorage.getItem(JOURNAL_KEY));
  if (!frozen) return previous;
  const next = reconcileJournal(previous, result, frozen, new Date().toISOString());
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
  return next;
}
const pct = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const ball = (n: number) => String(n).padStart(2, '0');
const issue = (r: {year: number; No: number}) => `${r.year}-${String(r.No).padStart(3, '0')}`;
const sameConfig = (a: Config, b: Config) => a.smoothWeight === b.smoothWeight && a.lookback === b.lookback && a.prior === b.prior;
const readFrozen = () => {try {return parseFrozen(localStorage.getItem(STORAGE_KEY));} catch {return null;}};
type Legacy = {historyMeta?: {count: number; latest: {year: number; No: number}}; currentPredictions?: number[]; specialCodeStats?: {windows: {periods: number; coveredCount: number}[]}};

function parity(result: LabResult, legacy: Legacy | null) {
  if (!legacy?.historyMeta || !legacy.currentPredictions || !legacy.specialCodeStats) return {ok: false, message: '未取得原页面统计，本次仅展示本地复算对照。'};
  if (legacy.historyMeta.count !== result.historyCount || issue(legacy.historyMeta.latest) !== issue(result.latest)) return {ok: false, message: '原页面缓存与历史接口期数不同，请刷新后再核对。'};
  const currentMatches = JSON.stringify(result.current.picks.original) === JSON.stringify(legacy.currentPredictions);
  const windowsMatch = [10, 20, 50, 100].every(periods => {
    const w = legacy.specialCodeStats?.windows?.find(w => w.periods === periods);
    return w && result.rows.slice(-periods).filter(r => r.hits.original).length === w.coveredCount;
  });
  return {ok: currentMatches && windowsMatch, message: currentMatches && windowsMatch ? '已核对：当前原32码及各窗口覆盖次数与原页面一致。' : '对照校验不一致：请核对原页面缓存与历史数据，暂勿依据本次结果比较。'};
}

function Balls({numbers, added = []}: {numbers: number[]; added?: number[]}) {
  return <div className="l32-balls">{numbers.map(n => <span className={added.includes(n) ? 'is-added' : ''} key={n}>{ball(n)}</span>)}</div>;
}

function ChangeCount({rows, model}: {rows: LabRow[]; model: Model}) {
  const s = summarizeLab(rows, model);
  return <><strong>{pct(s.rate)}</strong><span>{s.hits}/{s.count} · <em className="l32-gain">救回 {s.gains}</em> / <em className="l32-loss">损失 {s.losses}</em></span></>;
}

function AdaptiveStatus({result}: {result: LabResult}) {
  return <section className="l32-panel l32-live"><div className="l32-section-head"><div><small>LIVE / 每次刷新后随开奖更新</small><h2>当前阶段与动态分配</h2></div><span className="l32-pill">{result.current.adaptive.samples < 40 ? '学习预热中' : result.current.adaptive.swaps.length ? `本期替换 ${result.current.adaptive.swaps.length} 码` : '本期维持原32码'}</span></div>
        <div className="l32-stages">{GROUPS.map((group, g) => {
          const a = result.current.adaptive, delta = (a.recentShares[g] - a.longShares[g]) * 100;
          return <article key={group}><span>{group}</span><small>近期加权特别码占比 / 长期参考</small><strong>{pct(a.recentShares[g])}</strong><span>长期 {pct(a.longShares[g])} · {delta >= 0 ? '+' : ''}{delta.toFixed(1)} 个百分点</span><p>候选占比 {pct(a.exposureShares[g])} · 单码相对基准 {a.relativeRates[g].toFixed(2)}倍</p><p>本期名额：{result.current.selectedGroups.original[g]} → <b>{result.current.selectedGroups.adaptive[g]}</b> / 候选 {result.current.pools[g]} 个</p></article>;
        })}</div>
        {result.current.adaptive.swaps.length ? <div className="l32-table-wrap"><table><caption>每个替换都在开奖前决定；估计优势未经过独立验证</caption><thead><tr><th>换出</th><th>换入</th><th>平滑评分差值</th></tr></thead><tbody>{result.current.adaptive.swaps.map(s => <tr key={s.to}><td>{ball(s.from)} · {GROUPS[s.fromGroup]}</td><td>{ball(s.to)} · {GROUPS[s.toGroup]}</td><td>+{(s.advantage * 100).toFixed(2)} 个百分点</td></tr>)}</tbody></table></div> : <p>当前没有达到替换门槛的候选，沿用原32码。检测到阶段变化不代表一定要换码。</p>}
        <p className="l32-footnote">特别码占比和候选占比使用相同的近期衰减权重；两者之比为单码相对基准，1倍代表等概率参考。它描述已发生的数据，不是下一期概率。近期半衰期20期并非只看最近20期。该区始终显示动态方案。</p>
      </section>;
}

function VectorStatus({result, model}: {result: LabResult; model: Model}) {
  const v = result.current.vector, guarded = model === 'vectorGuard', learned = model === 'vectorLearn', learning = result.current.vectorLearning;
  const enabled = !guarded || v.guardActive;
  return <section className="l32-panel l32-live" aria-label="向量实验详情">
    <div className="l32-section-head"><div><small>VECTOR / 每次新开奖重新匹配</small><h2>向量近邻与换码依据</h2></div><span className="l32-pill">{learned ? `本期启用 ${learning.slots.filter(s => s.enabled).length}/${v.swaps.length} 个候选替换` : enabled ? `本期替换 ${v.swaps.length} 码` : '收益门槛未通过，沿用原规则'}</span></div>
    <p>用343维号码状态寻找相似历史；近邻之间至少间隔5期，并排除距离当前不足5期的状态。只在有评分优势时替换，每期最多4码。</p>
    <div className="l32-stages l32-vector-metrics">{[20, 50, 100].map(w => {
      const rows = result.rows.slice(-w), comparison = summarizeLab(rows, model), net = comparison.gains - comparison.losses;
      return <article key={w}><span>近{w}期覆盖</span><ChangeCount rows={rows} model={model}/><p>原规则 {pct(summarizeLab(rows, 'original').rate)} · 净{net >= 0 ? '+' : ''}{net}期</p></article>;
    })}</div>
    {!learned ? <p>匹配 {v.neighborCount} 个近邻，加权有效数量 {v.effectiveNeighbors.toFixed(1)}。过去换码净收益（加权）{v.meanGain === null ? '预热中' : `${v.meanGain >= 0 ? '+' : ''}${(v.meanGain * 100).toFixed(1)}个百分点`}；收益门槛 {v.standardError === null ? '预热中' : `${(v.standardError * 75).toFixed(1)}个百分点`}，{v.guardActive ? '已通过' : '未通过'}。</p> : <p>学习层使用 {learning.from ? issue(learning.from) : '—'} → {learning.through ? issue(learning.through) : '—'}，共 {learning.trainingCount} 期。向量近邻库仍使用全部此前历史；前100期用于决定本期是否启用各个候选替换。</p>}
    <p className="l32-warning">这是利用截至2026-275期历史探索出的方案，回测包含用于比较方案的数据。请用冻结后实际保存的新预测检验；余弦相似度不是命中概率。</p>
    {learned ? <div className="l32-table-wrap l32-vector-table"><table><caption>四个替换位置的前100期学习记录；未启用的候选也会在开奖后核算，避免只学习已选择的结果</caption><thead><tr><th>候选位置</th><th>本期换出 → 换入</th><th>历史救回 / 损失</th><th>平滑支持度</th><th>本期决定</th></tr></thead><tbody>{learning.slots.map(s => <tr key={s.position}><th>第{s.position}个</th><td>{s.proposal ? `${ball(s.proposal.from)} → ${ball(s.proposal.to)}` : '无'}</td><td>{s.gains} / {s.losses}<span>候选出现 {s.appearances} 期</span></td><td>{pct(s.support)}</td><td>{s.enabled ? '启用' : '保留原码'}<span>{s.reason}</span></td></tr>)}</tbody></table></div> : v.swaps.length ? <div className="l32-table-wrap l32-vector-table"><table><caption>{enabled ? '本期启用的替换' : '候选替换：本期未启用'} · 平滑评分差值未经概率校准</caption><thead><tr><th>换出</th><th>换入</th><th>评分差值</th></tr></thead><tbody>{v.swaps.map(s => <tr key={s.to}><td>{ball(s.from)}</td><td>{ball(s.to)}</td><td>+{(s.advantage * 100).toFixed(2)}pp</td></tr>)}</tbody></table></div> : <p>当前没有达到门槛的替换，保留原32码。</p>}
    <details className="l32-vector-neighbors"><summary>查看最相似的10个历史状态及随后开奖结果</summary><div className="l32-table-wrap"><table><caption>历史期号为目标开奖期；匹配的是该期开奖前的状态，随后结果在当前已知</caption><thead><tr><th>历史目标期</th><th>余弦相似度</th><th>随后特别码</th><th>归一化权重</th></tr></thead><tbody>{v.neighbors.map(n => <tr key={issue(n)}><th>{issue(n)}</th><td>{n.similarity.toFixed(3)}</td><td>{ball(n.special)}</td><td>{n.weight.toFixed(2)}</td></tr>)}</tbody></table></div></details>
    {learned ? <p className="l32-footnote">规则固定：学习最近100个已结算期，分别统计四个候选位置；至少出现4次救回或损失，且（救回+1）÷（救回+损失+2）达到60%，才启用该替换。该支持度仅描述替换影响结果时的有利比例，不是下一期覆盖概率。先生成32码，再读取本期结果更新学习；每期可启用0～4个替换。</p> : <p className="l32-footnote">号码向量包含遗漏、遗漏比例、原排序、近20期七码频次、近40期特别码频次及前两期开奖结果。收益门槛按过去真实换码净收益更新，半衰期30期，要求均值超过0.75倍标准误；它是实验决策规则，不是显著性检验。上方切换两种向量方案可比较门槛的作用。</p>}
  </section>;
}

function Rolling100Status({result}: {result: LabResult}) {
  const r = result.current.rolling100;
  return <section className="l32-panel l32-live" aria-label="前100期学习详情">
    <div className="l32-section-head"><div><small>ROLLING 100 / 固定规则，随数据更新</small><h2>前100期学到了什么</h2></div><span className="l32-pill">{r.ready ? '已学习，等待下一期开奖' : `预热 ${r.trainingCount}/100期`}</span></div>
    <p>学习范围：<b>{r.from ? issue(r.from) : '—'} → {r.through ? issue(r.through) : '—'}</b>，共 {r.trainingCount} 期。前10期用于构造状态，形成 {r.stateSamples} 条已知结果的学习样本。</p>
    <div className="l32-stages l32-vector-metrics">{GROUPS.map((name, i) => <article key={name}><span>{name}</span><strong>{r.groups[i].specials}<small> / {r.stateSamples} 次特别码</small></strong><p>每期平均候选 {r.stateSamples ? (r.groups[i].candidates / r.stateSamples).toFixed(1) : '—'} 个</p><p>单码相对等概率基准 {r.groups[i].relativeRate.toFixed(2)} 倍</p></article>)}</div>
    <p>已匹配 {r.neighborCount} 个历史状态，加权有效近邻 {r.effectiveNeighbors.toFixed(1)} 个；结合这100期的特别码频次生成32码排序。上方分组数值描述已发生的数据，不是下一期概率。</p>
    <p className="l32-footnote">固定规则：每期仅用此前100期；10期状态向量、20个近邻、近邻间隔至少3期、温度0.15、先验权重49。更早的数据、当前待开奖的结果均不参与本方案学习。新开奖后移入一期、移出最旧一期。</p>
    <details className="l32-vector-neighbors"><summary>查看本次20个学习近邻</summary><div className="l32-table-wrap"><table><caption>比较的是历史目标期开奖前10期的状态；所列特别码在当前已经公布</caption><thead><tr><th>历史目标期</th><th>余弦相似度</th><th>随后特别码</th><th>权重</th></tr></thead><tbody>{r.neighbors.map(n => <tr key={issue(n)}><th>{issue(n)}</th><td>{n.similarity.toFixed(3)}</td><td>{ball(n.special)}</td><td>{n.weight.toFixed(2)}</td></tr>)}</tbody></table></div></details>
    <details><summary>查看49码学习排序</summary><div className="l32-table-wrap"><table><caption>评分是固定规则的排序依据，未作概率校准；前32名为下一期观察号码</caption><thead><tr><th>排名</th><th>号码</th><th>100期特别码次数</th><th>学习评分</th></tr></thead><tbody>{r.ranking.map((n, i) => <tr key={n.n} className={i < 32 ? 'is-selected' : ''}><td>{i + 1}</td><td>{ball(n.n)}</td><td>{n.specialCount}</td><td>{n.score.toFixed(4)}</td></tr>)}</tbody></table></div></details>
    <p className="l32-warning">{r.ready ? '下面的历史回放逐期使用各自之前的100期，并非用当前100期学习结果回填过去。实际效果以冻结后保存的新预测为准。' : '尚未满100期，下方号码仅供预览，不计入本方案回测成绩，也不能冻结为正式预测。'}</p>
  </section>;
}

function JournalStatus({journal, frozen, result}: {journal: ForecastSnapshot[]; frozen: Frozen; result: LabResult}) {
  const records = journal.filter(s => s.run === frozen.savedAt);
  const settled = records.flatMap(s => s.settled && !s.historyChanged ? [s.settled] : []);
  const hits = settled.filter(s => s.hit).length, baseline = settled.filter(s => s.originalHit).length;
  const elapsed = result.rows.filter(r => r.year > frozen.after.year || r.year === frozen.after.year && r.No > frozen.after.No).length;
  const unrecorded = Math.max(0, elapsed - records.filter(s => s.settled).length);
  return <div className="l32-observation"><strong>{pct(settled.length ? hits / settled.length : null)}</strong>
    <span>已保存预测实测 {hits}/{settled.length} · 同期原规则 {baseline}/{settled.length}</span>
    <p>待开奖 {records.filter(s => !s.settled).length} 份 · 未留存预测 {unrecorded} 期 · 历史修正待核验 {records.filter(s => s.historyChanged).length} 份（不计入实测）</p>
    <details><summary>查看本轮预测快照（{records.length}份）</summary>{[...records].reverse().map(s => <p key={s.id}>{issue(s.after)} 期后 · 保存 {new Date(s.createdAt).toLocaleString('zh-CN')}<br/>{s.picks.map(ball).join('、')}<br/>{s.historyChanged ? '历史已修正，保留原记录待核验' : s.settled ? `${issue(s.settled.issue)} 特别码 ${ball(s.settled.special)} · ${s.settled.hit ? '覆盖' : '漏选'}` : '待下一期开奖'}</p>)}</details>
  </div>;
}

export default function Likely32Lab() {
  const [frozen, setFrozen] = useState<Frozen | null>(readFrozen);
  const [config, setConfig] = useState<Config>(() => frozen?.config ?? {...DEFAULT_CONFIG});
  const [draft, setDraft] = useState<Config>(() => frozen?.config ?? {...DEFAULT_CONFIG});
  const [model, setModel] = useState<Model>(() => frozen?.model ?? 'vectorLearn');
  const [result, setResult] = useState<LabResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verification, setVerification] = useState({ok: false, message: ''});
  const [journal, setJournal] = useState<ForecastSnapshot[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [windowSize, setWindowSize] = useState(100);
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(20);
  const historyFingerprint = useRef('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoStatus, setAutoStatus] = useState('页面可见时每60秒检查新开奖');

  useEffect(() => {
    if (!autoRefresh) return;
    const controller = new AbortController();
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending || document.visibilityState !== 'visible' || !historyFingerprint.current) return;
      pending = true;
      try {
        const response = await fetch('/api/history', {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error('检查失败');
        const fingerprint = JSON.stringify(await response.json());
        if (controller.signal.aborted) return;
        if (fingerprint !== historyFingerprint.current) {
          setAutoStatus('历史已更新，正在重新计算动态方案'); setRefresh(x => x + 1);
        } else setAutoStatus(`已检查 ${new Date().toLocaleTimeString('zh-CN')} · 暂无新开奖`);
      } catch {
        if (!controller.signal.aborted) setAutoStatus('自动检查暂时失败，将在下次检查时重试');
      } finally {pending = false;}
    }, 60_000);
    return () => {window.clearInterval(timer); controller.abort();};
  }, [autoRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    let worker: Worker | null = null;
    async function load() {
      setLoading(true); setError(''); setResult(null);
      try {
        const [history, legacy] = await Promise.all([
          fetch('/api/history', {cache: 'no-store', signal: controller.signal}).then(async r => {if (!r.ok) throw new Error(`历史接口 HTTP ${r.status}`); return r.json();}),
          fetch('/api/kill-combo/likely22-position-stats', {cache: 'no-store', signal: controller.signal})
            .then(r => r.ok ? r.json() as Promise<Legacy> : null).catch(() => null),
        ]);
        if (controller.signal.aborted) return;
        worker = new Worker(new URL('./lib/likely32Lab.worker.ts', import.meta.url), {type: 'module'});
        worker.onmessage = (event: MessageEvent<{result?: LabResult; error?: string}>) => {
          if (controller.signal.aborted) return;
          if (event.data.result) {
            historyFingerprint.current = JSON.stringify(history);
            const check = parity(event.data.result, legacy);
            setResult(event.data.result); setVerification(check);
            try {
              setJournal(check.ok ? persistJournal(event.data.result, readFrozen()) : parseJournal(localStorage.getItem(JOURNAL_KEY)));
            } catch {setNotice('预测快照读取或保存失败，本次未记录新预测；已有快照不会被覆盖，请导出或检查浏览器存储。');}
            setUpdatedAt(new Date().toLocaleString('zh-CN'));
          } else setError(event.data.error ?? '计算失败');
          setLoading(false); worker?.terminate();
        };
        worker.onerror = () => {if (!controller.signal.aborted) {setError('计算线程加载失败，请刷新重试'); setLoading(false);} worker?.terminate();};
        worker.postMessage({history, config});
      } catch (e) {
        if (!controller.signal.aborted) {setError(e instanceof Error ? e.message : '读取失败'); setLoading(false);}
      }
    }
    void load();
    return () => {controller.abort(); worker?.terminate();};
  }, [config, refresh]);

  const recent = useMemo(() => result?.rows.slice(-windowSize).filter(r => (model !== 'rolling100' || r.rolling100.ready) && (model !== 'vectorLearn' || r.vectorLearning.ready)) ?? [], [result, windowSize, model]);
  const visible = useMemo(() => [...recent].reverse().filter(r => filter === 'gains' ? !r.hits.original && r.hits[model]
    : filter === 'losses' ? r.hits.original && !r.hits[model] : filter === 'misses' ? !r.hits[model] : true), [recent, filter, model]);
  const dirty = !sameConfig(config, draft);

  function freeze() {
    if (!result || loading || dirty || !verification.ok || (model === 'rolling100' && !result.current.rolling100.ready || model === 'vectorLearn' && !result.current.vectorLearning.ready)) return;
    const value: Frozen = {version: LAB_VERSION, modelVersion: model === 'rolling100' ? result.current.rolling100.version : model === 'vectorLearn' ? result.current.vectorLearning.version : undefined, config: result.config, model, after: {year: result.latest.year, No: result.latest.No}, savedAt: new Date().toISOString()};
    try {const snapshots = persistJournal(result, value); localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); setJournal(snapshots); setFrozen(value); setNotice('已保存本期32码快照；后续只结算实际保存过的预测，动态权重继续随开奖更新。');}
    catch {setNotice('浏览器无法保存冻结记录，请检查存储权限。');}
  }
  function unfreeze() {
    try {localStorage.removeItem(STORAGE_KEY); setFrozen(null); setNotice('已结束本次冻结，可以调整参数。历史预测快照仍保留，可导出留档。');}
    catch {setNotice('无法更新本机冻结记录。');}
  }
  function exportResults() {
    if (!result) return;
    const blob = new Blob([JSON.stringify({version: LAB_VERSION, config: result.config, selectedModel: model, frozen, latest: result.latest,
      exportedAt: new Date().toISOString(), historyDigest: result.historyDigest, current: result.current, journal, rows: result.rows}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `likely32-lab-${issue(result.latest)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="l32-page"><div className="l32-shell">
    <header className="l32-header"><div><div className="l32-kicker">32 NUMBER LAB <span>独立实验</span></div><h1>32码优化实验室</h1><p>根据每期开奖更新阶段判断，让32个名额随数据调整。</p></div>
      <div className="l32-actions"><Link to="/kill/likely32-vector-tracker">双向量方案追踪 ↗</Link><Link to="/kill/likely22-position-stats">查看原页面 ↗</Link><button disabled={loading} onClick={() => setRefresh(x => x + 1)}>刷新数据</button></div>
    </header>
    <div className="l32-intro"><span>特别码正向覆盖</span>每期固定选32个号码，只检验是否包含 n7。随机基准 <b>{pct(BASELINE)}</b>；历史回测不代表下一期概率。</div>
    <div className="l32-auto"><label><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}/>自动检查新开奖</label><span role="status">{autoRefresh ? autoStatus : '已暂停自动检查，可手动刷新'}</span></div>

    {result && !loading ? model === 'rolling100' ? <Rolling100Status result={result}/> : model === 'vector' || model === 'vectorGuard' || model === 'vectorLearn' ? <VectorStatus result={result} model={model}/> : <AdaptiveStatus result={result}/> : null}
    <section className="l32-panel l32-controls" aria-labelledby="l32-config-title">
      <div className="l32-section-head"><div><small>01 / 实验设置</small><h2 id="l32-config-title">一次只比较明确的改变</h2></div><span className="l32-pill">{frozen ? '参数已冻结' : '探索模式'}</span></div>
      <div className="l32-models">{MODELS.map(key => <button key={key} aria-pressed={model === key} onClick={() => {setModel(key); setLimit(20);}} className={model === key ? 'is-active' : ''}>
        <span>{key === 'vectorLearn' ? 'VECTOR / 历史学习' : key === 'rolling100' ? 'LEARN / 前100期' : key === 'vector' ? 'VECTOR / 间隔近邻' : key === 'vectorGuard' ? 'VECTOR / 收益门槛' : key === 'adaptive' ? 'ADAPTIVE / 每期更新' : key === 'original' ? 'BASELINE' : key === 'smooth' ? 'EXPERIMENT A' : key === 'learned' ? 'EXPERIMENT B' : 'CONTROL C'}</span><strong>{MODEL_INFO[key].name}</strong><p>{MODEL_INFO[key].description}</p>
      </button>)}</div>
      <form className="l32-params" onSubmit={e => {e.preventDefault(); setConfig({...draft}); setNotice('');}}>
        <label>连续评分混合权重<input type="number" min="0" max="1" step="0.1" value={draft.smoothWeight} disabled={!!frozen || loading} onChange={e => setDraft({...draft, smoothWeight: e.target.valueAsNumber})} required/><small>仅作用于实验A · 0为原评分，1为连续评分</small></label>
        <label>学习窗口（期）<input type="number" min="20" max="500" step="1" value={draft.lookback} disabled={!!frozen || loading} onChange={e => setDraft({...draft, lookback: e.target.valueAsNumber})} required/><small>仅作用于实验B · 使用开奖前的已结算记录</small></label>
        <label>平滑先验强度<input type="number" min="49" max="4900" step="1" value={draft.prior} disabled={!!frozen || loading} onChange={e => setDraft({...draft, prior: e.target.valueAsNumber})} required/><small>仅作用于实验B · 越大越接近等概率基准</small></label>
        <button className="l32-primary" type="submit" disabled={loading || !!frozen || !dirty}>应用参数并回测</button>
      </form>
      <p className="l32-footnote">动态方案自动更新：近期半衰期20期、长期半衰期80期，至少学习40期；仅在平滑评分优势达到0.3个百分点时替换，每期最多4个。上面的手动参数仅影响实验A/B。</p>
      {dirty ? <p className="l32-warning" role="status">参数尚未应用，下方结果仍对应上一次已应用参数。</p> : null}
    </section>

    {loading ? <div className="l32-state" role="status"><span className="l32-spinner"/>正在读取历史，逐期计算{MODELS.length}组32码…</div> : null}
    {error ? <div className="l32-state l32-warning" role="alert">{error}。可点击“刷新数据”重试。</div> : null}
    {notice ? <p className="l32-state" role="status">{notice}</p> : null}
    {result && !loading ? <>
      <div className="l32-verified">{verification.message}</div>
      <section className="l32-panel">
        <div className="l32-section-head"><div><small>02 / 同期比较</small><h2>覆盖率与替换收益</h2></div><label className="l32-select">观察窗口<select aria-label="观察窗口" value={windowSize} onChange={e => {setWindowSize(Number(e.target.value)); setLimit(20);}}>{[10, 20, 50, 100].map(w => <option key={w} value={w}>最近 {w} 期</option>)}</select></label></div>
        <div className="l32-metrics"><article><span>原规则覆盖</span><strong>{pct(summarizeLab(recent, 'original').rate)}</strong><small>{summarizeLab(recent, 'original').hits}/{recent.length} 期</small></article>
          <article className="l32-highlight"><span>{MODEL_INFO[model].name}</span><strong>{pct(summarizeLab(recent, model).rate)}</strong><small>{summarizeLab(recent, model).hits}/{recent.length} 期</small></article>
          <article><span>净增加覆盖</span><strong>{summarizeLab(recent, model).gains - summarizeLab(recent, model).losses > 0 ? '+' : ''}{summarizeLab(recent, model).gains - summarizeLab(recent, model).losses}<em>期</em></strong><small>救回 {summarizeLab(recent, model).gains} · 损失 {summarizeLab(recent, model).losses}</small></article>
          <article><span>随机选32码基准</span><strong>{pct(BASELINE)}</strong><small>假设49个号码等概率</small></article></div>
        <div className="l32-table-wrap"><table><caption>{MODELS.length}组方案在相同窗口中的特别码覆盖率</caption><thead><tr><th>方案</th>{[10, 20, 50, 100].map(w => <th key={w}>近{w}期</th>)}</tr></thead><tbody>{MODELS.map(key => <tr className={model === key ? 'is-selected' : ''} key={key}><th>{MODEL_INFO[key].name}</th>{[10, 20, 50, 100].map(w => <td key={w}><ChangeCount rows={result.rows.slice(-w)} model={key}/></td>)}</tr>)}</tbody></table></div>
        <p className="l32-footnote">救回 = 原规则漏选、实验覆盖；损失 = 原规则覆盖、实验漏选。每期先选码再核验，四个窗口互相重叠，不取平均作为预测概率。</p>
      </section>

      <section className="l32-panel"><div className="l32-section-head"><div><small>03 / 阶段与遗漏状态</small><h2>提升来自哪里</h2></div></div>
        <div className="l32-stages">{[{name: '最近20期', rows: result.rows.slice(-20)}, {name: '此前30期', rows: result.rows.slice(-50, -20)}, {name: '更早50期', rows: result.rows.slice(-100, -50)}].map(stage => <article key={stage.name}><span>{stage.name}</span><small>{stage.rows.length ? `${issue(stage.rows[0])} → ${issue(stage.rows[stage.rows.length - 1])}` : '暂无样本'}</small><ChangeCount rows={stage.rows} model={model}/><p>原规则 {pct(summarizeLab(stage.rows, model).count ? summarizeLab(stage.rows, model).originalHits / summarizeLab(stage.rows, model).count : null)}</p></article>)}</div>
        <div className="l32-table-wrap"><table><caption>当前观察窗口的遗漏状态诊断；遗漏按全部七码计算</caption><thead><tr><th>开奖前状态</th><th>特别码出现次数</th><th>原规则覆盖</th><th>当前方案覆盖</th><th>每期平均名额：原 → 实验</th></tr></thead><tbody>{GROUPS.map((label, g) => {
          const selected = recent.filter(r => r.group === g);
          const average = (key: Model) => recent.length ? (recent.reduce((s, r) => s + r.selectedGroups[key][g], 0) / recent.length).toFixed(1) : '—';
          return <tr key={label}><th>{label}</th><td>{selected.length}</td><td>{summarizeLab(selected, 'original').hits}/{selected.length}</td><td>{summarizeLab(selected, model).hits}/{selected.length}</td><td>{average('original')} → {average(model)}</td></tr>;
        })}</tbody></table></div>
      </section>

      <section className="l32-panel"><div className="l32-section-head"><div><small>04 / 下一次开奖观察</small><h2>{issue(result.latest)} 期开奖后的32码</h2></div><span className="l32-pill">{MODEL_INFO[model].name}</span></div>
        <Balls numbers={result.current.picks[model]} added={result.current.picks[model].filter(n => !result.current.picks.original.includes(n))}/>
        <div className="l32-swap"><p><b className="l32-gain">换入</b> {result.current.picks[model].filter(n => !result.current.picks.original.includes(n)).map(ball).join('、') || '无'}</p><p><b className="l32-loss">换出</b> {result.current.picks.original.filter(n => !result.current.picks[model].includes(n)).map(ball).join('、') || '无'}</p></div>
        <details><summary>查看原规则32码</summary><Balls numbers={result.current.picks.original}/></details>
        <p className="l32-footnote">绿色号码为相对原规则新换入。实验B当前学习样本 {result.learnedSamples} 期；分组估计是实验评分，不是已验证的下一期概率。</p>
      </section>

      <section className="l32-panel"><div className="l32-section-head"><div><small>05 / 固定参数观察</small><h2>让后续开奖检验方案</h2></div><button disabled={!frozen && (dirty || !verification.ok || (model === 'rolling100' && !result.current.rolling100.ready || model === 'vectorLearn' && !result.current.vectorLearning.ready))} onClick={frozen ? unfreeze : freeze}>{frozen ? '结束冻结，继续探索' : '冻结当前方案与参数'}</button></div>
        {frozen ? <><p>已冻结 <b>{MODEL_INFO[frozen.model].name}</b> · 从 {issue(frozen.after)} 期之后记录。切换上方查看方案不会改变冻结方案。</p>
          <JournalStatus journal={journal} frozen={frozen} result={result}/></>
          : <p>选定方案后冻结参数，再用后续新开奖检验。反复调整同一批历史的参数，不能算独立验证。</p>}
        {!verification.ok ? <p className="l32-warning">对照尚未通过，暂停冻结及新预测记录；已有快照保留。</p> : null}
        <p className="l32-footnote">仅在数据对照校验通过后记录新预测。关闭页面期间不会生成快照，缺失的预测不补算为实测成绩。保存内容包括32码、原规则32码、时间与历史摘要；历史修正只标记异常，保留原结算。记录仅在当前浏览器，不具备防篡改认证；结束冻结仍可导出快照。</p>
      </section>

      <section className="l32-panel"><div className="l32-section-head"><div><small>06 / 逐期核验</small><h2>每一次救回与损失</h2></div><label className="l32-select">筛选<select aria-label="筛选" value={filter} onChange={e => {setFilter(e.target.value); setLimit(20);}}><option value="all">全部记录</option><option value="gains">仅救回</option><option value="losses">仅损失</option><option value="misses">实验漏选</option></select></label></div>
        <div className="l32-table-wrap"><table><caption>当前窗口 {recent.length} 期 · 筛选后 {visible.length} 期</caption><thead><tr><th>期号</th><th>特别码 / 遗漏</th><th>原规则</th><th>当前方案</th><th>变化</th><th>换入 / 换出号码</th></tr></thead><tbody>{visible.slice(0, limit).map(row => <tr key={issue(row)}><th>{issue(row)}</th><td><b>{ball(row.special)}</b><span>遗漏 {row.miss} 期 · 原第{row.originalRank}位</span></td><td>{row.hits.original ? '覆盖' : '漏选'}</td><td>{row.hits[model] ? '覆盖' : '漏选'}</td><td className={!row.hits.original && row.hits[model] ? 'l32-gain' : row.hits.original && !row.hits[model] ? 'l32-loss' : ''}>{row.hits.original === row.hits[model] ? '持平' : row.hits[model] ? '救回' : '损失'}</td><td><details><summary>查看替换</summary><p>换入：{row.picks[model].filter(n => !row.picks.original.includes(n)).map(ball).join('、') || '无'}</p><p>换出：{row.picks.original.filter(n => !row.picks[model].includes(n)).map(ball).join('、') || '无'}</p><p>实验32码：{row.picks[model].map(ball).join('、')}</p></details></td></tr>)}
          {!visible.length ? <tr><td colSpan={6}>当前筛选没有记录。</td></tr> : null}</tbody></table></div>
        <div className="l32-actions l32-bottom-actions">{visible.length > limit ? <button onClick={() => setLimit(n => n + 30)}>再显示30期</button> : null}<button onClick={exportResults}>导出实验记录 JSON</button></div>
      </section>
      <footer className="l32-footer">数据 {result.historyCount} 期 · 最新 {issue(result.latest)} · 更新 {updatedAt} · 实验版本 {LAB_VERSION}</footer>
    </> : null}
  </div></main>;
}
