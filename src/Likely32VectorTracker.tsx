import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {issueKey, missStreaks, trackerStats} from './lib/likely32Tracker';
import type {Ref} from 'react';
import type {TrackerResult} from './lib/likely32Tracker';
import {parseTrackerCache, serializeTrackerCache, trackerFingerprint, TRACKER_CACHE_KEY} from './lib/likely32TrackerCache';
import trackerWorkerUrl from './lib/likely32Tracker.worker.ts?worker&url';
import './Likely32VectorTracker.css';

const WORKER_URL = new URL(trackerWorkerUrl, import.meta.url);
const schemes = [
  {key: 'vectorLearn', name: '向量历史学习', label: '前100期学习', description: '根据此前100期的替换表现，决定本期启用哪些向量候选。'},
  {key: 'vector', name: '原向量方案', label: '向量间隔近邻', description: '匹配相似历史状态，按固定规则选择最多4个候选替换。'},
] as const;
const issue = (row: {year: number; No: number}) => `${row.year}-${String(row.No).padStart(3, '0')}`;
const numberText = (n: number) => String(n).padStart(2, '0');
const rate = (hits: number, count: number) => count ? `${(hits / count * 100).toFixed(1)}% · ${hits}/${count}` : '—';

type EmbeddingComparison = {
  selection: string | null;
  windows: Array<{label: string; count: number}>;
  rows: Array<{name: string; hits: number[]}>;
};
type FusionGateReport = {
  rule: {after: {year: number; No: number}; qwenWeight: number; window: number; minimumDecisions: number; support: number};
  current: {after: {year: number; No: number}; enabled: boolean; count: number; gains: number; losses: number;
    support: number; picks: number[] | null} | null;
  windows: Array<{label: string; count: number; gated: number; vector: number; fusion: number; activations: number}>;
};
type FusionJournal = {
  count: number; gated: number; vector: number; gains: number; losses: number;
  pending: number; late: number; timingUnknown: number; historyChanged: number; currentPending?: boolean;
  latest: {after: {year: number; No: number}; recordedAt: string} | null;
};
type EmbeddingReport = {
  version: 1;
  model: string;
  dimensions: number;
  historyDigest?: string;
  missingPeriods: number;
  from: {year: number; No: number};
  through: {year: number; No: number};
  windows: Array<{
    label: string; count: number; embedding: number; vector: number; vectorLearn: number;
    original: number; gains: number; losses: number; pairedP: number;
  }>;
  similarities?: EmbeddingComparison;
  strategies?: EmbeddingComparison;
  fusionGate?: FusionGateReport;
  journal?: FusionJournal;
};

function FusionJournalStatus({journal}: {journal: FusionJournal}) {
  const heading = useId();
  const {latest, count, gated, vector, gains, losses, pending, late, timingUnknown, historyChanged} = journal;
  return <section aria-labelledby={heading}>
    <h3 id={heading}>预测留档与计分</h3>
    {latest ? <p>最近一次留档依据 {issue(latest.after)} 期历史，记录于 {new Date(latest.recordedAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false})}（北京时间）。</p>
      : <p>暂无留档。使用实时历史接口重新生成报告时可保存预测。</p>}
    <p>{count ? <>已计分 {count} 期，门槛方案命中 {gated} 期，原向量命中 {vector} 期，净差 {gains - losses} 期。</> : '暂无可计分的留档。'}{pending ? ` ${pending} 条待结果入库。` : ''}</p>
    {late || timingUnknown || historyChanged ? <p>未计分记录中，{late} 条留档晚于或等于入库时间，{timingUnknown} 条缺少入库时间，{historyChanged} 条历史无法核对。</p> : null}
    <p>计分以开奖数据的入库时间为准。开奖时间需另行核验。</p>
  </section>;
}

