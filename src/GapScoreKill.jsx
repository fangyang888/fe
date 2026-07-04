import { useEffect, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

function Ball({ value, failed = false }) {
  return <span className={`gsk-ball ${failed ? 'is-failed' : ''}`}>{fmtNum(value)}</span>;
}

function Stat({ label, backtest }) {
  const ok = backtest?.successRate >= 1;
  return (
    <section className={`gsk-panel gsk-stat ${ok ? 'is-ok' : ''}`}>
      <strong>{fmtPct(backtest?.successRate)}</strong>
      <span>{label} {backtest?.successCount || 0}/{backtest?.count || 0}</span>
    </section>
  );
}

function CandidateList({ rows = [] }) {
  return (
    <div className="gsk-candidates">
      {rows.map((row) => (
        <div className="gsk-candidate" key={row.number}>
          <Ball value={row.number} />
          <div>
            <strong>第{row.rank}名 · {row.score}</strong>
            <span>
              miss {row.miss} · avg {Number(row.avgGap || 0).toFixed(1)} · z {Number(row.z || 0).toFixed(2)} · ratio {Number(row.ratio || 0).toFixed(2)}
            </span>
            <span>accel {row.accel} · f10 {row.f10} · f20 {row.f20}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BacktestTable({ rows = [] }) {
  return (
    <section className="gsk-panel gsk-section">
      <h2>近20期回测</h2>
      <div className="gsk-table-wrap">
        <table className="gsk-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>杀码</th>
              <th>结果</th>
              <th>规则</th>
              <th>开奖号码</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.year}-${row.No}-${row.predictedNumber}`}>
                <td>{row.year ? `${row.year}-${String(row.No).padStart(3, '0')}` : row.No}</td>
                <td><Ball value={row.predictedNumber} failed={!row.success} /></td>
                <td><span className={`gsk-status ${row.success ? 'is-ok' : 'is-bad'}`}>{row.success ? '成功' : '失败'}</span></td>
                <td>
                  <strong>第{row.selectedRank}名</strong>
                  <p>{row.guard}</p>
                </td>
                <td className="gsk-nums">{(row.actualNumbers || []).map(fmtNum).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function GapScoreKill() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/kill/gap-score', {
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
    <main className="gsk-page">
      <style>{`
        .gsk-page { min-height: 100vh; padding: 72px 18px 42px; color: #eef6ff; box-sizing: border-box; background: #111827; }
        .gsk-shell { width: min(1180px, 100%); margin: 0 auto; }
        .gsk-head { margin-bottom: 16px; }
        .gsk-title { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
        .gsk-subtitle { margin: 8px 0 0; color: #a8b8cc; font-size: 14px; line-height: 1.55; }
        .gsk-panel { border: 1px solid rgba(148, 163, 184, 0.22); background: rgba(17, 24, 39, 0.82); border-radius: 8px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22); }
        .gsk-hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr); gap: 14px; margin-bottom: 14px; }
        .gsk-current { padding: 18px; border-color: rgba(56, 189, 248, 0.42); }
        .gsk-label { color: #67e8f9; font-size: 12px; font-weight: 950; margin-bottom: 8px; }
        .gsk-main { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .gsk-big-ball { display: inline-grid; place-items: center; width: 96px; height: 96px; border-radius: 50%; background: #38bdf8; color: #082f49; font-size: 38px; font-weight: 950; }
        .gsk-current h2 { margin: 0; font-size: 21px; line-height: 1.25; }
        .gsk-reason { margin: 10px 0 0; color: #cbd5e1; font-size: 13px; line-height: 1.55; }
        .gsk-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .gsk-badge { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.25); color: #dbeafe; background: rgba(255, 255, 255, 0.05); font-size: 12px; font-weight: 850; }
        .gsk-badge.is-ok { border-color: rgba(34, 197, 94, 0.45); background: rgba(34, 197, 94, 0.14); color: #86efac; }
        .gsk-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .gsk-stat { padding: 16px; }
        .gsk-stat.is-ok { border-color: rgba(34, 197, 94, 0.36); }
        .gsk-stat strong { display: block; font-size: 28px; line-height: 1.1; }
        .gsk-stat span { display: block; margin-top: 6px; color: #9fb2c8; font-size: 12px; font-weight: 750; }
        .gsk-layout { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 14px; margin-bottom: 14px; }
        .gsk-card, .gsk-section { padding: 16px; }
        .gsk-card h2, .gsk-section h2 { margin: 0 0 12px; font-size: 16px; line-height: 1.3; }
        .gsk-candidates { display: grid; gap: 10px; }
        .gsk-candidate { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.04); }
        .gsk-candidate strong, .gsk-candidate span { display: block; }
        .gsk-candidate span { margin-top: 3px; color: #9fb2c8; font-size: 12px; line-height: 1.35; }
        .gsk-ball { display: inline-grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 50%; background: #22d3ee; color: #083344; font-weight: 950; }
        .gsk-ball.is-failed { background: #ef4444; color: #fff; }
        .gsk-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .gsk-table { width: 100%; min-width: 780px; border-collapse: collapse; font-size: 13px; }
        .gsk-table th, .gsk-table td { padding: 10px 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.13); text-align: left; vertical-align: top; }
        .gsk-table th { color: #93a4ba; font-size: 12px; font-weight: 850; }
        .gsk-table p { margin: 4px 0 0; color: #8fa3b5; font-size: 12px; line-height: 1.4; }
        .gsk-status { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 850; }
        .gsk-status.is-ok { background: rgba(34, 197, 94, 0.16); color: #86efac; }
        .gsk-status.is-bad { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
        .gsk-nums { color: #dbeafe; white-space: nowrap; }
        .gsk-message { padding: 18px; color: #cbd5e1; }
        .gsk-message.is-error { color: #fca5a5; }
        @media (max-width: 940px) { .gsk-hero, .gsk-layout { grid-template-columns: 1fr; } .gsk-stats { grid-template-columns: 1fr; } }
      `}</style>

      <div className="gsk-shell">
        <header className="gsk-head">
          <h1 className="gsk-title">固定 gap-f20-r2</h1>
          <p className="gsk-subtitle">独立间隔序列实验：f20 偏高时顺延第2名，不使用 98、99、guarded 页面实验。</p>
        </header>

        {loading && <div className="gsk-panel gsk-message">加载 gap-f20-r2 回测中...</div>}
        {error && <div className="gsk-panel gsk-message is-error">{error}（请确认后端和数据库已启动）</div>}
        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="gsk-panel gsk-message">{data.message} 当前数据库共有 {data.historyCount} 期。</div>
        )}

        {!loading && !error && data?.status !== 'insufficient-history' && (
          <>
            <div className="gsk-hero">
              <section className="gsk-panel gsk-current">
                <div className="gsk-label">当前推荐单杀</div>
                <div className="gsk-main">
                  <div className="gsk-big-ball">{prediction?.display || '--'}</div>
                  <div>
                    <h2>{prediction?.strategyName || current?.name || '--'}</h2>
                    <p className="gsk-reason">{prediction?.reason || current?.description || '--'}</p>
                    <div className="gsk-badges">
                      <span className={`gsk-badge ${targetMet ? 'is-ok' : ''}`}>{targetMet ? '近20/50双100%' : '近50仍有失败'}</span>
                      <span className="gsk-badge">数据库 {data?.historyMeta?.count || 0} 期</span>
                      <span className="gsk-badge">最新 {latest ? `${latest.year || ''}-${String(latest.No || '').padStart(3, '0')}` : '--'}</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="gsk-stats">
                <Stat label="近20期" backtest={current?.backtest20} />
                <Stat label="近50期" backtest={current?.backtest50} />
                <Stat label="近100期" backtest={current?.backtest100} />
                <Stat label="近200期" backtest={current?.backtest200} />
              </div>
            </div>

            <div className="gsk-layout">
              <section className="gsk-panel gsk-card">
                <h2>当前前五候选</h2>
                <CandidateList rows={prediction?.topCandidates || []} />
              </section>
              <section className="gsk-panel gsk-card">
                <h2>实验说明</h2>
                <p className="gsk-reason">{current?.description}</p>
                <p className="gsk-reason">{data?.excluded}</p>
              </section>
            </div>

            <BacktestTable rows={current?.backtest20?.rows || []} />
          </>
        )}
      </div>
    </main>
  );
}
