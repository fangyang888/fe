import { useEffect, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

function Ball({ value, failed = false }) {
  return <span className={`egk-ball ${failed ? 'is-failed' : ''}`}>{fmtNum(value)}</span>;
}

function Stat({ label, backtest }) {
  const ok = backtest?.successRate >= 1;
  return (
    <section className={`egk-panel egk-stat ${ok ? 'is-ok' : ''}`}>
      <strong>{fmtPct(backtest?.successRate)}</strong>
      <span>{label} {backtest?.successCount || 0}/{backtest?.count || 0}</span>
    </section>
  );
}

function CandidateList({ rows = [] }) {
  return (
    <div className="egk-candidates">
      {rows.map((row) => (
        <div className="egk-candidate" key={row.number}>
          <Ball value={row.number} />
          <div>
            <strong>第{row.rank}名 · {row.score}</strong>
            <span>近15 {row.f15} · 遗漏 {row.miss} · 间隔 {row.gap}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BacktestTable({ rows = [] }) {
  return (
    <section className="egk-panel egk-section">
      <h2>近20期回测</h2>
      <div className="egk-table-wrap">
        <table className="egk-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>杀码</th>
              <th>结果</th>
              <th>换位</th>
              <th>开奖号码</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.year}-${row.No}-${row.predictedNumber}`}>
                <td>{row.year ? `${row.year}-${String(row.No).padStart(3, '0')}` : row.No}</td>
                <td><Ball value={row.predictedNumber} failed={!row.success} /></td>
                <td><span className={`egk-status ${row.success ? 'is-ok' : 'is-bad'}`}>{row.success ? '成功' : '失败'}</span></td>
                <td>
                  <strong>第{row.selectedRank}名</strong>
                  <p>{row.guard}</p>
                </td>
                <td className="egk-nums">{(row.actualNumbers || []).map(fmtNum).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ExperimentalGuardedKill() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/kill/experimental-guarded', {
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
    <main className="egk-page">
      <style>{`
        .egk-page { min-height: 100vh; padding: 72px 18px 42px; color: #eef6ff; box-sizing: border-box; background: #0f172a; }
        .egk-shell { width: min(1180px, 100%); margin: 0 auto; }
        .egk-head { margin-bottom: 16px; }
        .egk-title { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
        .egk-subtitle { margin: 8px 0 0; color: #a8b8cc; font-size: 14px; line-height: 1.55; }
        .egk-panel { border: 1px solid rgba(148, 163, 184, 0.22); background: rgba(15, 23, 42, 0.78); border-radius: 8px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22); }
        .egk-hero { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr); gap: 14px; margin-bottom: 14px; }
        .egk-current { padding: 18px; border-color: rgba(45, 212, 191, 0.4); }
        .egk-label { color: #5eead4; font-size: 12px; font-weight: 950; margin-bottom: 8px; }
        .egk-main { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .egk-big-ball { display: inline-grid; place-items: center; width: 96px; height: 96px; border-radius: 50%; background: #2dd4bf; color: #042f2e; font-size: 38px; font-weight: 950; }
        .egk-current h2 { margin: 0; font-size: 21px; line-height: 1.25; }
        .egk-reason { margin: 10px 0 0; color: #cbd5e1; font-size: 13px; line-height: 1.55; }
        .egk-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .egk-badge { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.25); color: #dbeafe; background: rgba(255, 255, 255, 0.05); font-size: 12px; font-weight: 850; }
        .egk-badge.is-ok { border-color: rgba(34, 197, 94, 0.45); background: rgba(34, 197, 94, 0.14); color: #86efac; }
        .egk-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .egk-stat { padding: 16px; }
        .egk-stat.is-ok { border-color: rgba(34, 197, 94, 0.36); }
        .egk-stat strong { display: block; font-size: 28px; line-height: 1.1; }
        .egk-stat span { display: block; margin-top: 6px; color: #9fb2c8; font-size: 12px; font-weight: 750; }
        .egk-layout { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 14px; margin-bottom: 14px; }
        .egk-card, .egk-section { padding: 16px; }
        .egk-card h2, .egk-section h2 { margin: 0 0 12px; font-size: 16px; line-height: 1.3; }
        .egk-candidates { display: grid; gap: 10px; }
        .egk-candidate { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.04); }
        .egk-candidate strong, .egk-candidate span { display: block; }
        .egk-candidate span { margin-top: 3px; color: #9fb2c8; font-size: 12px; }
        .egk-ball { display: inline-grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 50%; background: #38bdf8; color: #082f49; font-weight: 950; }
        .egk-ball.is-failed { background: #ef4444; color: #fff; }
        .egk-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .egk-table { width: 100%; min-width: 780px; border-collapse: collapse; font-size: 13px; }
        .egk-table th, .egk-table td { padding: 10px 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.13); text-align: left; vertical-align: top; }
        .egk-table th { color: #93a4ba; font-size: 12px; font-weight: 850; }
        .egk-table p { margin: 4px 0 0; color: #8fa3b5; font-size: 12px; line-height: 1.4; }
        .egk-status { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 850; }
        .egk-status.is-ok { background: rgba(34, 197, 94, 0.16); color: #86efac; }
        .egk-status.is-bad { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
        .egk-nums { color: #dbeafe; white-space: nowrap; }
        .egk-message { padding: 18px; color: #cbd5e1; }
        .egk-message.is-error { color: #fca5a5; }
        @media (max-width: 940px) { .egk-hero, .egk-layout { grid-template-columns: 1fr; } .egk-stats { grid-template-columns: 1fr; } }
      `}</style>

      <div className="egk-shell">
        <header className="egk-head">
          <h1 className="egk-title">候选换位实验单杀</h1>
          <p className="egk-subtitle">基于数据库 history 的新实验方向：遗漏频次排序 + 风险候选顺延。排除 98/99 两页已有方向。</p>
        </header>

        {loading && <div className="egk-panel egk-message">加载候选换位回测中...</div>}
        {error && <div className="egk-panel egk-message is-error">{error}（请确认后端和数据库已启动）</div>}
        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="egk-panel egk-message">{data.message} 当前数据库共有 {data.historyCount} 期。</div>
        )}

        {!loading && !error && data?.status !== 'insufficient-history' && (
          <>
            <div className="egk-hero">
              <section className="egk-panel egk-current">
                <div className="egk-label">当前推荐单杀</div>
                <div className="egk-main">
                  <div className="egk-big-ball">{prediction?.display || '--'}</div>
                  <div>
                    <h2>{prediction?.strategyName || current?.name || '--'}</h2>
                    <p className="egk-reason">{prediction?.reason || current?.description || '--'}</p>
                    <div className="egk-badges">
                      <span className={`egk-badge ${targetMet ? 'is-ok' : ''}`}>{targetMet ? '近20/50双100%' : '当前未完全达标'}</span>
                      <span className="egk-badge">数据库 {data?.historyMeta?.count || 0} 期</span>
                      <span className="egk-badge">最新 {latest ? `${latest.year || ''}-${String(latest.No || '').padStart(3, '0')}` : '--'}</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="egk-stats">
                <Stat label="近20期" backtest={current?.backtest20} />
                <Stat label="近50期" backtest={current?.backtest50} />
                <Stat label="近100期" backtest={current?.backtest100} />
              </div>
            </div>

            <div className="egk-layout">
              <section className="egk-panel egk-card">
                <h2>当前前五候选</h2>
                <CandidateList rows={prediction?.topCandidates || []} />
              </section>
              <section className="egk-panel egk-card">
                <h2>实验说明</h2>
                <p className="egk-reason">{current?.description}</p>
                <p className="egk-reason">{data?.excluded}</p>
              </section>
            </div>

            <BacktestTable rows={current?.backtest20?.rows || []} />
          </>
        )}
      </div>
    </main>
  );
}
