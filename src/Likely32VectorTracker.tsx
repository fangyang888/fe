import {useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {issueKey, missStreaks, trackerStats} from './lib/likely32Tracker';
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
  const [cacheStatus, setCacheStatus] = useState('');
  const fingerprint = useRef('');

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
          setCacheStatus('数据未变，已复用结果');
          setCheckedAt(new Date().toLocaleTimeString('zh-CN')); setLoading(false); return;
        }
        if (!refresh.force && !import.meta.env.DEV) {
          let cached: TrackerResult | null = null;
          try {cached = parseTrackerCache(localStorage.getItem(TRACKER_CACHE_KEY), nextFingerprint, identified.history);} catch { /* Storage may be disabled. */ }
          if (cached) {
            fingerprint.current = nextFingerprint; setResult(cached); setCacheStatus('已读取本地缓存');
            setCheckedAt(new Date().toLocaleTimeString('zh-CN')); setLoading(false); return;
          }
        }
        setCacheStatus('正在重新计算');
        worker = new Worker(WORKER_URL, {type: 'module'});
        worker.onmessage = (event: MessageEvent<{result?: TrackerResult; error?: string}>) => {
          if (disposed) return;
          if (event.data.result) {
            fingerprint.current = nextFingerprint;
            setResult(event.data.result);
            try {
              if (!import.meta.env.DEV) localStorage.setItem(TRACKER_CACHE_KEY, serializeTrackerCache(nextFingerprint, event.data.result));
              setCacheStatus(import.meta.env.DEV ? '开发模式：仅复用当前页面结果' : '已重新计算并缓存');
            } catch {setCacheStatus('计算完成；浏览器缓存不可用');}
            setCheckedAt(new Date().toLocaleTimeString('zh-CN'));
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
      <div><span className="v32-eyebrow">32 NUMBER / TWO MODELS</span><h1>双向量方案追踪</h1><p>两组32码，同期对照。命中特别码的号码标红。</p></div>
      <nav aria-label="页面操作"><Link to="/kill/likely32-optimization-lab">优化实验室 ↗</Link><button onClick={() => setRefresh(r => ({tick: r.tick + 1, force: false}))} disabled={loading}>{loading ? '更新中…' : '刷新数据'}</button><button disabled={loading} onClick={() => setRefresh(r => ({tick: r.tick + 1, force: true}))}>重新计算</button></nav>
    </header>
    <div className="v32-status" role="status">{result ? <>数据截至 <b>{issue(result.latest)}</b> · {loading ? '正在检查并更新…' : `最近检查 ${checkedAt}`}</> : '正在读取历史并计算两组方案…'}<span>{cacheStatus ? `${cacheStatus} · ` : ''}页面可见时每60秒检查新开奖</span></div>
    {error ? <p className="v32-error" role="alert">{error}{result ? '。以下保留上次成功计算的数据。' : ''}</p> : null}
    {result ? <>
      <section aria-labelledby="v32-current-title">
        <div className="v32-section-title"><h2 id="v32-current-title">下一期待开奖 · 当前32码</h2><span>根据 {issue(result.latest)} 期及之前数据生成</span></div>
        <div className="v32-grid">{schemes.map(scheme => {
          const stats = trackerStats(recent, scheme.key);
          const ready = scheme.key !== 'vectorLearn' || result.current.vectorLearning.ready;
          return <article className="v32-current" data-model={scheme.key} key={scheme.key}>
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
        <p className="v32-note">逐期使用当期开奖前的数据回放；历史覆盖率不代表下一期概率。此处展示历史回测，并非开奖前留存的预测记录。</p>
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
    </> : !error ? <div className="v32-loading">正在逐期计算，请稍候…</div> : null}
  </main>;
}
