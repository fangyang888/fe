import React, { useEffect, useMemo, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (value) => (typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '--');

export default function FivePeriodKill() {
  const [dataType, setDataType] = useState('default');
  const [minSamples, setMinSamples] = useState(8);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadPrediction() {
      setLoading(true);
      setError('');

      try {
        const query = new URLSearchParams({
          type: dataType,
          minSamples: String(minSamples),
        });
        const res = await fetch(`/api/five-period-kill?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`接口返回 ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || '加载失败');
        }
      } finally {
        setLoading(false);
      }
    }

    loadPrediction();
    return () => controller.abort();
  }, [dataType, minSamples]);

  const latestTitle = useMemo(() => {
    const latest = data?.historyMeta?.latest;
    if (!latest) return '--';
    const year = latest.year ? `${latest.year}年` : '';
    const period = latest.No ? `第 ${latest.No} 期` : `#${latest.id || '--'}`;
    return `${year}${period}`;
  }, [data]);

  const prediction = data?.prediction;
  const isPerfect = data?.status === 'historical-100';
  const strictPrediction = data?.strictPrediction;
  const strictBacktest20 = data?.strictBacktest20;
  const strictBacktest50 = data?.strictBacktest50;

  return (
    <div className="five-kill-page">
      <style>{`
        .five-kill-page {
          min-height: 100vh;
          color: #172033;
          background:
            linear-gradient(135deg, rgba(247, 249, 252, 0.96), rgba(239, 244, 250, 0.98)),
            radial-gradient(circle at 18% 12%, rgba(52, 168, 130, 0.16), transparent 32%),
            radial-gradient(circle at 88% 18%, rgba(43, 105, 178, 0.12), transparent 34%);
          padding: 28px;
          box-sizing: border-box;
        }

        .five-shell {
          width: min(1180px, 100%);
          margin: 0 auto;
        }

        .five-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
        }

        .five-back {
          color: #2f5f9e;
          font-size: 0.95rem;
        }

        .five-controls {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .five-select {
          min-height: 40px;
          border: 1px solid #cfd8e5;
          background: #ffffff;
          color: #172033;
          border-radius: 8px;
          padding: 0 12px;
          font-size: 0.95rem;
        }

        .five-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
          gap: 18px;
          align-items: stretch;
        }

        .five-panel {
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid rgba(197, 209, 224, 0.9);
          border-radius: 8px;
          box-shadow: 0 18px 50px rgba(50, 72, 98, 0.12);
        }

        .five-main {
          padding: 28px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 26px;
          align-items: center;
        }

        .five-number {
          width: 150px;
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: clamp(3.4rem, 8vw, 5.3rem);
          font-weight: 900;
          color: #ffffff;
          background: radial-gradient(circle at 32% 28%, #74d9ab 0%, #1f9a77 46%, #166052 100%);
          box-shadow: 0 22px 34px rgba(31, 154, 119, 0.25);
          letter-spacing: 0;
        }

        .five-eyebrow {
          color: #2f6c64;
          font-size: 0.9rem;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .five-title {
          font-size: clamp(1.9rem, 4vw, 3rem);
          line-height: 1.08;
          margin: 0 0 12px;
          letter-spacing: 0;
          color: #12213a;
        }

        .five-subtitle {
          color: #506175;
          margin: 0;
          font-size: 1rem;
          max-width: 680px;
        }

        .five-status-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 20px;
        }

        .five-pill {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          border-radius: 8px;
          border: 1px solid #d5deea;
          background: #f8fafc;
          color: #34465d;
          padding: 0 10px;
          font-size: 0.86rem;
          font-weight: 700;
        }

        .five-pill.good {
          color: #17634f;
          border-color: #afe1ce;
          background: #eefaf5;
        }

        .five-side {
          padding: 22px;
        }

        .five-side h2, .five-section h2 {
          margin: 0 0 14px;
          color: #172033;
          font-size: 1.05rem;
        }

        .five-last-grid {
          display: grid;
          gap: 10px;
        }

        .five-draw-row {
          display: grid;
          grid-template-columns: 86px minmax(0, 1fr);
          gap: 10px;
          align-items: center;
          color: #52667b;
          font-size: 0.88rem;
        }

        .five-balls {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .five-ball {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #e9eef5;
          color: #26364b;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .five-content {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 18px;
          margin-top: 18px;
        }

        .five-section {
          padding: 20px;
        }

        .five-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .five-stat {
          border: 1px solid #dbe3ee;
          border-radius: 8px;
          padding: 14px;
          background: #fbfcfe;
          min-height: 78px;
        }

        .five-stat span {
          display: block;
          color: #65758a;
          font-size: 0.8rem;
          margin-bottom: 6px;
        }

        .five-stat strong {
          color: #172033;
          font-size: 1.24rem;
        }

        .five-table-wrap {
          overflow-x: auto;
        }

        .five-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 620px;
        }

        .five-table th,
        .five-table td {
          text-align: left;
          padding: 11px 10px;
          border-bottom: 1px solid #e3e9f1;
          font-size: 0.88rem;
        }

        .five-table th {
          color: #617287;
          font-weight: 800;
          background: #f6f8fb;
        }

        .five-table td {
          color: #26364b;
        }

        .five-result-ok {
          color: #177152;
          font-weight: 900;
        }

        .five-result-bad {
          color: #bf3e4a;
          font-weight: 900;
        }

        .five-note {
          margin: 18px 0 0;
          color: #66788e;
          font-size: 0.88rem;
        }

        .five-strict-band {
          margin-top: 18px;
          padding: 20px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 18px;
          align-items: center;
          border-color: #a8dcc8;
          background: linear-gradient(135deg, rgba(240, 253, 248, 0.94), rgba(255, 255, 255, 0.9));
        }

        .five-strict-number {
          width: 96px;
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: #fff;
          background: radial-gradient(circle at 32% 28%, #77ddb0 0%, #17956f 52%, #105745 100%);
          font-size: 2.6rem;
          font-weight: 900;
        }

        .five-strict-title {
          margin: 0 0 8px;
          color: #115743;
          font-size: 1.28rem;
        }

        .five-strict-summary {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .five-loading,
        .five-error {
          padding: 26px;
          text-align: center;
          color: #52667b;
        }

        .five-error {
          color: #bf3e4a;
        }

        @media (max-width: 860px) {
          .five-kill-page {
            padding: 18px;
          }

          .five-topbar,
          .five-hero,
          .five-main,
          .five-content,
          .five-strict-band {
            grid-template-columns: 1fr;
          }

          .five-topbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .five-number {
            width: 128px;
          }

          .five-main {
            gap: 18px;
          }

          .five-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="five-shell">
        <div className="five-topbar">
          <a className="five-back" href="/fe">返回主页</a>
          <div className="five-controls">
            <select className="five-select" value={dataType} onChange={(e) => setDataType(e.target.value)}>
              <option value="default">默认数据库</option>
              <option value="hk">香港数据库</option>
            </select>
            <select
              className="five-select"
              value={minSamples}
              onChange={(e) => setMinSamples(Number(e.target.value))}
            >
              <option value={5}>至少 5 个匹配样本</option>
              <option value={8}>至少 8 个匹配样本</option>
              <option value={12}>至少 12 个匹配样本</option>
              <option value={20}>至少 20 个匹配样本</option>
            </select>
          </div>
        </div>

        {loading && <div className="five-panel five-loading">正在计算最近 5 期规律...</div>}
        {error && !loading && <div className="five-panel five-error">加载失败：{error}</div>}

        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="five-panel five-error">{data.message}</div>
        )}

        {!loading && !error && prediction && (
          <>
            <div className="five-hero">
              <section className="five-panel five-main">
                <div className="five-number">{prediction.display}</div>
                <div>
                  <div className="five-eyebrow">前 5 期同类特征避开号</div>
                  <h1 className="five-title">下期优先排除 {prediction.display}</h1>
                  <p className="five-subtitle">
                    按最近 5 期的出现次数、遗漏、尾数压力、分区压力与邻号压力匹配历史样本，选择当前回测最稳的一个号码。
                  </p>
                  <div className="five-status-row">
                    <span className={`five-pill ${isPerfect ? 'good' : ''}`}>{prediction.confidenceLabel}</span>
                    <span className="five-pill">匹配 {prediction.matchedSamples} 样本</span>
                    <span className="five-pill">失败 {prediction.failureCount} 次</span>
                    <span className="five-pill">最新 {latestTitle}</span>
                  </div>
                </div>
              </section>

              <aside className="five-panel five-side">
                <h2>最近 5 期</h2>
                <div className="five-last-grid">
                  {(data.historyMeta?.lastFive || []).map((draw, index) => (
                    <div className="five-draw-row" key={`${draw.year || ''}-${draw.No || index}`}>
                      <strong>{draw.No ? `第 ${draw.No} 期` : `样本 ${index + 1}`}</strong>
                      <div className="five-balls">
                        {draw.numbers.map((n) => (
                          <span className="five-ball" key={`${draw.No}-${n}`}>
                            {fmtNum(n)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            {strictPrediction && (
              <section className="five-panel five-strict-band">
                <div className="five-strict-number">{strictPrediction.display}</div>
                <div>
                  <h2 className="five-strict-title">严格 100% 策略推荐排除 {strictPrediction.display}</h2>
                  <p className="five-subtitle">
                    只取当前历史同类样本 0 失败、近 5 期未开出且遗漏达到 4 期以上的候选，再按分区压力排序。
                  </p>
                  <div className="five-strict-summary">
                    <span className="five-pill good">当前样本 {strictPrediction.matchedSamples} / 0 失败</span>
                    <span className={`five-pill ${strictBacktest20?.isPerfect ? 'good' : ''}`}>
                      近20期 {strictBacktest20?.successCount || 0}/{strictBacktest20?.count || 0}
                    </span>
                    <span className={`five-pill ${strictBacktest50?.isPerfect ? 'good' : ''}`}>
                      近50期 {strictBacktest50?.successCount || 0}/{strictBacktest50?.count || 0}
                    </span>
                    <span className="five-pill">5期遗漏 {strictPrediction.currentMissInFive}</span>
                  </div>
                </div>
              </section>
            )}

            <div className="five-content">
              <section className="five-panel five-section">
                <h2>计算依据</h2>
                <div className="five-stats">
                  <div className="five-stat">
                    <span>近 5 期出现次数</span>
                    <strong>{prediction.recentAppearCount}</strong>
                  </div>
                  <div className="five-stat">
                    <span>近 5 期当前遗漏</span>
                    <strong>{prediction.currentMissInFive}</strong>
                  </div>
                  <div className="five-stat">
                    <span>同尾压力</span>
                    <strong>{prediction.tailPressure}</strong>
                  </div>
                  <div className="five-stat">
                    <span>同区压力</span>
                    <strong>{prediction.zonePressure}</strong>
                  </div>
                </div>
                <p className="five-note">{data.note}</p>
              </section>

              <section className="five-panel five-section">
                <h2>候选排行</h2>
                <div className="five-table-wrap">
                  <table className="five-table">
                    <thead>
                      <tr>
                        <th>号码</th>
                        <th>回测胜率</th>
                        <th>匹配样本</th>
                        <th>失败</th>
                        <th>5期遗漏</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.rankedCandidates || []).map((item) => (
                        <tr key={item.n}>
                          <td>
                            <strong>{fmtNum(item.n)}</strong>
                          </td>
                          <td>{fmtPct(item.accuracy)}</td>
                          <td>{item.matchedSamples}</td>
                          <td className={item.failureCount === 0 ? 'five-result-ok' : 'five-result-bad'}>
                            {item.failureCount}
                          </td>
                          <td>{item.currentMissInFive}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <section className="five-panel five-section" style={{ marginTop: 18 }}>
              <h2>最近 20 期滚动验证</h2>
              <div className="five-table-wrap">
                <table className="five-table">
                  <thead>
                    <tr>
                      <th>期数</th>
                      <th>当期开奖号码</th>
                      <th>当时预测避开</th>
                      <th>匹配样本</th>
                      <th>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recentValidation || []).map((row, index) => (
                      <tr key={`${row.year || ''}-${row.No || index}`}>
                        <td>{row.No ? `第 ${row.No} 期` : '--'}</td>
                        <td>
                          <div className="five-balls">
                            {row.actualNumbers.map((n) => (
                              <span className="five-ball" key={`${row.No}-${n}`}>
                                {fmtNum(n)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <strong>{fmtNum(row.predictedNumber)}</strong>
                        </td>
                        <td>{row.matchedSamples}</td>
                        <td className={row.success ? 'five-result-ok' : 'five-result-bad'}>
                          {row.success ? '成功避开' : '开出失败'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {strictBacktest50 && (
              <section className="five-panel five-section" style={{ marginTop: 18 }}>
                <h2>严格策略最近 50 期回测</h2>
                <div className="five-status-row" style={{ marginTop: 0, marginBottom: 14 }}>
                  <span className={`five-pill ${strictBacktest20?.isPerfect ? 'good' : ''}`}>
                    近20期成功率 {fmtPct(strictBacktest20?.successRate)}
                  </span>
                  <span className={`five-pill ${strictBacktest50?.isPerfect ? 'good' : ''}`}>
                    近50期成功率 {fmtPct(strictBacktest50?.successRate)}
                  </span>
                  <span className="five-pill">失败 {strictBacktest50.failureCount} 期</span>
                </div>
                <div className="five-table-wrap">
                  <table className="five-table">
                    <thead>
                      <tr>
                        <th>期数</th>
                        <th>当期开奖号码</th>
                        <th>严格策略避开</th>
                        <th>匹配样本</th>
                        <th>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(strictBacktest50.rows || []).map((row, index) => (
                        <tr key={`strict-${row.year || ''}-${row.No || index}`}>
                          <td>{row.No ? `第 ${row.No} 期` : '--'}</td>
                          <td>
                            <div className="five-balls">
                              {row.actualNumbers.map((n) => (
                                <span className="five-ball" key={`strict-${row.No}-${n}`}>
                                  {fmtNum(n)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <strong>{fmtNum(row.predictedNumber)}</strong>
                          </td>
                          <td>{row.matchedSamples}</td>
                          <td className={row.success ? 'five-result-ok' : 'five-result-bad'}>
                            {row.success ? '成功避开' : '开出失败'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
