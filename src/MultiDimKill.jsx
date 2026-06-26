import { useEffect, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

function Ball({ value, failed = false }) {
  return <span className={`mdk-ball ${failed ? 'is-failed' : ''}`}>{fmtNum(value)}</span>;
}

function RateBadge({ label, backtest, required }) {
  const ok = (backtest?.successRate || 0) >= required;
  return (
    <span className={`mdk-badge ${ok ? 'is-ok' : 'is-bad'}`}>
      {label} {backtest?.successCount || 0}/{backtest?.count || 0} · {fmtPct(backtest?.successRate)}
    </span>
  );
}

function StrategyCard({ report }) {
  const prediction = report?.prediction;
  return (
    <section className="mdk-panel mdk-strategy">
      <div className="mdk-strategy-head">
        <div>
          <h2>{report?.name || '--'}</h2>
          <p>{report?.description || '--'}</p>
        </div>
        <Ball value={prediction?.number} />
      </div>
      <div className="mdk-badges">
        <RateBadge label="近20期" backtest={report?.backtest20} required={1} />
        <RateBadge label="近50期" backtest={report?.backtest50} required={0.94} />
      </div>
      <p className="mdk-reason">{prediction?.reason || '--'}</p>
      <FailureList rows={report?.backtest50?.failureRows || []} />
    </section>
  );
}

function FailureList({ rows }) {
  if (!rows.length) {
    return <div className="mdk-empty">近50期无失败明细</div>;
  }
  return (
    <div className="mdk-failures">
      <div className="mdk-failure-title">近50失败明细</div>
      {rows.map((row) => (
        <div className="mdk-failure" key={`${row.year}-${row.No}-${row.predictedNumber}`}>
          <span>{row.year ? `${row.year}-${String(row.No).padStart(3, '0')}` : row.No}</span>
          <Ball value={row.predictedNumber} failed />
          <strong>{(row.actualNumbers || []).map(fmtNum).join(', ')}</strong>
        </div>
      ))}
    </div>
  );
}

function BacktestTable({ rows = [], title = '全局优选单杀 · 近20期回测' }) {
  return (
    <section className="mdk-panel mdk-section">
      <h2>{title}</h2>
      <div className="mdk-table-wrap">
        <table className="mdk-table">
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
                <td><span className={`mdk-status ${row.success ? 'is-ok' : 'is-bad'}`}>{row.success ? '成功' : '失败'}</span></td>
                <td className="mdk-nums">{(row.actualNumbers || []).map(fmtNum).join(', ')}</td>
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

export default function MultiDimKill() {
  const [dataType, setDataType] = useState('default');
  const [data, setData] = useState(null);
  const [tailData, setTailData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [multiRes, tailRes] = await Promise.all([
          fetch(`/api/kill/multi-dim?type=${dataType}`, {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch(`/api/kill/tail-ten?type=${dataType}`, {
            cache: 'no-store',
            signal: controller.signal,
          }),
        ]);
        const [multiJson, tailJson] = await Promise.all([multiRes.json(), tailRes.json()]);
        if (!multiRes.ok) throw new Error(multiJson.message || `多维接口返回 ${multiRes.status}`);
        if (!tailRes.ok) throw new Error(tailJson.message || `尾数十位接口返回 ${tailRes.status}`);
        setData(multiJson);
        setTailData(tailJson);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [dataType]);

  const tailReport = tailData?.recommended
    ? {
        key: 'tailTen',
        name: '尾数十位单杀',
        description: tailData.recommended.description || '根据尾数和十位段规律选择下期不会开的号码。',
        prediction: tailData.prediction,
        backtest20: tailData.recommended.backtest20,
        backtest50: tailData.recommended.backtest50,
      }
    : null;
  const globalCandidates = [tailReport, ...(data?.strategies || [])].filter(Boolean);
  const globalBest = globalCandidates
    .slice()
    .sort((a, b) => {
      const a20 = a.backtest20?.successRate || 0;
      const b20 = b.backtest20?.successRate || 0;
      const a50 = a.backtest50?.successRate || 0;
      const b50 = b.backtest50?.successRate || 0;
      return (
        Number(b20 >= 1) - Number(a20 >= 1) ||
        b50 - a50 ||
        b20 - a20 ||
        (b.backtest50?.successCount || 0) - (a.backtest50?.successCount || 0)
      );
    })[0] || data?.currentRecommendation;
  const current = globalBest;
  const prediction = current?.prediction;
  const latest = data?.historyMeta?.latest;
  const targetMet =
    (current?.backtest20?.successRate || 0) >= 1 && (current?.backtest50?.successRate || 0) >= 0.94;

  return (
    <main className="mdk-page">
      <style>{`
        .mdk-page {
          min-height: 100vh;
          padding: 72px 18px 42px;
          box-sizing: border-box;
          color: #eef6ff;
          background:
            radial-gradient(circle at 14% 10%, rgba(14, 165, 233, 0.18), transparent 26%),
            radial-gradient(circle at 88% 12%, rgba(34, 197, 94, 0.15), transparent 24%),
            #111827;
        }
        .mdk-shell { width: min(1180px, 100%); margin: 0 auto; }
        .mdk-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: end;
          margin-bottom: 16px;
        }
        .mdk-title { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
        .mdk-subtitle { margin: 8px 0 0; color: #9fb2c8; font-size: 14px; }
        .mdk-tabs {
          display: inline-flex;
          gap: 8px;
          padding: 6px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.74);
        }
        .mdk-tab {
          height: 34px;
          border: 0;
          border-radius: 7px;
          padding: 0 14px;
          color: #cbd5e1;
          background: transparent;
          font-weight: 850;
          cursor: pointer;
        }
        .mdk-tab.is-active { background: #38bdf8; color: #082f49; }
        .mdk-panel {
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.78);
          border-radius: 8px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
        }
        .mdk-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .mdk-current { padding: 18px; border-color: rgba(56, 189, 248, 0.38); }
        .mdk-label { color: #7dd3fc; font-size: 12px; font-weight: 950; margin-bottom: 8px; }
        .mdk-main {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .mdk-big-ball {
          display: inline-grid;
          place-items: center;
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: #38bdf8;
          color: #082f49;
          font-size: 38px;
          font-weight: 950;
          box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.2), 0 18px 34px rgba(56, 189, 248, 0.28);
        }
        .mdk-current h2 { margin: 0; font-size: 21px; line-height: 1.25; }
        .mdk-reason { margin: 10px 0 0; color: #cbd5e1; font-size: 13px; line-height: 1.55; }
        .mdk-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .mdk-badge {
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
        .mdk-badge.is-ok { border-color: rgba(34, 197, 94, 0.45); background: rgba(34, 197, 94, 0.14); color: #86efac; }
        .mdk-badge.is-bad { border-color: rgba(248, 113, 113, 0.45); background: rgba(248, 113, 113, 0.14); color: #fca5a5; }
        .mdk-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .mdk-stat { padding: 16px; }
        .mdk-stat strong { display: block; font-size: 28px; line-height: 1.1; }
        .mdk-stat span { display: block; margin-top: 6px; color: #9fb2c8; font-size: 12px; font-weight: 750; }
        .mdk-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
        .mdk-strategy { padding: 16px; }
        .mdk-strategy-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
        .mdk-strategy h2, .mdk-section h2 { margin: 0 0 8px; font-size: 16px; line-height: 1.3; }
        .mdk-strategy p { margin: 0; color: #9fb2c8; font-size: 13px; line-height: 1.45; }
        .mdk-ball {
          display: inline-grid;
          place-items: center;
          flex: none;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #22c55e;
          color: #052e16;
          font-weight: 950;
        }
        .mdk-ball.is-failed { background: #ef4444; color: #fff; }
        .mdk-failures { margin-top: 12px; display: grid; gap: 8px; }
        .mdk-failure-title, .mdk-empty { color: #8fa3b5; font-size: 12px; font-weight: 850; }
        .mdk-failure {
          display: grid;
          grid-template-columns: 80px 38px minmax(0, 1fr);
          gap: 8px;
          align-items: center;
          color: #cbd5e1;
          font-size: 12px;
        }
        .mdk-failure strong { font-weight: 700; color: #e2e8f0; }
        .mdk-section { padding: 16px; margin-bottom: 14px; }
        .mdk-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .mdk-table { width: 100%; min-width: 780px; border-collapse: collapse; font-size: 13px; }
        .mdk-table th, .mdk-table td {
          padding: 10px 8px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.13);
          text-align: left;
          vertical-align: top;
        }
        .mdk-table th { color: #93a4ba; font-size: 12px; font-weight: 850; }
        .mdk-table p { margin: 4px 0 0; color: #8fa3b5; font-size: 12px; line-height: 1.4; }
        .mdk-status {
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 9px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 850;
        }
        .mdk-status.is-ok { background: rgba(34, 197, 94, 0.16); color: #86efac; }
        .mdk-status.is-bad { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
        .mdk-nums { color: #dbeafe; white-space: nowrap; }
        .mdk-message { padding: 18px; color: #cbd5e1; }
        .mdk-message.is-error { color: #fca5a5; }
        @media (max-width: 900px) {
          .mdk-head, .mdk-hero, .mdk-grid { grid-template-columns: 1fr; }
          .mdk-stats { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 901px) and (max-width: 1180px) {
          .mdk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>

      <div className="mdk-shell">
        <header className="mdk-head">
          <div>
            <h1 className="mdk-title">全局优选单杀</h1>
            <p className="mdk-subtitle">尾数十位、和值、奇偶大小、遗漏周期统一回测，优先展示近20期100%且近50期最高的单杀。</p>
          </div>
          <div className="mdk-tabs" role="tablist" aria-label="数据源">
            <button className={`mdk-tab ${dataType === 'default' ? 'is-active' : ''}`} type="button" onClick={() => setDataType('default')}>默认数据</button>
            <button className={`mdk-tab ${dataType === 'hk' ? 'is-active' : ''}`} type="button" onClick={() => setDataType('hk')}>香港数据</button>
          </div>
        </header>

        {loading && <div className="mdk-panel mdk-message">加载多维回测中...</div>}
        {error && <div className="mdk-panel mdk-message is-error">{error}（请确认后端和数据库已启动）</div>}
        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="mdk-panel mdk-message">{data.message} 当前数据库共有 {data.historyCount} 期。</div>
        )}

        {!loading && !error && data?.status !== 'insufficient-history' && (
          <>
            <div className="mdk-hero">
              <section className="mdk-panel mdk-current">
                <div className="mdk-label">全局优选单杀</div>
                <div className="mdk-main">
                  <div className="mdk-big-ball">{prediction?.display || '--'}</div>
                  <div>
                    <h2>{current?.name || prediction?.strategyName || '--'}</h2>
                    <p className="mdk-reason">
                      {current?.key === 'tailTen'
                        ? '当前优先采用「尾数十位单杀」：近20期100%，近50期98%。'
                        : prediction?.reason || current?.description || '--'}
                    </p>
                    <div className="mdk-badges">
                      <span className={`mdk-badge ${targetMet ? 'is-ok' : 'is-bad'}`}>{targetMet ? '目标已达成' : '当前未完全达标'}</span>
                      <span className="mdk-badge">数据库 {data?.historyMeta?.count || 0} 期</span>
                      <span className="mdk-badge">最新 {latest ? `${latest.year || ''}-${String(latest.No || '').padStart(3, '0')}` : '--'}</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="mdk-stats">
                <section className="mdk-panel mdk-stat">
                  <strong>{fmtPct(current?.backtest20?.successRate)}</strong>
                  <span>全局近20期 {current?.backtest20?.successCount || 0}/{current?.backtest20?.count || 0}</span>
                </section>
                <section className="mdk-panel mdk-stat">
                  <strong>{fmtPct(current?.backtest50?.successRate)}</strong>
                  <span>全局近50期 {current?.backtest50?.successCount || 0}/{current?.backtest50?.count || 0}</span>
                </section>
                <section className="mdk-panel mdk-stat">
                  <strong>{current?.name || prediction?.metrics?.selectedDirection || '--'}</strong>
                  <span>当前采用方向</span>
                </section>
                <section className="mdk-panel mdk-stat">
                  <strong>{data?.status || '--'}</strong>
                  <span>接口状态</span>
                </section>
              </div>
            </div>

            <div className="mdk-grid">
              {tailReport && <StrategyCard report={tailReport} />}
              {(data?.strategies || []).map((report) => <StrategyCard key={report.key} report={report} />)}
            </div>

            <BacktestTable rows={current?.backtest20?.rows || []} />
          </>
        )}
      </div>
    </main>
  );
}
