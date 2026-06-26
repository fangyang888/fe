import { useEffect, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

function Ball({ value, failed = false }) {
  return <span className={`ek98-ball ${failed ? 'is-failed' : ''}`}>{fmtNum(value)}</span>;
}

function RateBadge({ label, backtest, required }) {
  const ok = (backtest?.successRate || 0) >= required;
  return (
    <span className={`ek98-badge ${ok ? 'is-ok' : 'is-bad'}`}>
      {label} {backtest?.successCount || 0}/{backtest?.count || 0} · {fmtPct(backtest?.successRate)}
    </span>
  );
}

function FailureList({ rows = [] }) {
  if (!rows.length) return <div className="ek98-empty">近50期无失败明细</div>;
  return (
    <div className="ek98-failures">
      <div className="ek98-failure-title">近50失败明细</div>
      {rows.map((row) => (
        <div className="ek98-failure" key={`${row.year}-${row.No}-${row.predictedNumber}`}>
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
    <section className="ek98-panel ek98-card">
      <div className="ek98-card-head">
        <div>
          <h2>{report?.name || '--'}</h2>
          <p>{report?.description || '--'}</p>
        </div>
        <Ball value={report?.prediction?.number} />
      </div>
      <div className="ek98-badges">
        <RateBadge label="近20期" backtest={report?.backtest20} required={1} />
        <RateBadge label="近50期" backtest={report?.backtest50} required={0.98} />
      </div>
      <p className="ek98-reason">{report?.prediction?.reason || '--'}</p>
      <FailureList rows={report?.backtest50?.failureRows || []} />
    </section>
  );
}

function BacktestTable({ rows = [] }) {
  return (
    <section className="ek98-panel ek98-section">
      <h2>实验优选 · 近20期回测</h2>
      <div className="ek98-table-wrap">
        <table className="ek98-table">
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
                <td><span className={`ek98-status ${row.success ? 'is-ok' : 'is-bad'}`}>{row.success ? '成功' : '失败'}</span></td>
                <td className="ek98-nums">{(row.actualNumbers || []).map(fmtNum).join(', ')}</td>
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

export default function ExperimentalKill98() {
  const [dataType, setDataType] = useState('default');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/kill/experimental-98?type=${dataType}`, {
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
  }, [dataType]);

  const current = data?.currentRecommendation;
  const prediction = current?.prediction;
  const latest = data?.historyMeta?.latest;
  const targetMet = data?.status === 'target-met';

  return (
    <main className="ek98-page">
      <style>{`
        .ek98-page {
          min-height: 100vh;
          padding: 72px 18px 42px;
          color: #eef6ff;
          box-sizing: border-box;
          background:
            radial-gradient(circle at 18% 10%, rgba(250, 204, 21, 0.16), transparent 25%),
            radial-gradient(circle at 86% 12%, rgba(45, 212, 191, 0.15), transparent 25%),
            #111827;
        }
        .ek98-shell { width: min(1180px, 100%); margin: 0 auto; }
        .ek98-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: end;
          margin-bottom: 16px;
        }
        .ek98-title { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
        .ek98-subtitle { margin: 8px 0 0; color: #9fb2c8; font-size: 14px; }
        .ek98-tabs {
          display: inline-flex;
          gap: 8px;
          padding: 6px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.74);
        }
        .ek98-tab {
          height: 34px;
          border: 0;
          border-radius: 7px;
          padding: 0 14px;
          color: #cbd5e1;
          background: transparent;
          font-weight: 850;
          cursor: pointer;
        }
        .ek98-tab.is-active { background: #facc15; color: #422006; }
        .ek98-panel {
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.78);
          border-radius: 8px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
        }
        .ek98-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .ek98-current { padding: 18px; border-color: rgba(250, 204, 21, 0.42); }
        .ek98-label { color: #fde68a; font-size: 12px; font-weight: 950; margin-bottom: 8px; }
        .ek98-main { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .ek98-big-ball {
          display: inline-grid;
          place-items: center;
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: #facc15;
          color: #422006;
          font-size: 38px;
          font-weight: 950;
          box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.2), 0 18px 34px rgba(250, 204, 21, 0.25);
        }
        .ek98-current h2 { margin: 0; font-size: 21px; line-height: 1.25; }
        .ek98-reason { margin: 10px 0 0; color: #cbd5e1; font-size: 13px; line-height: 1.55; }
        .ek98-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .ek98-badge {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          color: #dbeafe;
          background: rgba(255, 255, 255, 0.05);
          font-size: 12px;
          font-weight: 850;
        }
        .ek98-badge.is-ok { border-color: rgba(34, 197, 94, 0.45); background: rgba(34, 197, 94, 0.14); color: #86efac; }
        .ek98-badge.is-bad { border-color: rgba(248, 113, 113, 0.45); background: rgba(248, 113, 113, 0.14); color: #fca5a5; }
        .ek98-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .ek98-stat { padding: 16px; }
        .ek98-stat strong { display: block; font-size: 28px; line-height: 1.1; }
        .ek98-stat span { display: block; margin-top: 6px; color: #9fb2c8; font-size: 12px; font-weight: 750; }
        .ek98-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
        .ek98-card { padding: 16px; }
        .ek98-card-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
        .ek98-card h2, .ek98-section h2 { margin: 0 0 8px; font-size: 16px; line-height: 1.3; }
        .ek98-card p { margin: 0; color: #9fb2c8; font-size: 13px; line-height: 1.45; }
        .ek98-ball {
          display: inline-grid;
          place-items: center;
          flex: none;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #2dd4bf;
          color: #042f2e;
          font-weight: 950;
        }
        .ek98-ball.is-failed { background: #ef4444; color: #fff; }
        .ek98-failures { margin-top: 12px; display: grid; gap: 8px; }
        .ek98-failure-title, .ek98-empty { color: #8fa3b5; font-size: 12px; font-weight: 850; }
        .ek98-failure {
          display: grid;
          grid-template-columns: 80px 38px minmax(0, 1fr);
          gap: 8px;
          align-items: center;
          color: #cbd5e1;
          font-size: 12px;
        }
        .ek98-failure strong { color: #e2e8f0; }
        .ek98-section { padding: 16px; margin-bottom: 14px; }
        .ek98-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .ek98-table { width: 100%; min-width: 780px; border-collapse: collapse; font-size: 13px; }
        .ek98-table th, .ek98-table td {
          padding: 10px 8px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.13);
          text-align: left;
          vertical-align: top;
        }
        .ek98-table th { color: #93a4ba; font-size: 12px; font-weight: 850; }
        .ek98-table p { margin: 4px 0 0; color: #8fa3b5; font-size: 12px; line-height: 1.4; }
        .ek98-status {
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 9px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 850;
        }
        .ek98-status.is-ok { background: rgba(34, 197, 94, 0.16); color: #86efac; }
        .ek98-status.is-bad { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
        .ek98-nums { color: #dbeafe; white-space: nowrap; }
        .ek98-message { padding: 18px; color: #cbd5e1; }
        .ek98-message.is-error { color: #fca5a5; }
        @media (max-width: 900px) {
          .ek98-head, .ek98-hero, .ek98-grid { grid-template-columns: 1fr; }
          .ek98-stats { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 901px) and (max-width: 1180px) {
          .ek98-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>

      <div className="ek98-shell">
        <header className="ek98-head">
          <div>
            <h1 className="ek98-title">98实验单杀</h1>
            <p className="ek98-subtitle">独立实验方向：质合模数、跨度区间、和值尾形态、邻号压力、分区密度。</p>
          </div>
          <div className="ek98-tabs" role="tablist" aria-label="数据源">
            <button className={`ek98-tab ${dataType === 'default' ? 'is-active' : ''}`} type="button" onClick={() => setDataType('default')}>默认数据</button>
            <button className={`ek98-tab ${dataType === 'hk' ? 'is-active' : ''}`} type="button" onClick={() => setDataType('hk')}>香港数据</button>
          </div>
        </header>

        {loading && <div className="ek98-panel ek98-message">加载实验回测中...</div>}
        {error && <div className="ek98-panel ek98-message is-error">{error}（请确认后端和数据库已启动）</div>}
        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="ek98-panel ek98-message">{data.message} 当前数据库共有 {data.historyCount} 期。</div>
        )}

        {!loading && !error && data?.status !== 'insufficient-history' && (
          <>
            <div className="ek98-hero">
              <section className="ek98-panel ek98-current">
                <div className="ek98-label">实验优选单杀</div>
                <div className="ek98-main">
                  <div className="ek98-big-ball">{prediction?.display || '--'}</div>
                  <div>
                    <h2>{prediction?.strategyName || current?.name || '--'}</h2>
                    <p className="ek98-reason">{prediction?.reason || current?.description || '--'}</p>
                    <div className="ek98-badges">
                      <span className={`ek98-badge ${targetMet ? 'is-ok' : 'is-bad'}`}>{targetMet ? '98目标已达成' : '当前未完全达标'}</span>
                      <span className="ek98-badge">数据库 {data?.historyMeta?.count || 0} 期</span>
                      <span className="ek98-badge">最新 {latest ? `${latest.year || ''}-${String(latest.No || '').padStart(3, '0')}` : '--'}</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="ek98-stats">
                <section className="ek98-panel ek98-stat">
                  <strong>{fmtPct(current?.backtest20?.successRate)}</strong>
                  <span>近20期 {current?.backtest20?.successCount || 0}/{current?.backtest20?.count || 0}</span>
                </section>
                <section className="ek98-panel ek98-stat">
                  <strong>{fmtPct(current?.backtest50?.successRate)}</strong>
                  <span>近50期 {current?.backtest50?.successCount || 0}/{current?.backtest50?.count || 0}</span>
                </section>
                <section className="ek98-panel ek98-stat">
                  <strong>{current?.sourceStrategy || '--'}</strong>
                  <span>当前采用方向</span>
                </section>
                <section className="ek98-panel ek98-stat">
                  <strong>{data?.status || '--'}</strong>
                  <span>接口状态</span>
                </section>
              </div>
            </div>

            <div className="ek98-grid">
              {(data?.strategies || []).map((report) => <StrategyCard key={report.key} report={report} />)}
            </div>

            <BacktestTable rows={current?.backtest20?.rows || []} />
          </>
        )}
      </div>
    </main>
  );
}
