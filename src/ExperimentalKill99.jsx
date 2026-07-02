import { useEffect, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

function Ball({ value, failed = false }) {
  return <span className={`ek99-ball ${failed ? 'is-failed' : ''}`}>{fmtNum(value)}</span>;
}

function RateBadge({ label, backtest, required }) {
  const ok = (backtest?.successRate || 0) >= required;
  return (
    <span className={`ek99-badge ${ok ? 'is-ok' : 'is-bad'}`}>
      {label} {backtest?.successCount || 0}/{backtest?.count || 0} · {fmtPct(backtest?.successRate)}
    </span>
  );
}

function FailureList({ rows = [] }) {
  if (!rows.length) return <div className="ek99-empty">近50期无失败明细</div>;
  return (
    <div className="ek99-failures">
      <div className="ek99-failure-title">近50失败明细</div>
      {rows.map((row) => (
        <div className="ek99-failure" key={`${row.year}-${row.No}-${row.predictedNumber}`}>
          <span>{row.year ? `${row.year}-${String(row.No).padStart(3, '0')}` : row.No}</span>
          <Ball value={row.predictedNumber} failed />
          <strong>{(row.actualNumbers || []).map(fmtNum).join(', ')}</strong>
        </div>
      ))}
    </div>
  );
}

function StrategyCard({ report }) {
  return (
    <section className="ek99-panel ek99-card">
      <div className="ek99-card-head">
        <div>
          <h2>{report?.name || '--'}</h2>
          <p>{report?.description || '--'}</p>
        </div>
        <Ball value={report?.prediction?.number} />
      </div>
      <div className="ek99-badges">
        <RateBadge label="近20期" backtest={report?.backtest20} required={1} />
        <RateBadge label="近50期" backtest={report?.backtest50} required={0.98} />
      </div>
      <p className="ek99-reason">{report?.prediction?.reason || '--'}</p>
      <FailureList rows={report?.backtest50?.failureRows || []} />
    </section>
  );
}

function BacktestTable({ rows = [] }) {
  return (
    <section className="ek99-panel ek99-section">
      <h2>组合优选 · 近20期回测</h2>
      <div className="ek99-table-wrap">
        <table className="ek99-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>杀码</th>
              <th>状态</th>
              <th>开奖号码</th>
              <th>方向</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.year}-${row.No}-${row.predictedNumber}`}>
                <td>{row.year ? `${row.year}-${String(row.No).padStart(3, '0')}` : row.No}</td>
                <td><Ball value={row.predictedNumber} failed={!row.success} /></td>
                <td><span className={`ek99-status ${row.success ? 'is-ok' : 'is-bad'}`}>{row.success ? '成功' : '失败'}</span></td>
                <td className="ek99-nums">{(row.actualNumbers || []).map(fmtNum).join(', ')}</td>
                <td>
                  <strong>{row.strategyName || '--'}</strong>
                  <p>{row.reason || ''}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ExperimentalKill99() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/kill/experimental-99', {
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
  const prediction = current?.prediction;
  const latest = data?.historyMeta?.latest;
  const targetMet = data?.status === 'target-met';

  return (
    <main className="ek99-page">
      <style>{`
        .ek99-page { min-height: 100vh; padding: 72px 18px 42px; color: #eef6ff; box-sizing: border-box; background: #101623; }
        .ek99-shell { width: min(1180px, 100%); margin: 0 auto; }
        .ek99-head { margin-bottom: 16px; }
        .ek99-title { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
        .ek99-subtitle { margin: 8px 0 0; color: #9fb2c8; font-size: 14px; }
        .ek99-panel { border: 1px solid rgba(148, 163, 184, 0.2); background: rgba(15, 23, 42, 0.78); border-radius: 8px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24); }
        .ek99-hero { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr); gap: 14px; margin-bottom: 14px; }
        .ek99-current { padding: 18px; border-color: rgba(56, 189, 248, 0.42); }
        .ek99-label { color: #7dd3fc; font-size: 12px; font-weight: 950; margin-bottom: 8px; }
        .ek99-main { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .ek99-big-ball { display: inline-grid; place-items: center; width: 96px; height: 96px; border-radius: 50%; background: #38bdf8; color: #082f49; font-size: 38px; font-weight: 950; }
        .ek99-current h2 { margin: 0; font-size: 21px; line-height: 1.25; }
        .ek99-reason { margin: 10px 0 0; color: #cbd5e1; font-size: 13px; line-height: 1.55; }
        .ek99-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .ek99-badge { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.25); color: #dbeafe; background: rgba(255, 255, 255, 0.05); font-size: 12px; font-weight: 850; }
        .ek99-badge.is-ok { border-color: rgba(34, 197, 94, 0.45); background: rgba(34, 197, 94, 0.14); color: #86efac; }
        .ek99-badge.is-bad { border-color: rgba(248, 113, 113, 0.45); background: rgba(248, 113, 113, 0.14); color: #fca5a5; }
        .ek99-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .ek99-stat { padding: 16px; }
        .ek99-stat strong { display: block; font-size: 28px; line-height: 1.1; overflow-wrap: anywhere; }
        .ek99-stat span { display: block; margin-top: 6px; color: #9fb2c8; font-size: 12px; font-weight: 750; }
        .ek99-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
        .ek99-card { padding: 16px; }
        .ek99-card-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
        .ek99-card h2, .ek99-section h2 { margin: 0 0 8px; font-size: 16px; line-height: 1.3; }
        .ek99-card p { margin: 0; color: #9fb2c8; font-size: 13px; line-height: 1.45; }
        .ek99-ball { display: inline-grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 50%; background: #2dd4bf; color: #042f2e; font-weight: 950; }
        .ek99-ball.is-failed { background: #ef4444; color: #fff; }
        .ek99-failures { margin-top: 12px; display: grid; gap: 8px; }
        .ek99-failure-title, .ek99-empty { color: #8fa3b5; font-size: 12px; font-weight: 850; }
        .ek99-failure { display: grid; grid-template-columns: 80px 38px minmax(0, 1fr); gap: 8px; align-items: center; color: #cbd5e1; font-size: 12px; }
        .ek99-section { padding: 16px; margin-bottom: 14px; }
        .ek99-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .ek99-table { width: 100%; min-width: 780px; border-collapse: collapse; font-size: 13px; }
        .ek99-table th, .ek99-table td { padding: 10px 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.13); text-align: left; vertical-align: top; }
        .ek99-table th { color: #93a4ba; font-size: 12px; font-weight: 850; }
        .ek99-table p { margin: 4px 0 0; color: #8fa3b5; font-size: 12px; line-height: 1.4; }
        .ek99-status { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 850; }
        .ek99-status.is-ok { background: rgba(34, 197, 94, 0.16); color: #86efac; }
        .ek99-status.is-bad { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
        .ek99-nums { color: #dbeafe; white-space: nowrap; }
        .ek99-message { padding: 18px; color: #cbd5e1; }
        .ek99-message.is-error { color: #fca5a5; }
        @media (max-width: 900px) { .ek99-hero, .ek99-grid { grid-template-columns: 1fr; } .ek99-stats { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 901px) and (max-width: 1180px) { .ek99-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>

      <div className="ek99-shell">
        <header className="ek99-head">
          <div>
            <h1 className="ek99-title">99组合实验单杀</h1>
            <p className="ek99-subtitle">仅使用数据库 history：双号重叠后验、尾位轻修正、精确三号重叠、期号相位。</p>
          </div>
        </header>

        {loading && <div className="ek99-panel ek99-message">加载组合回测中...</div>}
        {error && <div className="ek99-panel ek99-message is-error">{error}（请确认后端和数据库已启动）</div>}
        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="ek99-panel ek99-message">{data.message} 当前数据库共有 {data.historyCount} 期。</div>
        )}

        {!loading && !error && data?.status !== 'insufficient-history' && (
          <>
            <div className="ek99-hero">
              <section className="ek99-panel ek99-current">
                <div className="ek99-label">组合优选单杀</div>
                <div className="ek99-main">
                  <div className="ek99-big-ball">{prediction?.display || '--'}</div>
                  <div>
                    <h2>{prediction?.strategyName || current?.name || '--'}</h2>
                    <p className="ek99-reason">{prediction?.reason || current?.description || '--'}</p>
                    <div className="ek99-badges">
                      <span className={`ek99-badge ${targetMet ? 'is-ok' : 'is-bad'}`}>{targetMet ? '99目标已达成' : '当前未完全达标'}</span>
                      <span className="ek99-badge">数据库 {data?.historyMeta?.count || 0} 期</span>
                      <span className="ek99-badge">最新 {latest ? `${latest.year || ''}-${String(latest.No || '').padStart(3, '0')}` : '--'}</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="ek99-stats">
                <section className="ek99-panel ek99-stat">
                  <strong>{fmtPct(current?.backtest20?.successRate)}</strong>
                  <span>近20期 {current?.backtest20?.successCount || 0}/{current?.backtest20?.count || 0}</span>
                </section>
                <section className="ek99-panel ek99-stat">
                  <strong>{fmtPct(current?.backtest50?.successRate)}</strong>
                  <span>近50期 {current?.backtest50?.successCount || 0}/{current?.backtest50?.count || 0}</span>
                </section>
                <section className="ek99-panel ek99-stat">
                  <strong>{current?.sourceStrategy || '--'}</strong>
                  <span>当前采用方向</span>
                </section>
                <section className="ek99-panel ek99-stat">
                  <strong>{data?.status || '--'}</strong>
                  <span>接口状态</span>
                </section>
              </div>
            </div>

            <div className="ek99-grid">
              {(data?.strategies || []).map((report) => <StrategyCard key={report.key} report={report} />)}
            </div>

            <BacktestTable rows={current?.backtest20?.rows || []} />
          </>
        )}
      </div>
    </main>
  );
}