function FusionGateResults({gate}: {gate: FusionGateReport}) {
  const heading = useId();
  const {rule} = gate;
  return <section aria-labelledby={heading}>
    <h3 id={heading}>Qwen 融合启用门槛</h3>
    <p>根据前 {rule.window} 期判断。两套方案至少有 {rule.minimumDecisions} 次命中结果不同，且融合的平滑救回占比达到 {rule.support * 100}%，才启用 {rule.qwenWeight * 100}% Qwen 融合。规则在 {issue(rule.after)} 期后固定。</p>
    <div className="v32-embedding-table" tabIndex={0} aria-label="融合启用门槛回测对照">
      <table aria-labelledby={heading}>
        <thead><tr><th scope="col">区间</th><th scope="col">按门槛启用</th><th scope="col">原向量</th><th scope="col">始终融合</th><th scope="col">启用融合期数</th></tr></thead>
        <tbody>{gate.windows.map(row => <tr key={row.label}>
          <th scope="row">{row.label}</th><td>{rate(row.gated, row.count)}</td><td>{rate(row.vector, row.count)}</td>
          <td>{rate(row.fusion, row.count)}</td><td>{row.count ? `${row.activations}/${row.count}` : '待开奖'}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function EmbeddingComparisonTable({title, comparison}: {title: string; comparison: EmbeddingComparison}) {
  const heading = useId();
  return <section aria-labelledby={heading}>
    <h3 id={heading}>{title}</h3>
    {comparison.selection ? <p><b>{comparison.selection}</b> 在 2025 年及以前的对照中排名第一。2026 年及以后另行统计。</p> : null}
    <div className="v32-embedding-table" tabIndex={0} aria-label={title}>
      <table aria-labelledby={heading}>
        <thead><tr><th scope="col">方法</th>{comparison.windows.map(window => <th scope="col" key={window.label}>{window.label}</th>)}</tr></thead>
        <tbody>{comparison.rows.map(row => <tr key={row.name}>
          <th scope="row">{row.name}</th>
          {comparison.windows.map((window, index) => <td key={window.label}>{rate(row.hits[index], window.count)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function useEmbeddingReport(refreshTick: number) {
  const [state, setState] = useState<{report: EmbeddingReport | null; failure: string; completedTick: number}>({
    report: null, failure: '', completedTick: -1,
  });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort('timeout'), 10_000);
    // Read the generated file directly in development, even if it was created after Vite started.
    const reportPath = import.meta.env.DEV ? 'public/likely32-embedding-report.json' : 'likely32-embedding-report.json';
    fetch(`${import.meta.env.BASE_URL}${reportPath}`, {
      cache: 'no-store',
      headers: {Accept: 'application/json'},
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          throw new Error(response.status === 404 || response.ok ? '尚无 Qwen 报告。' : 'Qwen 报告暂时无法读取。');
        }
        const data: EmbeddingReport = await response.json();
        if (data.version !== 1 || !data.from || !data.through || !data.windows?.length) throw new Error('向量回测结果格式无效');
        if (!controller.signal.aborted) setState({report: data, failure: '', completedTick: refreshTick});
      })
      .catch(error => {
        const timedOut = controller.signal.reason === 'timeout';
        if (timedOut || !controller.signal.aborted) {
          const failure = timedOut ? 'Qwen 报告读取超时。' : error instanceof Error ? error.message : 'Qwen 报告暂时无法读取。';
          setState(previous => ({...previous, failure, completedTick: refreshTick}));
        }
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {window.clearTimeout(timeout); controller.abort();};
  }, [refreshTick]);
  return {...state, loading: state.completedTick !== refreshTick};
}

function FusionDecision({result, reportState, openBacktest}: {
  result: TrackerResult; reportState: ReturnType<typeof useEmbeddingReport>; openBacktest: () => void;
}) {
  const {report, failure, loading} = reportState;
  const gate = report?.fusionGate;
  const current = gate?.current;
  const latest = issue(result.latest);
  const sameHistory = report?.historyDigest === result.historyDigest;
  const reportMatches = report && issue(report.through) === latest && sameHistory && report.missingPeriods === 0;
  const ready = current && reportMatches && issue(current.after) === latest ? current : null;
  const archived = report?.journal;
  let status = '等待最新报告';
  let explanation = loading ? '正在读取 Qwen 报告。' : failure || '报告生成后会显示下一期的融合决策。';
  if (report && !ready) {
    if (issue(report.through) !== latest) {
      explanation = `开奖数据已到 ${latest} 期，Qwen 报告覆盖至 ${issue(report.through)} 期。`;
    } else if (!sameHistory) {
      explanation = `Qwen 报告需要按 ${latest} 期的最新历史重新生成。`;
    } else {
      explanation = `截至 ${latest} 期的报告尚无下一期融合决策。`;
    }
  }
  if (ready && gate) {
    status = ready.enabled ? ready.picks ? '启用 Qwen 融合' : '达到融合门槛，号码待生成' : '采用原向量';
    explanation = `前 ${gate.rule.window} 期，融合使 ${ready.gains} 期由未中变为命中、${ready.losses} 期由命中变为未中。平滑救回占比 ${(ready.support * 100).toFixed(1)}%，启用门槛 ${gate.rule.support * 100}%。`;
  }
  const archivedCurrent = ready && archived?.currentPending;
  return <section className="v32-decision" aria-labelledby="v32-decision-title">
    <div className="v32-decision-header">
      <div><h2 id="v32-decision-title">Qwen 融合 · 下一期决策</h2><p>开奖数据截至 {latest} 期</p></div>
      {archivedCurrent ? <span className="v32-decision-archive">下一期已留档 · {archived.count} 期已计分</span> : null}
    </div>
    <div className="v32-decision-result" role="status">
      <strong>{status}</strong>
      <p>{explanation}</p>
    </div>
    {ready?.enabled && ready.picks ? <Numbers picks={ready.picks}/> : null}
    {ready && failure && !loading ? <p className="v32-decision-notice">最近一次报告检查失败，当前显示上次读取的结果。</p> : null}
    <div className="v32-decision-actions">
      {ready && !ready.enabled ? <a href="#v32-original-picks">查看原向量 32 码</a> : null}
      {report ? <button type="button" onClick={openBacktest}>查看回测与留档</button> : null}
    </div>
  </section>;
}

function EmbeddingBacktest({report, detailsRef}: {report: EmbeddingReport; detailsRef: Ref<HTMLDetailsElement>}) {
  return <details className="v32-embedding" ref={detailsRef}>
    <summary>Qwen 回测与留档</summary>
    <p>{report.model} · {report.dimensions} 维 · {issue(report.from)} 至 {issue(report.through)}</p>
    {report.missingPeriods > 0 ? <p>还有 {report.missingPeriods} 期缺少向量，当前回测使用已覆盖的连续历史。</p> : null}
    {report.fusionGate ? <FusionGateResults gate={report.fusionGate}/> : null}
    {report.journal ? <FusionJournalStatus journal={report.journal}/> : null}
    <div className="v32-embedding-table" tabIndex={0} aria-label="大模型向量回测命中率">
      <table>
        <thead><tr><th scope="col">回测区间</th><th scope="col">大模型向量</th><th scope="col">原向量</th><th scope="col">向量历史学习</th><th scope="col">原规则</th><th scope="col">相对原向量</th></tr></thead>
        <tbody>{report.windows.map(row => <tr key={row.label}>
          <th scope="row">{row.label}</th><td>{rate(row.embedding, row.count)}</td><td>{rate(row.vector, row.count)}</td>
          <td>{rate(row.vectorLearn, row.count)}</td><td>{rate(row.original, row.count)}</td><td>多中 {row.gains} / 少中 {row.losses}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {report.strategies ? <EmbeddingComparisonTable title="Qwen 融合和换码策略" comparison={report.strategies}/> : null}
    {report.similarities ? <EmbeddingComparisonTable title="Qwen 相似度对照" comparison={report.similarities}/> : null}
    <p>每期只使用开奖前已知数据。公平等概率下，任意32码的覆盖基准为 {(32 / 49 * 100).toFixed(2)}%。</p>
  </details>;
}

function Numbers({picks, special}: {picks: number[]; special?: number}) {
  return <div className="v32-numbers" aria-label="选中的32个号码">{[...picks].sort((a, b) => a - b).map(n =>
    <span key={n} className={n === special ? 'v32-number is-hit' : 'v32-number'} aria-label={n === special ? `${numberText(n)}，命中特别码` : numberText(n)}>{numberText(n)}</span>,
  )}</div>;
}

export default function Likely32VectorTracker() {
  const [result, setResult] = useState<TrackerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [refresh, setRefresh] = useState({tick: 0, force: false});
  const fingerprint = useRef('');
  const backtest = useRef<HTMLDetailsElement>(null);
  const reportState = useEmbeddingReport(refresh.tick);
  const openBacktest = () => {
    const panel = backtest.current;
    if (!panel) return;
    panel.open = true;
    panel.querySelector('summary')?.focus({preventScroll: true});
    panel.scrollIntoView({block: 'start'});
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRefresh(r => ({tick: r.tick + 1, force: false}));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false, worker: Worker | null = null;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    async function load() {
      setLoading(true); setError('');
      try {
        const response = await fetch('/api/history', {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error(`历史数据读取失败（HTTP ${response.status}）`);
        const history: unknown = await response.json();
        window.clearTimeout(timeout);
        if (disposed) return;
        const identified = await trackerFingerprint(history, WORKER_URL.href);
        if (disposed) return;
        const nextFingerprint = identified.fingerprint;
        if (!refresh.force && nextFingerprint === fingerprint.current) {
          setCheckedAt(new Date().toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai'})); setLoading(false); return;
        }
        if (!refresh.force && !import.meta.env.DEV) {
          let cached: TrackerResult | null = null;
          try {cached = parseTrackerCache(localStorage.getItem(TRACKER_CACHE_KEY), nextFingerprint, identified.history);} catch { /* Storage may be disabled. */ }
          if (cached) {
            fingerprint.current = nextFingerprint; setResult(cached);
            setCheckedAt(new Date().toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai'})); setLoading(false); return;
          }
        }
        worker = new Worker(WORKER_URL, {type: 'module'});
        worker.onmessage = (event: MessageEvent<{result?: TrackerResult; error?: string}>) => {
          if (disposed) return;
          if (event.data.result) {
            fingerprint.current = nextFingerprint;
            setResult(event.data.result);
            try {
              if (!import.meta.env.DEV) localStorage.setItem(TRACKER_CACHE_KEY, serializeTrackerCache(nextFingerprint, event.data.result));
            } catch { /* Storage may be disabled. */ }
            setCheckedAt(new Date().toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai'}));
          } else setError(event.data.error ?? '方案计算失败，请重试');
          setLoading(false); worker?.terminate();
        };
        worker.onerror = () => {
          if (!disposed) {setError('方案计算失败，请刷新重试'); setLoading(false);}
          worker?.terminate();
        };
        worker.postMessage({history});
      } catch (e) {
        if (!disposed) {
          setError(controller.signal.aborted ? '读取历史数据超时，请重试' : e instanceof Error ? e.message : '读取失败，请重试');
          setLoading(false);
        }
      } finally {window.clearTimeout(timeout);}
    }
    void load();
    return () => {disposed = true; controller.abort(); worker?.terminate(); window.clearTimeout(timeout);};
  }, [refresh]);

  const recent = result?.rows.slice(-20) ?? [];
  const streaks = useMemo(() => Object.fromEntries(schemes.map(s => [s.key, {all: missStreaks(result?.rows ?? [], s.key), recent: missStreaks(result?.rows.slice(-20) ?? [], s.key)}])), [result]);
  return <main className="v32-page">
    <header className="v32-header">
      <div><h1>32 码向量追踪</h1><p>查看下一期方案、两套向量对照和预测留档。</p></div>
      <nav aria-label="页面操作"><Link to="/kill/likely32-optimization-lab">优化实验室 ↗</Link><button onClick={() => setRefresh(r => ({tick: r.tick + 1, force: false}))} disabled={loading || reportState.loading}>{loading || reportState.loading ? '检查中…' : '刷新开奖与报告'}</button><button disabled={loading} onClick={() => setRefresh(r => ({tick: r.tick + 1, force: true}))}>重算本地方案</button></nav>
    </header>
    <div className="v32-status" role="status">{result ? <span>开奖截至 <b>{issue(result.latest)}</b> · {loading ? '正在检查更新' : error ? `上次成功检查 ${checkedAt}` : `最近检查 ${checkedAt}`}</span> : loading ? '正在读取开奖并计算本地方案…' : null}<span>页面可见时每 60 秒检查开奖与报告</span></div>
    {error ? <p className="v32-error" role="alert">{error}{result ? '。以下保留上次成功计算的数据。' : ''}</p> : null}
    {result ? <>
      <FusionDecision result={result} reportState={reportState} openBacktest={openBacktest}/>
      <section aria-labelledby="v32-current-title">
        <div className="v32-section-title"><h2 id="v32-current-title">下一期待开奖 · 当前32码</h2><span>根据 {issue(result.latest)} 期及之前数据生成</span></div>
        <div className="v32-grid">{schemes.map(scheme => {
          const stats = trackerStats(recent, scheme.key);
          const ready = scheme.key !== 'vectorLearn' || result.current.vectorLearning.ready;
          return <article className="v32-current" id={scheme.key === 'vector' ? 'v32-original-picks' : undefined} data-model={scheme.key} key={scheme.key}>
            <span className="v32-eyebrow">{scheme.label}</span><h3>{scheme.name}</h3><p>{scheme.description}</p>
            <div className="v32-score"><strong>{stats.count ? `${(stats.hits / stats.count * 100).toFixed(0)}%` : '—'}</strong><span>近20期命中 <b>{stats.hits}/{stats.count}</b>{stats.count < recent.length ? '（不含预热）' : ''}</span></div>
            <div className="v32-streak-metrics" aria-label="连续未命中统计">
              <span>当前连错 <b>{streaks[scheme.key].all.eligibleCount ? streaks[scheme.key].all.current : '—'} 期</b></span>
              <span>近20期内最长 <b>{streaks[scheme.key].recent.eligibleCount ? streaks[scheme.key].recent.longest : '—'} 期</b></span>
              <span>全历史最长 <b>{streaks[scheme.key].all.eligibleCount ? streaks[scheme.key].all.longest : '—'} 期</b></span>
            </div>
            <Numbers picks={result.current.picks[scheme.key]}/>
            <div className="v32-card-footer">{ready ? '32个号码 · 等待开奖' : `学习预热 ${result.current.vectorLearning.trainingCount}/100期 · 号码仅供预览`}</div>
          </article>;
        })}</div>
      </section>
      {reportState.report ? <EmbeddingBacktest report={reportState.report} detailsRef={backtest}/> : null}
      <section className="v32-streak-history" aria-label="历史连错记录">
        <div className="v32-section-title"><h2>历史连错记录</h2><span>连续至少2期未命中记为一段；学习预热期不计入</span></div>
        <div className="v32-grid">{schemes.map(scheme => {
          const stats = streaks[scheme.key].all;
          return <div className="v32-streak-card" key={scheme.key} data-model={scheme.key}><h3>{scheme.name}</h3>
            <p>{stats.eligibleCount ? `已检查 ${stats.eligibleCount} 期，发现 ${stats.runs.length} 段连错` : '尚无完成预热的历史记录'}</p>
            {stats.runs.length ? <details><summary>查看全部 {stats.runs.length} 段连错（最新在前）</summary><ol>{[...stats.runs].reverse().map(run => <li key={issueKey(run.from)}><span>{issue(run.from)} → {issue(run.through)}</span><b>连错 {run.length} 期{run.ongoing ? ' · 持续中' : ''}</b></li>)}</ol></details> : stats.eligibleCount ? <p>未发现连续2期及以上未命中。</p> : null}
          </div>;
        })}</div>
      </section>
      <section className="v32-history" aria-labelledby="v32-history-title">
        <div className="v32-section-title"><h2 id="v32-history-title">近20期历史结果</h2><span>最新在前 · 共 {recent.length} 期 <i className="v32-legend"/> 红色 = 命中特别码</span></div>
        <p className="v32-note">每期用此前数据重算号码。预测留档与计分见上方 Qwen 报告。</p>
        <div className="v32-rows">{[...recent].reverse().map(row => <article className="v32-row" data-issue={issue(row)} key={issue(row)}>
          <header className="v32-row-header"><h3>{issue(row)} <span>期</span></h3><div>当期特别码 <strong className="v32-special">{numberText(row.special)}</strong></div></header>
          <div className="v32-grid">{schemes.map(scheme => {
            const ready = scheme.key !== 'vectorLearn' || row.vectorLearning.ready;
            const hit = row.hits[scheme.key];
            const misses = streaks[scheme.key].all.byIssue[issueKey(row)] ?? 0;
            return <section className="v32-history-model" data-model={scheme.key} key={scheme.key} aria-label={`${issue(row)} ${scheme.name}`}>
              <div className="v32-model-heading"><h4>{scheme.name}</h4><span className={hit ? 'v32-outcome is-hit' : misses >= 2 ? 'v32-outcome is-streak' : 'v32-outcome'}>{hit ? '命中特别码' : ready ? `未命中 · 连错${misses}期` : '未命中'}{!ready ? ' · 预热不计统计' : ''}</span></div>
              <Numbers picks={row.picks[scheme.key]} special={row.special}/>
            </section>;
          })}</div>
        </article>)}</div>
      </section>
    </> : null}
  </main>;
}
