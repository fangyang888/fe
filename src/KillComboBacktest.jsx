import { useEffect, useMemo, useState } from 'react';

const DEFAULT_A = 'HC1';
const DEFAULT_B = 'S2';
const MIN_CONFIDENCE_RATE = 0.85;

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

function DetailList({ items = [] }) {
  return (
    <div className="combo-detail-list">
      {items.map((item) => (
        <span className="combo-chip" key={`${item.key}-${item.value ?? 'empty'}`}>
          <span>{item.label || item.key}</span>
          <strong>{item.value || '--'}</strong>
        </span>
      ))}
    </div>
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
  const currentRate = data?.current?.rate;
  const isLowConfidence = Number.isFinite(currentRate) && currentRate < MIN_CONFIDENCE_RATE;

  const bestRows = useMemo(() => data?.bestRows || [], [data]);
  const currentRows = useMemo(() => data?.current?.rows || [], [data]);
  const fallbackRows = useMemo(() => data?.fallbackTri?.rows || [], [data]);
  const bestNext = data?.nextPrediction?.best;
  const currentNext = data?.nextPrediction?.current;
  const fallbackNext = data?.nextPrediction?.fallbackTri;
  const fallbackPair = data?.fallbackTri?.keys?.join(' + ') || 'HC1 + L15 + S2';

  useEffect(() => {
    runBacktest({ a: DEFAULT_A, b: DEFAULT_B });
  }, []);

  async function runBacktest(nextValues = {}) {
    const nextA = (nextValues.a ?? a).trim().toUpperCase();
    const nextB = (nextValues.b ?? b).trim().toUpperCase();
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        count: String(count),
        a: nextA,
        b: nextB,
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

  function repredictCombo() {
    const [nextA, nextB] = best?.pair || [];
    if (!nextA || !nextB) return;
    setA(nextA);
    setB(nextB);
    runBacktest({ a: nextA, b: nextB });
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
        .combo-button.is-secondary {
          background: #f59e0b;
          color: #451a03;
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
        .combo-next-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr);
          gap: 14px;
          align-items: start;
        }
        .combo-next-block {
          display: grid;
          gap: 8px;
        }
        .combo-next-label {
          color: #9fb2c8;
          font-size: 12px;
          font-weight: 800;
        }
        .combo-table-wrap {
          overflow-x: auto;
        }
        .combo-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1080px;
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
        .combo-detail-list {
          display: grid;
          gap: 5px;
        }
        .combo-chip {
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 132px;
          min-height: 24px;
          padding: 2px 8px;
          border-radius: 7px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.62);
          color: #9fb2c8;
          box-sizing: border-box;
        }
        .combo-chip strong {
          color: #e2e8f0;
          font-size: 12px;
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
        .combo-warning {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          border: 1px solid rgba(245, 158, 11, 0.42);
          background: rgba(120, 53, 15, 0.28);
          color: #fde68a;
          padding: 14px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .combo-warning-title {
          font-weight: 850;
          margin-bottom: 4px;
        }
        .combo-warning-text {
          color: #fed7aa;
          font-size: 13px;
        }
        .combo-empty {
          color: #9fb2c8;
          padding: 18px;
          text-align: center;
        }
        @media (max-width: 820px) {
          .combo-head,
          .combo-controls,
          .combo-grid,
          .combo-warning,
          .combo-next-grid {
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
            {isLowConfidence && (
              <section className="combo-warning">
                <div>
                  <div className="combo-warning-title">当前组合低于 85% 预警</div>
                  <div className="combo-warning-text">
                    当前 {currentPair} 是 {data.current?.ok ?? '--'}/{count}（{fmtPercent(currentRate)}），低于最低线 {fmtPercent(MIN_CONFIDENCE_RATE)}；建议切换到当前排行最优组合 {bestPair}。
                  </div>
                </div>
                <button
                  className="combo-button is-secondary"
                  type="button"
                  onClick={repredictCombo}
                  disabled={loading || !best?.pair?.length}
                >
                  {loading ? '重新预测中...' : '重新预测组合'}
                </button>
              </section>
            )}

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

            {data.fallbackTri && (
              <section className="combo-grid">
                <div className="combo-panel combo-stat">
                  <div className="combo-stat-value">{fallbackPair}</div>
                  <div className="combo-stat-label">L15 兜底备案</div>
                </div>
                <div className="combo-panel combo-stat">
                  <div className="combo-stat-value">{data.fallbackTri.ok ?? '--'}/{count}</div>
                  <div className="combo-stat-label">备案全中期数</div>
                </div>
                <div className="combo-panel combo-stat">
                  <div className="combo-stat-value">{fmtPercent(data.fallbackTri.rate)}</div>
                  <div className="combo-stat-label">备案全中率</div>
                </div>
                <div className="combo-panel combo-stat">
                  <div className="combo-stat-value">{data.fallbackTri.avgUnique ?? '--'}</div>
                  <div className="combo-stat-label">平均唯一号码</div>
                </div>
              </section>
            )}

            {bestNext && (
              <section className="combo-panel combo-section">
                <h2 className="combo-section-title">最佳组合下一期预测：{bestNext.pair?.join(' + ')}</h2>
                <div className="combo-next-grid">
                  <div className="combo-next-block">
                    <div className="combo-next-label">预测期号</div>
                    <div className="combo-stat-value">{bestNext.period || '--'}</div>
                  </div>
                  <div className="combo-next-block">
                    <div className="combo-next-label">原4杀</div>
                    <DetailList items={bestNext.baseDetails} />
                  </div>
                  <div className="combo-next-block">
                    <div className="combo-next-label">最佳补位 + 最终6杀</div>
                    <DetailList items={bestNext.extraDetails} />
                    <div className="combo-num-list">
                      {splitNums(bestNext.nums).map((num) => (
                        <NumBall key={`best-next-${num}`} value={num} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {currentNext && currentPair !== bestPair && (
              <section className="combo-panel combo-section">
                <h2 className="combo-section-title">当前组合下一期预测：{currentNext.pair?.join(' + ')}</h2>
                <div className="combo-next-grid">
                  <div className="combo-next-block">
                    <div className="combo-next-label">预测期号</div>
                    <div className="combo-stat-value">{currentNext.period || '--'}</div>
                  </div>
                  <div className="combo-next-block">
                    <div className="combo-next-label">原4杀</div>
                    <DetailList items={currentNext.baseDetails} />
                  </div>
                  <div className="combo-next-block">
                    <div className="combo-next-label">当前补位 + 最终6杀</div>
                    <DetailList items={currentNext.extraDetails} />
                    <div className="combo-num-list">
                      {splitNums(currentNext.nums).map((num) => (
                        <NumBall key={`current-next-${num}`} value={num} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {fallbackNext && (
              <section className="combo-panel combo-section">
                <h2 className="combo-section-title">L15 兜底备案下一期预测：{fallbackNext.pair?.join(' + ')}</h2>
                <div className="combo-next-grid">
                  <div className="combo-next-block">
                    <div className="combo-next-label">预测期号</div>
                    <div className="combo-stat-value">{fallbackNext.period || '--'}</div>
                  </div>
                  <div className="combo-next-block">
                    <div className="combo-next-label">原4杀</div>
                    <DetailList items={fallbackNext.baseDetails} />
                  </div>
                  <div className="combo-next-block">
                    <div className="combo-next-label">备案补位 + 最终7杀</div>
                    <DetailList items={fallbackNext.extraDetails} />
                    <div className="combo-num-list">
                      {splitNums(fallbackNext.nums).map((num) => (
                        <NumBall key={`fallback-next-${num}`} value={num} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

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

            {data.fallbackTri && (
              <section className="combo-panel combo-section">
                <h2 className="combo-section-title">L15 兜底备案回测：{fallbackPair}</h2>
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
                        <td>{fallbackPair}</td>
                        <td>{data.fallbackTri.ok ?? '--'}/{count}</td>
                        <td>{fmtPercent(data.fallbackTri.rate)}</td>
                        <td>{data.fallbackTri.dup ?? '--'}</td>
                        <td>
                          {(data.fallbackTri.missRows || []).map((row) => `${row.period}(${row.failed})`).join('、') || '无'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {fallbackRows.length > 0 && (
              <section className="combo-panel combo-section">
                <h2 className="combo-section-title">L15 兜底备案每期明细：{fallbackPair}</h2>
                <div className="combo-table-wrap">
                  <table className="combo-table">
                    <thead>
                      <tr>
                        <th>期号</th>
                        <th>状态</th>
                        <th>开奖号码</th>
                        <th>原4杀</th>
                        <th>备案补位</th>
                        <th>7杀号码</th>
                        <th>误杀</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fallbackRows.map((row) => {
                        const failed = splitNums(row.failed);
                        return (
                          <tr key={`fallback-${row.period}`}>
                            <td>{row.period}</td>
                            <td>
                              <span className={`combo-badge ${row.result === '全中' ? '' : 'is-bad'}`}>
                                {row.result}
                              </span>
                            </td>
                            <td>
                              <div className="combo-num-list">
                                {splitNums(row.actual).map((num) => (
                                  <NumBall key={`fallback-${row.period}-actual-${num}`} value={num} />
                                ))}
                              </div>
                            </td>
                            <td><DetailList items={row.baseDetails} /></td>
                            <td><DetailList items={row.extraDetails} /></td>
                            <td>
                              <div className="combo-num-list">
                                {splitNums(row.nums).map((num) => (
                                  <NumBall key={`fallback-${row.period}-${num}`} value={num} failed={failed.includes(num)} />
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
            )}

            <section className="combo-panel combo-section">
              <h2 className="combo-section-title">当前组合每期明细：{currentPair}</h2>
              <div className="combo-table-wrap">
                <table className="combo-table">
                  <thead>
                    <tr>
                      <th>期号</th>
                      <th>状态</th>
                      <th>开奖号码</th>
                      <th>原4杀</th>
                      <th>补位算法</th>
                      <th>6杀号码</th>
                      <th>误杀</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.map((row) => {
                      const failed = splitNums(row.failed);
                      return (
                        <tr key={`current-${row.period}`}>
                          <td>{row.period}</td>
                          <td>
                            <span className={`combo-badge ${row.result === '全中' ? '' : 'is-bad'}`}>
                              {row.result}
                            </span>
                          </td>
                          <td>
                            <div className="combo-num-list">
                              {splitNums(row.actual).map((num) => (
                                <NumBall key={`current-${row.period}-actual-${num}`} value={num} />
                              ))}
                            </div>
                          </td>
                          <td><DetailList items={row.baseDetails} /></td>
                          <td><DetailList items={row.extraDetails} /></td>
                          <td>
                            <div className="combo-num-list">
                              {splitNums(row.nums).map((num) => (
                                <NumBall key={`current-${row.period}-${num}`} value={num} failed={failed.includes(num)} />
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

            <section className="combo-panel combo-section">
              <h2 className="combo-section-title">最佳组合每期明细：{bestPair}</h2>
              <div className="combo-table-wrap">
                <table className="combo-table">
                  <thead>
                    <tr>
                      <th>期号</th>
                      <th>状态</th>
                      <th>开奖号码</th>
                      <th>原4杀</th>
                      <th>补位算法</th>
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
                              {splitNums(row.actual).map((num) => (
                                <NumBall key={`${row.period}-actual-${num}`} value={num} />
                              ))}
                            </div>
                          </td>
                          <td><DetailList items={row.baseDetails} /></td>
                          <td><DetailList items={row.extraDetails} /></td>
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
            {loading ? '正在自动回测 HC1 + S2，并生成最佳组合下一期预测...' : '正在等待回测结果'}
          </div>
        )}
      </div>
    </div>
  );
}
