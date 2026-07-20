import { useEffect, useMemo, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

function Ball({ value, failed = false }) {
  return <span className={`sfk-ball ${failed ? 'is-failed' : ''}`}>{fmtNum(value)}</span>;
}

function NumberStrip({ items = [], failedNumbers = [] }) {
  const failedSet = useMemo(() => new Set(failedNumbers), [failedNumbers]);
  return (
    <div className="sfk-strip">
      {items.map((item) => {
        const value = item.number || item;
        return <Ball key={value} value={value} failed={failedSet.has(value)} />;
      })}
    </div>
  );
}

function StatCard({ label, value, hint, tone = 'normal' }) {
  return (
    <section className={`sfk-card sfk-stat sfk-stat-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <em>{hint}</em> : null}
    </section>
  );
}

function BacktestTable({ rows = [] }) {
  return (
    <section className="sfk-card sfk-section">
      <h2>近10期实战回放</h2>
      <div className="sfk-table-wrap">
        <table className="sfk-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>稳健 5 杀</th>
              <th>结果</th>
              <th>开奖号码</th>
              <th>错号</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.year}-${row.No}`}>
                <td>{row.year ? `${row.year}-${String(row.No).padStart(3, '0')}` : row.No}</td>
                <td><NumberStrip items={row.killNumbers || []} failedNumbers={row.appearedNumbers || []} /></td>
                <td>
                  <span className={`sfk-status ${row.success ? 'is-ok' : 'is-bad'}`}>
                    {row.success ? '成功' : `错${row.appearedCount || 1}个`}
                  </span>
                </td>
                <td className="sfk-nums">{(row.actualNumbers || []).map(fmtNum).join(', ')}</td>
                <td className="sfk-nums">{(row.appearedNumbers || []).length ? row.appearedNumbers.map(fmtNum).join(', ') : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CandidatePool({ rows = [] }) {
  return (
    <section className="sfk-card sfk-section">
      <h2>候选池：为什么入选</h2>
      <div className="sfk-pool">
        {rows.map((item) => (
          <div className="sfk-candidate" key={item.number}>
            <Ball value={item.number} />
            <div>
              <strong>稳定分 {item.stableScore?.toFixed?.(2) ?? '--'} · 支持 {item.planSupport?.length || 0}</strong>
              <span>{(item.planSupport || []).slice(0, 4).join(' / ')}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WindowGrid({ data }) {
  const items = [10, 20, 50, 100].map((count) => ({
    count,
    summary: data?.[`backtest${count}`],
  }));

  return (
    <section className="sfk-windows">
      {items.map(({ count, summary }) => (
        <div className="sfk-card sfk-window" key={count}>
          <h3>近{count}</h3>
          <strong>{fmtPct(summary?.successRate)}</strong>
          <span>单期 {summary?.successCount || 0}/{summary?.count || 0}</span>
          <em>三连窗口 {summary?.threeHitCount || 0}/{summary?.threeWindows || 0} · {fmtPct(summary?.threeHitRate)}</em>
        </div>
      ))}
    </section>
  );
}

export default function StableFiveKill() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/kill/combo-seven/stable-five', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || `接口返回 ${res.status}`);
        setData(json);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, []);

  const current = data?.currentRecommendation;
  const bt10 = data?.backtest10;
  const bt20 = data?.backtest20;
  const dist = bt20?.appearedCountDistribution || {};
  const latest = data?.historyMeta?.latest;

  return (
    <main className="sfk-page">
      <style>{`
        .sfk-page { min-height: 100vh; padding: 72px 18px 42px; color: #f8fafc; box-sizing: border-box; background: radial-gradient(circle at top left, rgba(34,197,94,.18), transparent 32%), #101827; }
        .sfk-shell { width: min(1180px, 100%); margin: 0 auto; }
        .sfk-head { margin-bottom: 16px; }
        .sfk-title { margin: 0; font-size: 30px; line-height: 1.15; }
        .sfk-subtitle { margin: 8px 0 0; max-width: 760px; color: #a8b8cc; font-size: 14px; line-height: 1.6; }
        .sfk-card { border: 1px solid rgba(148, 163, 184, 0.22); background: rgba(15, 23, 42, 0.82); border-radius: 10px; box-shadow: 0 18px 46px rgba(0, 0, 0, 0.24); }
        .sfk-hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(360px, .95fr); gap: 14px; margin-bottom: 14px; }
        .sfk-current { padding: 20px; border-color: rgba(34,197,94,.42); }
        .sfk-label { margin-bottom: 10px; color: #86efac; font-size: 12px; font-weight: 950; }
        .sfk-current h2, .sfk-section h2 { margin: 0 0 12px; font-size: 16px; line-height: 1.3; }
        .sfk-big-strip { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 14px; }
        .sfk-big-strip .sfk-ball { width: 62px; height: 62px; font-size: 23px; background: #22c55e; color: #052e16; }
        .sfk-reason { margin: 0; color: #cbd5e1; font-size: 13px; line-height: 1.6; }
        .sfk-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .sfk-stat { padding: 16px; }
        .sfk-stat strong { display: block; font-size: 30px; line-height: 1.05; }
        .sfk-stat span { display: block; margin-top: 7px; color: #9fb2c8; font-size: 12px; font-weight: 850; }
        .sfk-stat em, .sfk-window em { display: block; margin-top: 5px; color: #c4b5fd; font-size: 12px; font-style: normal; }
        .sfk-stat-hot { border-color: rgba(34,197,94,.42); }
        .sfk-stat-warn { border-color: rgba(251,191,36,.38); }
        .sfk-windows { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
        .sfk-window { padding: 14px; }
        .sfk-window h3 { margin: 0 0 8px; color: #93c5fd; font-size: 13px; }
        .sfk-window strong { display: block; font-size: 24px; }
        .sfk-window span { display: block; margin-top: 4px; color: #9fb2c8; font-size: 12px; }
        .sfk-layout { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 14px; margin-bottom: 14px; }
        .sfk-section { padding: 16px; }
        .sfk-pool { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .sfk-candidate { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 9px; background: rgba(255,255,255,.045); }
        .sfk-candidate strong, .sfk-candidate span { display: block; }
        .sfk-candidate span { margin-top: 3px; color: #9fb2c8; font-size: 12px; line-height: 1.35; }
        .sfk-strip { display: flex; flex-wrap: wrap; gap: 6px; min-width: 230px; }
        .sfk-ball { display: inline-grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 50%; background: #38bdf8; color: #082f49; font-weight: 950; }
        .sfk-ball.is-failed { background: #ef4444; color: #fff; }
        .sfk-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .sfk-table { width: 100%; min-width: 820px; border-collapse: collapse; font-size: 13px; }
        .sfk-table th, .sfk-table td { padding: 10px 8px; border-bottom: 1px solid rgba(148,163,184,.13); text-align: left; vertical-align: top; }
        .sfk-table th { color: #93a4ba; font-size: 12px; font-weight: 850; }
        .sfk-status { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 850; }
        .sfk-status.is-ok { background: rgba(34,197,94,.16); color: #86efac; }
        .sfk-status.is-bad { background: rgba(239,68,68,.16); color: #fca5a5; }
        .sfk-nums { color: #dbeafe; white-space: nowrap; }
        .sfk-message { padding: 18px; color: #cbd5e1; }
        .sfk-message.is-error { color: #fca5a5; }
        @media (max-width: 940px) { .sfk-hero, .sfk-stats, .sfk-windows, .sfk-layout, .sfk-pool { grid-template-columns: 1fr; } }
      `}</style>

      <div className="sfk-shell">
        <header className="sfk-head">
          <h1 className="sfk-title">稳健 5 杀 · 三连中观察</h1>
          <p className="sfk-subtitle">
            这个页面不是为了杀更多号，而是为了降低实战撞号风险。重点看三连窗口、最长连中和错号分布，再和 7 杀页面对比。
          </p>
        </header>

        {loading && <div className="sfk-card sfk-message">加载稳健回测中...</div>}
        {error && <div className="sfk-card sfk-message is-error">{error}（请确认后端和数据库已启动）</div>}
        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="sfk-card sfk-message">{data.message} 当前数据库共有 {data.historyCount} 期。</div>
        )}

        {!loading && !error && data?.status !== 'insufficient-history' && (
          <>
            <div className="sfk-hero">
              <section className="sfk-card sfk-current">
                <div className="sfk-label">当前稳健 5 杀</div>
                <div className="sfk-big-strip">
                  {(current?.optimizedFive || []).map((item) => <Ball key={item.number} value={item.number} />)}
                </div>
                <p className="sfk-reason">
                  最新 {latest ? `${latest.year}-${String(latest.No).padStart(3, '0')}` : '--'}。{current?.reason}
                </p>
              </section>

              <div className="sfk-stats">
                <StatCard tone="hot" label="近20单期成功" value={fmtPct(bt20?.successRate)} hint={`${bt20?.successCount || 0}/${bt20?.count || 0}`} />
                <StatCard tone="hot" label="近20三连窗口" value={fmtPct(bt20?.threeHitRate)} hint={`${bt20?.threeHitCount || 0}/${bt20?.threeWindows || 0}`} />
                <StatCard label="近10单期成功" value={fmtPct(bt10?.successRate)} hint={`${bt10?.successCount || 0}/${bt10?.count || 0}`} />
                <StatCard tone="warn" label="近20错号分布" value={`0:${dist['0'] || 0}  1:${dist['1'] || 0}  2+:${dist['2+'] || 0}`} hint={`最长连中 ${bt20?.maxSuccessStreak || 0} · 当前连错 ${bt20?.currentFailureStreak || 0}`} />
              </div>
            </div>

            <WindowGrid data={data} />

            <div className="sfk-layout">
              <section className="sfk-card sfk-section">
                <h2>7 杀底座对照</h2>
                <NumberStrip items={current?.baseSeven || []} />
                <p className="sfk-reason">这里显示原 7 杀底座。稳健 5 杀会优先保留多策略重合的号码，把边缘补位先放弃。</p>
              </section>
              <CandidatePool rows={current?.candidatePool || []} />
            </div>

            <BacktestTable rows={bt10?.rows || []} />
          </>
        )}
      </div>
    </main>
  );
}
