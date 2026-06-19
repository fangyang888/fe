import { useMemo, useState } from 'react';

const DEFAULT_A = 'HC3';
const DEFAULT_B = 'L15';

function fmtPercent(value) {
  if (!Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function splitNums(text) {
  if (!text) return [];
  return String(text).split(/\s+/).filter(Boolean);
}

function NumBall({ value, failed = false }) {
  return (
    <span className={`combo-num ${failed ? 'is-failed' : ''}`}>
      {String(value).padStart(2, '0')}
    </span>
  );
}

export default function KillComboBacktest() {
  const [count, setCount] = useState(20);
  const [a, setA] = useState(DEFAULT_A);
  const [b, setB] = useState(DEFAULT_B);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const best = data?.topCombos?.[0] || null;
  const latest = data?.db?.latest;
  const bestPair = best?.pair?.join(' + ') || '--';
  const currentPair = data?.current?.pair?.join(' + ') || `${a.toUpperCase()} + ${b.toUpperCase()}`;

  const bestRows = useMemo(() => data?.bestRows || [], [data]);

  async function runBacktest() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        count: String(count),
        a: a.trim().toUpperCase(),
        b: b.trim().toUpperCase(),
      });
      const response = await fetch(`/api/kill-combo/search?${params.toString()}`);
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || '回测失败');
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="combo-page">
      <style>{`
        .combo-page {
          min-height: 100vh;
          padding: 72px 18px 42px;
          color: #eef6ff;
          background:
            radial-gradient(circle at 20% 12%, rgba(34, 197, 94, 0.18), transparent 28%),
            radial-gradient(circle at 84% 8%, rgba(245, 158, 11, 0.16), transparent 26%),
            #0b1120;
          box-sizing: border-box;
        }
        .combo-shell {
          width: min(1160px, 100%);
          margin: 0 auto;
        }
        .combo-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 18px;
          align-items: end;
          margin-bottom: 18px;
        }
        .combo-title {
          margin: 0;
          font-size: 30px;
          line-height: 1.15;
          letter-spacing: 0;
        }
        .combo-subtitle {
          margin: 8px 0 0;
          color: #9fb2c8;
          font-size: 14px;
        }
        .combo-panel {
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.78);
          border-radius: 8px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
        }
        .combo-controls {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .combo-field {
          display: grid;
          gap: 6px;
        }
        .combo-label {
          color: #9fb2c8;
          font-size: 12px;
          font-weight: 700;
        }
        .combo-input {
          height: 40px;
          border-radius: 7px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(2, 6, 23, 0.6);
          color: #f8fafc;
          padding: 0 12px;
          font-size: 14px;
          box-sizing: border-box;
        }
        .combo-button {
          align-self: end;
          height: 40px;
          border: 0;
          border-radius: 7px;
          background: #22c55e;
          color: #052e16;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
        }
        .combo-button:disabled {
          cursor: wait;
          opacity: 0.62;
        }
        .combo-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 16px;
        }
        .combo-stat {
          padding: 16px;
        }
        .combo-stat-value {
          font-size: 26px;
          font-weight: 850;
          line-height: 1.15;
        }
        .combo-stat-label {
          margin-top: 6px;
          color: #9fb2c8;
          font-size: 12px;
        }
        .combo-section {
          padding: 16px;
          margin-bottom: 16px;
        }
        .combo-section-title {
          margin: 0 0 12px;
          font-size: 16px;
          line-height: 1.3;
        }
        .combo-table-wrap {
          overflow-x: auto;
        }
        .combo-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
          font-size: 13px;
        }
        .combo-table th,
        .combo-table td {
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
          padding: 10px 8px;
          text-align: left;
          vertical-align: top;
        }
        .combo-table th {
          color: #9fb2c8;
          font-size: 12px;
          font-weight: 800;
        }
        .combo-num-list {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .combo-num {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(34, 197, 94, 0.14);
          border: 1px solid rgba(34, 197, 94, 0.42);
          color: #bbf7d0;
          font-size: 12px;
          font-weight: 800;
        }
        .combo-num.is-failed {
          background: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.5);
          color: #fecaca;
        }
        .combo-badge {
          display: inline-flex;
          align-items: center;
          height: 26px;
          border-radius: 999px;
          padding: 0 9px;
          background: rgba(34, 197, 94, 0.12);
          color: #86efac;
          font-size: 12px;
          font-weight: 800;
        }
        .combo-badge.is-bad {
          background: rgba(239, 68, 68, 0.13);
          color: #fca5a5;
        }
        .combo-error {
          border: 1px solid rgba(239, 68, 68, 0.38);
          background: rgba(127, 29, 29, 0.32);
          color: #fecaca;
          padding: 12px 14px;
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .combo-empty {
          color: #9fb2c8;
          padding: 18px;
          text-align: center;
        }
        @media (max-width: 820px) {
          .combo-head,
          .combo-controls,
          .combo-grid {
            grid-template-columns: 1fr;
          }
          .combo-title {
            font-size: 24px;
          }
        }
      `}</style>

      <div className="combo-shell">
        <header className="combo-head">
          <div>
            <h1 className="combo-title">6杀组合回测</h1>
            <p className="combo-subtitle">
              原4杀 + 两个候选点位，搜索 HC / L / S 三组来源里近 {count} 期最稳组合。
            </p>
          </div>
        </header>

        <section className="combo-panel combo-controls">
          <label className="combo-field">
            <span className="combo-label">回测期数</span>
            <input
              className="combo-input"
              type="number"
              min="5"
              max="80"
              value={count}
              onChange={(event) => setCount(Number(event.target.value) || 20)}
            />
          </label>
          <label className="combo-field">
            <span className="combo-label">对比点位 A</span>
            <input className="combo-input" value={a} onChange={(event) => setA(event.target.value)} />
          </label>
          <label className="combo-field">
            <span className="combo-label">对比点位 B</span>
            <input className="combo-input" value={b} onChange={(event) => setB(event.target.value)} />
          </label>
          <button className="combo-button" type="button" onClick={runBacktest} disabled={loading}>
            {loading ? '回测中...' : '开始回测'}
          </button>
        </section>

        {error && <div className="combo-error">{error}</div>}

        {data ? (
          <>
            <section className="combo-grid">
              <div className="combo-panel combo-stat">
                <div className="combo-stat-value">{bestPair}</div>
                <div className="combo-stat-label">最佳组合</div>
              </div>
              <div className="combo-panel combo-stat">
                <div className="combo-stat-value">{best?.ok ?? '--'}/{count}</div>
                <div className="combo-stat-label">最佳全中期数</div>
              </div>
              <div className="combo-panel combo-stat">
                <div className="combo-stat-value">{data.base4?.ok ?? '--'}/{count}</div>
                <div className="combo-stat-label">原4杀全中</div>
              </div>
              <div className="combo-panel combo-stat">
                <div className="combo-stat-value">{latest ? `${latest.year}-${latest.No}` : '--'}</div>
                <div className="combo-stat-label">数据库最新期</div>
              </div>
            </section>

            <section className="combo-panel combo-section">
              <h2 className="combo-section-title">当前对比：{currentPair}</h2>
              <div className="combo-table-wrap">
                <table className="combo-table">
                  <thead>
                    <tr>
                      <th>组合</th>
                      <th>全中</th>
                      <th>全中率</th>
                      <th>重复期数</th>
                      <th>错期</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{currentPair}</td>
                      <td>{data.current?.ok ?? '--'}/{count}</td>
                      <td>{fmtPercent(data.current?.rate)}</td>
                      <td>{data.current?.dup ?? '--'}</td>
                      <td>
                        {(data.current?.missRows || []).map((row) => row.period).join('、') || '无'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="combo-panel combo-section">
              <h2 className="combo-section-title">组合排行</h2>
              <div className="combo-table-wrap">
                <table className="combo-table">
                  <thead>
                    <tr>
                      <th>排名</th>
                      <th>点位</th>
                      <th>全中</th>
                      <th>全中率</th>
                      <th>重复期数</th>
                      <th>平均唯一号码</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.topCombos || []).map((item, index) => (
                      <tr key={`${item.pair.join('-')}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{item.pair.join(' + ')}</td>
                        <td>{item.ok}/{count}</td>
                        <td>{fmtPercent(item.rate)}</td>
                        <td>{item.dup}</td>
                        <td>{item.avgUnique}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="combo-panel combo-section">
              <h2 className="combo-section-title">最佳组合每期明细</h2>
              <div className="combo-table-wrap">
                <table className="combo-table">
                  <thead>
                    <tr>
                      <th>期号</th>
                      <th>状态</th>
                      <th>6杀号码</th>
                      <th>误杀</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestRows.map((row) => {
                      const failed = splitNums(row.failed);
                      return (
                        <tr key={row.period}>
                          <td>{row.period}</td>
                          <td>
                            <span className={`combo-badge ${row.result === '全中' ? '' : 'is-bad'}`}>
                              {row.result}
                            </span>
                          </td>
                          <td>
                            <div className="combo-num-list">
                              {splitNums(row.nums).map((num) => (
                                <NumBall key={`${row.period}-${num}`} value={num} failed={failed.includes(num)} />
                              ))}
                            </div>
                          </td>
                          <td>{row.failed || '--'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <div className="combo-panel combo-empty">
            点“开始回测”后会完整运行三组候选点位搜索；智能7码计算较重，等待几分钟是正常的。
          </div>
        )}
      </div>
    </div>
  );
}
