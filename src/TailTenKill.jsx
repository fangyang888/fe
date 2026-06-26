import { useEffect, useMemo, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

function NumBall({ value, failed = false }) {
  return (
    <span className={`ttk-ball ${failed ? 'is-failed' : ''}`}>
      {fmtNum(value)}
    </span>
  );
}

function BacktestTable({ rows = [], title }) {
  return (
    <section className="ttk-panel ttk-section">
      <h2 className="ttk-section-title">{title}</h2>
      <div className="ttk-table-wrap">
        <table className="ttk-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>杀码</th>
              <th>状态</th>
              <th>开奖号码</th>
              <th>策略</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.year || ''}-${row.No || index}-${row.predictedNumber}`}>
                <td>{row.year ? `${row.year}-${String(row.No).padStart(3, '0')}` : row.No || '--'}</td>
                <td>
                  <NumBall value={row.predictedNumber} failed={!row.success} />
                </td>
                <td>
                  <span className={`ttk-status ${row.success ? 'is-ok' : 'is-bad'}`}>
                    {row.success ? '成功' : '失败'}
                  </span>
                </td>
                <td className="ttk-nums">{(row.actualNumbers || []).map(fmtNum).join(', ')}</td>
                <td>
                  <div className="ttk-strategy-name">{row.strategyName || '--'}</div>
                  <div className="ttk-row-reason">{row.reason || ''}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function TailTenKill() {
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
        const res = await fetch(`/api/kill/tail-ten?type=${dataType}`, {
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

  const prediction = data?.prediction;
  const recommended = data?.recommended;
  const latest = data?.historyMeta?.latest;
  const targetMet = data?.status === 'target-met';
  const topCandidates = useMemo(() => prediction?.topCandidates || [], [prediction]);

  return (
    <main className="ttk-page">
      <style>{`
        .ttk-page {
          min-height: 100vh;
          padding: 72px 18px 42px;
          color: #eef6ff;
          background:
            radial-gradient(circle at 18% 10%, rgba(20, 184, 166, 0.18), transparent 26%),
            radial-gradient(circle at 86% 12%, rgba(248, 113, 113, 0.16), transparent 24%),
            #10131f;
          box-sizing: border-box;
        }
        .ttk-shell {
          width: min(1120px, 100%);
          margin: 0 auto;
        }
        .ttk-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: end;
          margin-bottom: 16px;
        }
        .ttk-title {
          margin: 0;
          font-size: 30px;
          line-height: 1.15;
          letter-spacing: 0;
        }
        .ttk-subtitle {
          margin: 8px 0 0;
          color: #9fb2c8;
          font-size: 14px;
        }
        .ttk-tabs {
          display: inline-flex;
          gap: 8px;
          padding: 6px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.74);
        }
        .ttk-tab {
          height: 34px;
          border: 0;
          border-radius: 7px;
          padding: 0 14px;
          color: #cbd5e1;
          background: transparent;
          font-weight: 800;
          cursor: pointer;
        }
        .ttk-tab.is-active {
          background: #2dd4bf;
          color: #042f2e;
        }
        .ttk-panel {
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.78);
          border-radius: 8px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
        }
        .ttk-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .ttk-prediction {
          padding: 18px;
        }
        .ttk-label {
          color: #9fb2c8;
          font-size: 12px;
          font-weight: 850;
          margin-bottom: 8px;
        }
        .ttk-main-number {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .ttk-big-ball {
          display: inline-grid;
          place-items: center;
          width: 92px;
          height: 92px;
          border-radius: 50%;
          background: #f97316;
          color: #fff7ed;
          font-size: 36px;
          font-weight: 950;
          box-shadow: 0 0 0 4px rgba(251, 146, 60, 0.22), 0 18px 34px rgba(249, 115, 22, 0.34);
        }
        .ttk-name {
          margin: 0;
          font-size: 20px;
          line-height: 1.25;
        }
        .ttk-reason {
          margin: 8px 0 0;
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.55;
        }
        .ttk-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .ttk-badge {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(255, 255, 255, 0.05);
          color: #dbeafe;
          font-size: 12px;
          font-weight: 850;
        }
        .ttk-badge.is-ok {
          border-color: rgba(45, 212, 191, 0.45);
          background: rgba(45, 212, 191, 0.14);
          color: #5eead4;
        }
        .ttk-badge.is-bad {
          border-color: rgba(248, 113, 113, 0.45);
          background: rgba(248, 113, 113, 0.14);
          color: #fca5a5;
        }
        .ttk-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .ttk-stat {
          padding: 16px;
        }
        .ttk-stat strong {
          display: block;
          font-size: 28px;
          line-height: 1.1;
        }
        .ttk-stat span {
          display: block;
          margin-top: 6px;
          color: #9fb2c8;
          font-size: 12px;
          font-weight: 750;
        }
        .ttk-section {
          padding: 16px;
          margin-bottom: 14px;
        }
        .ttk-section-title {
          margin: 0 0 12px;
          font-size: 16px;
          line-height: 1.3;
        }
        .ttk-candidates {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }
        .ttk-candidate {
          padding: 12px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(2, 6, 23, 0.32);
        }
        .ttk-candidate-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .ttk-score {
          color: #facc15;
          font-size: 12px;
          font-weight: 850;
        }
        .ttk-mini {
          color: #9fb2c8;
          font-size: 12px;
          line-height: 1.45;
        }
        .ttk-ball {
          display: inline-grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #14b8a6;
          color: #042f2e;
          font-weight: 950;
        }
        .ttk-ball.is-failed {
          background: #ef4444;
          color: #fff;
        }
        .ttk-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .ttk-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
          font-size: 13px;
        }
        .ttk-table th,
        .ttk-table td {
          padding: 10px 8px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.13);
          text-align: left;
          vertical-align: top;
        }
        .ttk-table th {
          color: #93a4ba;
          font-size: 12px;
          font-weight: 850;
        }
        .ttk-status {
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 9px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 850;
        }
        .ttk-status.is-ok {
          background: rgba(34, 197, 94, 0.16);
          color: #86efac;
        }
        .ttk-status.is-bad {
          background: rgba(239, 68, 68, 0.16);
          color: #fca5a5;
        }
        .ttk-nums {
          color: #dbeafe;
          white-space: nowrap;
        }
        .ttk-strategy-name {
          color: #f8fafc;
          font-weight: 800;
        }
        .ttk-row-reason {
          margin-top: 4px;
          color: #8fa3b5;
          font-size: 12px;
          line-height: 1.4;
        }
        .ttk-message {
          padding: 18px;
          color: #cbd5e1;
        }
        .ttk-message.is-error {
          color: #fca5a5;
        }
        @media (max-width: 820px) {
          .ttk-head,
          .ttk-hero {
            grid-template-columns: 1fr;
          }
          .ttk-stats,
          .ttk-candidates {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      <div className="ttk-shell">
        <header className="ttk-head">
          <div>
            <h1 className="ttk-title">尾数 + 十位单杀</h1>
            <p className="ttk-subtitle">
              根据数据库历史记录，组合尾数与十位段规律，预测下期不会出现的 1 个号码。
            </p>
          </div>
          <div className="ttk-tabs" role="tablist" aria-label="数据源">
            <button
              className={`ttk-tab ${dataType === 'default' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setDataType('default')}
            >
              默认数据
            </button>
            <button
              className={`ttk-tab ${dataType === 'hk' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setDataType('hk')}
            >
              香港数据
            </button>
          </div>
        </header>

        {loading && <div className="ttk-panel ttk-message">加载数据库回测中...</div>}
        {error && <div className="ttk-panel ttk-message is-error">{error}（请确认后端和数据库已启动）</div>}

        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="ttk-panel ttk-message">
            {data.message} 当前数据库共有 {data.historyCount} 期。
          </div>
        )}

        {!loading && !error && data?.status !== 'insufficient-history' && (
          <>
            <div className="ttk-hero">
              <section className="ttk-panel ttk-prediction">
                <div className="ttk-label">下期推荐单杀</div>
                <div className="ttk-main-number">
                  <div className="ttk-big-ball">{prediction?.display || '--'}</div>
                  <div>
                    <h2 className="ttk-name">{recommended?.name || prediction?.strategyName || '--'}</h2>
                    <p className="ttk-reason">{prediction?.reason || recommended?.description || '--'}</p>
                    <div className="ttk-badges">
                      <span className={`ttk-badge ${targetMet ? 'is-ok' : 'is-bad'}`}>
                        {targetMet ? '目标已达成' : '当前未完全达标'}
                      </span>
                      <span className="ttk-badge">数据库 {data?.historyMeta?.count || 0} 期</span>
                      <span className="ttk-badge">
                        最新 {latest ? `${latest.year || ''}-${String(latest.No || '').padStart(3, '0')}` : '--'}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="ttk-stats">
                <section className="ttk-panel ttk-stat">
                  <strong>{fmtPct(recommended?.backtest20?.successRate)}</strong>
                  <span>
                    近20期 {recommended?.backtest20?.successCount || 0}/{recommended?.backtest20?.count || 0}
                  </span>
                </section>
                <section className="ttk-panel ttk-stat">
                  <strong>{fmtPct(recommended?.backtest50?.successRate)}</strong>
                  <span>
                    近50期 {recommended?.backtest50?.successCount || 0}/{recommended?.backtest50?.count || 0}
                  </span>
                </section>
                <section className="ttk-panel ttk-stat">
                  <strong>尾{prediction?.tail ?? '--'}</strong>
                  <span>推荐号码尾数</span>
                </section>
                <section className="ttk-panel ttk-stat">
                  <strong>十{prediction?.ten ?? '--'}</strong>
                  <span>推荐号码十位段</span>
                </section>
              </div>
            </div>

            <section className="ttk-panel ttk-section">
              <h2 className="ttk-section-title">候选评分 Top 10</h2>
              <div className="ttk-candidates">
                {topCandidates.map((item) => (
                  <div className="ttk-candidate" key={item.number}>
                    <div className="ttk-candidate-head">
                      <NumBall value={item.number} />
                      <span className="ttk-score">{item.score}</span>
                    </div>
                    <div className="ttk-mini">
                      尾{item.tail} / 十{item.ten}
                      <br />
                      尾近窗 {item.tailShortCount} 次，遗漏 {item.tailMiss}
                      <br />
                      号码遗漏 {item.numMiss}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <BacktestTable rows={recommended?.backtest20?.rows || []} title="近20期真实滚动回测" />
            <BacktestTable rows={recommended?.backtest50?.failureRows || []} title="近50期失败明细" />
          </>
        )}
      </div>
    </main>
  );
}
