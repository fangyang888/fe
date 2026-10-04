import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {DEFAULT_CONFIG, summarizeLab} from './lib/likely32Lab';
import type {LabResult} from './lib/likely32Lab';
import './Likely32VectorTracker.css';

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
  const [result, setResult] = useState<LabResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [refresh, setRefresh] = useState(0);
  const fingerprint = useRef('');

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRefresh(n => n + 1);
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
        const nextFingerprint = JSON.stringify(history);
        if (nextFingerprint === fingerprint.current) {
          setCheckedAt(new Date().toLocaleTimeString('zh-CN')); setLoading(false); return;
        }
        worker = new Worker(new URL('./lib/likely32Lab.worker.ts', import.meta.url), {type: 'module'});
        worker.onmessage = (event: MessageEvent<{result?: LabResult; error?: string}>) => {
          if (disposed) return;
          if (event.data.result) {
            fingerprint.current = nextFingerprint;
            setResult(event.data.result); setCheckedAt(new Date().toLocaleTimeString('zh-CN'));
          } else setError(event.data.error ?? '方案计算失败，请重试');
          setLoading(false); worker?.terminate();
        };
        worker.onerror = () => {
          if (!disposed) {setError('方案计算失败，请刷新重试'); setLoading(false);}
          worker?.terminate();
        };
        worker.postMessage({history, config: DEFAULT_CONFIG});
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
  return <main className="v32-page">
    <header className="v32-header">
      <div><span className="v32-eyebrow">32 NUMBER / TWO MODELS</span><h1>双向量方案追踪</h1><p>两组32码，同期对照。命中特别码的号码标红。</p></div>
      <nav aria-label="页面操作"><Link to="/kill/likely32-optimization-lab">优化实验室 ↗</Link><button onClick={() => setRefresh(n => n + 1)} disabled={loading}>{loading ? '更新中…' : '刷新数据'}</button></nav>
    </header>
    <div className="v32-status" role="status">{result ? <>数据截至 <b>{issue(result.latest)}</b> · {loading ? '正在检查并更新…' : `最近检查 ${checkedAt}`}</> : '正在读取历史并计算两组方案…'}<span>页面可见时每60秒检查新开奖</span></div>
    {error ? <p className="v32-error" role="alert">{error}{result ? '。以下保留上次成功计算的数据。' : ''}</p> : null}
    {result ? <>
      <section aria-labelledby="v32-current-title">
        <div className="v32-section-title"><h2 id="v32-current-title">下一期待开奖 · 当前32码</h2><span>根据 {issue(result.latest)} 期及之前数据生成</span></div>
        <div className="v32-grid">{schemes.map(scheme => {
          const stats = summarizeLab(recent, scheme.key);
          const ready = scheme.key !== 'vectorLearn' || result.current.vectorLearning.ready;
          return <article className="v32-current" data-model={scheme.key} key={scheme.key}>
            <span className="v32-eyebrow">{scheme.label}</span><h3>{scheme.name}</h3><p>{scheme.description}</p>
            <div className="v32-score"><strong>{stats.count ? `${(stats.hits / stats.count * 100).toFixed(0)}%` : '—'}</strong><span>近20期命中 <b>{stats.hits}/{stats.count}</b>{stats.count < recent.length ? '（不含预热）' : ''}</span></div>
            <Numbers picks={result.current.picks[scheme.key]}/>
            <div className="v32-card-footer">{ready ? '32个号码 · 等待开奖' : `学习预热 ${result.current.vectorLearning.trainingCount}/100期 · 号码仅供预览`}</div>
          </article>;
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
            return <section className="v32-history-model" data-model={scheme.key} key={scheme.key} aria-label={`${issue(row)} ${scheme.name}`}>
              <div className="v32-model-heading"><h4>{scheme.name}</h4><span className={hit ? 'v32-outcome is-hit' : 'v32-outcome'}>{hit ? '命中特别码' : '未命中'}{!ready ? ' · 预热不计统计' : ''}</span></div>
              <Numbers picks={row.picks[scheme.key]} special={row.special}/>
            </section>;
          })}</div>
        </article>)}</div>
      </section>
    </> : !error ? <div className="v32-loading">正在逐期计算，请稍候…</div> : null}
  </main>;
}
