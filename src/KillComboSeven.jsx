import { useEffect, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

function Ball({ value, failed = false }) {
  return <span className={`kc7-ball ${failed ? 'is-failed' : ''}`}>{fmtNum(value)}</span>;
}

function NumberStrip({ items = [], failedNumbers = [] }) {
  const failedSet = new Set(failedNumbers);
  return (
    <div className="kc7-strip">
      {items.map((item) => (
        <Ball key={item.number || item} value={item.number || item} failed={failedSet.has(item.number || item)} />
      ))}
    </div>
  );
}

function SourceGrid({ summary = {} }) {
  return (
    <div className="kc7-source-grid">
      {Object.entries(summary).map(([key, item]) => (
        <div className="kc7-source" key={key}>
          <Ball value={item.number} />
          <div>
            <strong>{key}</strong>
            <span>{item.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CandidatePool({ rows = [] }) {
  return (
    <section className="kc7-panel kc7-card">
      <h2>候选观察池</h2>
      <div className="kc7-candidates">
        {rows.map((item) => (
          <div className="kc7-candidate" key={item.number}>
            <Ball value={item.number} />
            <div>
              <strong>{item.score.toFixed(2)} · 近10开{item.recent10}次</strong>
              <span>{(item.sources || []).slice(0, 3).join(' / ')}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlanGrid({ plans = [], backtests = {} }) {
  if (!plans.length) return null;

  return (
    <section className="kc7-plans">
      {plans.map((plan) => {
        const stats = backtests[plan.key] || {};
        return (
          <div className={`kc7-plan kc7-plan-${plan.key}`} key={plan.key}>
            <div className="kc7-plan-head">
              <div>
                <h2>{plan.name}</h2>
                <p>{plan.description}</p>
              </div>
            </div>
            <NumberStrip items={plan.optimizedSeven || []} />
            <div className="kc7-plan-stats">
              {[10, 20, 50, 100].map((count) => {
                const item = stats[`backtest${count}`] || {};
                return (
                  <div key={count}>
                    <strong>{item.successCount ?? '--'}/{item.count ?? '--'}</strong>
                    <span>近{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BacktestTable({ rows = [] }) {
  return (
    <section className="kc7-panel kc7-section">
      <h2>近10期滚动回测</h2>
      <div className="kc7-table-wrap">
        <table className="kc7-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>组合杀码</th>
              <th>结果</th>
              <th>开奖号码</th>
              <th>开出杀码</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.year}-${row.No}`}>
                <td>{row.year ? `${row.year}-${String(row.No).padStart(3, '0')}` : row.No}</td>
                <td><NumberStrip items={row.killNumbers || []} failedNumbers={row.appearedNumbers || []} /></td>
                <td>
                  <span className={`kc7-status ${row.success ? 'is-ok' : 'is-bad'}`}>
                    {row.success ? '全杀成功' : '失败'}
                  </span>
                </td>
                <td className="kc7-nums">{(row.actualNumbers || []).map(fmtNum).join(', ')}</td>
                <td className="kc7-nums">{(row.appearedNumbers || []).length ? row.appearedNumbers.map(fmtNum).join(', ') : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function KillComboSeven() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/kill/combo-seven?count=10', {
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
  const latest = data?.historyMeta?.latest;
  const bt10 = data?.backtest10;
  const bt20 = data?.backtest20;
  const guard = bt10?.failureGuard;

  return (
    <main className="kc7-page">
      <style>{`
        .kc7-page { min-height: 100vh; padding: 72px 18px 42px; color: #eef6ff; box-sizing: border-box; background: #111827; }
        .kc7-shell { width: min(1180px, 100%); margin: 0 auto; }
        .kc7-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: end; margin-bottom: 16px; }
        .kc7-title { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
        .kc7-subtitle { margin: 8px 0 0; color: #a8b8cc; font-size: 14px; line-height: 1.55; }
        .kc7-panel { border: 1px solid rgba(148, 163, 184, 0.22); background: rgba(15, 23, 42, 0.82); border-radius: 8px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22); }
        .kc7-hero { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr); gap: 14px; margin-bottom: 14px; }
        .kc7-current { padding: 18px; border-color: rgba(34, 197, 94, 0.42); }
        .kc7-label { color: #86efac; font-size: 12px; font-weight: 950; margin-bottom: 10px; }
        .kc7-current h2, .kc7-card h2, .kc7-section h2 { margin: 0 0 12px; font-size: 16px; line-height: 1.3; }
        .kc7-big-strip { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 14px; }
        .kc7-big-strip .kc7-ball { width: 58px; height: 58px; font-size: 22px; background: #22c55e; color: #052e16; }
        .kc7-reason { margin: 0; color: #cbd5e1; font-size: 13px; line-height: 1.55; }
        .kc7-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .kc7-stat { padding: 16px; }
        .kc7-stat strong { display: block; font-size: 30px; line-height: 1.1; }
        .kc7-stat span { display: block; margin-top: 6px; color: #9fb2c8; font-size: 12px; font-weight: 750; }
        .kc7-guard {
          margin-top: 14px;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid rgba(34, 197, 94, 0.32);
          background: rgba(34, 197, 94, 0.1);
          color: #bbf7d0;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 800;
        }
        .kc7-guard.is-warn {
          border-color: rgba(248, 113, 113, 0.42);
          background: rgba(239, 68, 68, 0.14);
          color: #fecaca;
        }
        .kc7-layout { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 14px; margin-bottom: 14px; }
        .kc7-card, .kc7-section { padding: 16px; }
        .kc7-plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
        .kc7-plan { padding: 16px; border: 1px solid rgba(148, 163, 184, 0.22); background: rgba(15, 23, 42, 0.72); border-radius: 8px; }
        .kc7-plan-short { border-color: rgba(34, 197, 94, 0.38); }
        .kc7-plan-long { border-color: rgba(56, 189, 248, 0.36); }
        .kc7-plan-observe { border-color: rgba(251, 191, 36, 0.36); }
        .kc7-plan-head h2 { margin: 0 0 6px; font-size: 15px; line-height: 1.25; }
        .kc7-plan-head p { margin: 0 0 12px; min-height: 40px; color: #a8b8cc; font-size: 12px; line-height: 1.45; }
        .kc7-plan .kc7-strip { margin: 6px 0 12px; min-width: 0; }
        .kc7-plan-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .kc7-plan-stats div { padding: 8px 7px; border-radius: 8px; background: rgba(255,255,255,0.045); text-align: center; }
        .kc7-plan-stats strong { display: block; font-size: 13px; line-height: 1.2; }
        .kc7-plan-stats span { display: block; margin-top: 3px; color: #93a4ba; font-size: 11px; font-weight: 850; }
        .kc7-source-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .kc7-source, .kc7-candidate { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.04); }
        .kc7-source strong, .kc7-source span, .kc7-candidate strong, .kc7-candidate span { display: block; }
        .kc7-source span, .kc7-candidate span { margin-top: 3px; color: #9fb2c8; font-size: 12px; line-height: 1.35; }
        .kc7-candidates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .kc7-ball { display: inline-grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 50%; background: #38bdf8; color: #082f49; font-weight: 950; }
        .kc7-ball.is-failed { background: #ef4444; color: #fff; }
        .kc7-strip { display: flex; flex-wrap: wrap; gap: 6px; min-width: 270px; }
        .kc7-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .kc7-table { width: 100%; min-width: 860px; border-collapse: collapse; font-size: 13px; }
        .kc7-table th, .kc7-table td { padding: 10px 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.13); text-align: left; vertical-align: top; }
        .kc7-table th { color: #93a4ba; font-size: 12px; font-weight: 850; }
        .kc7-status { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 850; }
        .kc7-status.is-ok { background: rgba(34, 197, 94, 0.16); color: #86efac; }
        .kc7-status.is-bad { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
        .kc7-nums { color: #dbeafe; white-space: nowrap; }
        .kc7-message { padding: 18px; color: #cbd5e1; }
        .kc7-message.is-error { color: #fca5a5; }
        @media (max-width: 940px) { .kc7-head, .kc7-hero, .kc7-layout, .kc7-stats, .kc7-plans, .kc7-source-grid, .kc7-candidates { grid-template-columns: 1fr; } }
      `}</style>

      <div className="kc7-shell">
        <header className="kc7-head">
          <div>
            <h1 className="kc7-title">四页组合 7 杀</h1>
            <p className="kc7-subtitle">合并四页核心，再分短线、长线保护、观察实验三组补位；按数据库 history 做滚动回测。</p>
          </div>
        </header>

        {loading && <div className="kc7-panel kc7-message">加载组合回测中...</div>}
        {error && <div className="kc7-panel kc7-message is-error">{error}（请确认后端和数据库已启动）</div>}
        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="kc7-panel kc7-message">{data.message} 当前数据库共有 {data.historyCount} 期。</div>
        )}

        {!loading && !error && data?.status !== 'insufficient-history' && (
          <>
            <div className="kc7-hero">
              <section className="kc7-panel kc7-current">
                <div className="kc7-label">当前核心 + 补位 7 杀</div>
                <div className="kc7-big-strip">
                  {(current?.optimizedSeven || []).map((item) => <Ball key={item.number} value={item.number} />)}
                </div>
                <p className="kc7-reason">
                  最新 {latest ? `${latest.year}-${String(latest.No).padStart(3, '0')}` : '--'}，四页核心保持为底座，补位采用近10有热度、近5降温、尾数压力仍在的实验方向。
                </p>
                {guard && (
                  <div className={`kc7-guard ${guard.shouldSwitchExperiment ? 'is-warn' : ''}`}>
                    {guard.message}
                  </div>
                )}
              </section>

              <div className="kc7-stats">
                <section className="kc7-panel kc7-stat">
                  <strong>{fmtPct(bt10?.successRate)}</strong>
                  <span>近10期 7杀成功 {bt10?.successCount || 0}/{bt10?.count || 0}</span>
                </section>
                <section className="kc7-panel kc7-stat">
                  <strong>{fmtPct(bt10?.coreSuccessRate)}</strong>
                  <span>近10期 四页核心 {bt10?.coreSuccessCount || 0}/{bt10?.count || 0}</span>
                </section>
                <section className="kc7-panel kc7-stat">
                  <strong>{fmtPct(bt20?.successRate)}</strong>
                  <span>近20期 7杀成功 {bt20?.successCount || 0}/{bt20?.count || 0}</span>
                </section>
                <section className="kc7-panel kc7-stat">
                  <strong>{data?.status || '--'}</strong>
                  <span>接口状态</span>
                </section>
              </div>
            </div>

            <PlanGrid plans={current?.supplementPlans || []} backtests={data?.supplementPlanBacktests || {}} />

            <div className="kc7-layout">
              <section className="kc7-panel kc7-card">
                <h2>来源核心</h2>
                <SourceGrid summary={current?.sourceSummary || {}} />
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
