import React, { useEffect, useMemo, useState } from 'react';

const fmtNum = (n) => String(n ?? '--').padStart(2, '0');
const fmtPct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '--');

export default function POneKill() {
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
        const res = await fetch(`/api/kill/p-one?type=${dataType}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`接口返回 ${res.status}`);
        setData(await res.json());
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [dataType]);

  const latestLabel = useMemo(() => {
    const latest = data?.historyMeta?.latest;
    if (!latest) return '--';
    return `${latest.year ? `${latest.year}年` : ''}${latest.No ? `第 ${latest.No} 期` : `#${latest.id || '--'}`}`;
  }, [data]);

  const prediction = data?.prediction;
  const backtest20 = data?.backtest20;
  const backtest50 = data?.backtest50;
  const targetMet = data?.status === 'target-met';

  return (
    <div className="p-one-page">
      <style>{`
        .p-one-page {
          min-height: 100vh;
          padding: 28px;
          box-sizing: border-box;
          color: #172033;
          background:
            radial-gradient(circle at 14% 12%, rgba(42, 157, 143, 0.18), transparent 30%),
            radial-gradient(circle at 88% 16%, rgba(230, 179, 74, 0.18), transparent 32%),
            linear-gradient(135deg, #f7fafc 0%, #eef3f8 100%);
        }

        .p-one-shell {
          width: min(1180px, 100%);
          margin: 0 auto;
        }

        .p-one-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          margin-bottom: 18px;
        }

        .p-one-back {
          color: #295f8f;
          font-size: 0.94rem;
        }

        .p-one-select {
          min-height: 40px;
          border: 1px solid #cfd8e5;
          background: #fff;
          color: #172033;
          border-radius: 8px;
          padding: 0 12px;
          font-size: 0.95rem;
        }

        .p-one-panel {
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(197, 209, 224, 0.92);
          border-radius: 8px;
          box-shadow: 0 18px 50px rgba(50, 72, 98, 0.12);
        }

        .p-one-hero {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) minmax(280px, 0.7fr);
          gap: 24px;
          align-items: center;
          padding: 28px;
        }

        .p-one-number {
          width: 152px;
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: clamp(3.4rem, 8vw, 5.4rem);
          font-weight: 900;
          color: #fff;
          background: radial-gradient(circle at 32% 28%, #f6d76e 0%, #d58b17 50%, #8f5410 100%);
          box-shadow: 0 24px 34px rgba(176, 103, 24, 0.25);
          letter-spacing: 0;
        }

        .p-one-eyebrow {
          color: #246b64;
          font-size: 0.88rem;
          font-weight: 900;
          margin-bottom: 8px;
        }

        .p-one-title {
          margin: 0 0 12px;
          color: #12213a;
          font-size: clamp(1.9rem, 4vw, 3rem);
          line-height: 1.08;
          letter-spacing: 0;
        }

        .p-one-subtitle {
          margin: 0;
          color: #52667b;
          font-size: 1rem;
          line-height: 1.62;
        }

        .p-one-pills {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }

        .p-one-pill {
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          border-radius: 8px;
          border: 1px solid #d5deea;
          background: #f8fafc;
          color: #34465d;
          padding: 0 10px;
          font-size: 0.86rem;
          font-weight: 800;
        }

        .p-one-pill.good {
          color: #17634f;
          border-color: #afe1ce;
          background: #eefaf5;
        }

        .p-one-pill.bad {
          color: #a63542;
          border-color: #f2bac2;
          background: #fff2f4;
        }

        .p-one-side h2,
        .p-one-section h2 {
          margin: 0 0 14px;
          color: #172033;
          font-size: 1.05rem;
        }

        .p-one-side {
          padding: 20px;
          align-self: stretch;
        }

        .p-one-balls {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .p-one-ball {
          width: 31px;
          height: 31px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #e9eef5;
          color: #26364b;
          font-size: 0.78rem;
          font-weight: 900;
        }

        .p-one-ball.pick {
          background: #d58b17;
          color: #fff;
        }

        .p-one-ball.opened {
          background: #d9303e;
          color: #fff;
        }

        .p-one-content {
          display: grid;
          grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
          gap: 18px;
          margin-top: 18px;
        }

        .p-one-section {
          padding: 20px;
        }

        .p-one-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .p-one-stat {
          min-height: 86px;
          border: 1px solid #dbe3ee;
          border-radius: 8px;
          padding: 14px;
          background: #fbfcfe;
        }

        .p-one-stat span {
          display: block;
          color: #65758a;
          font-size: 0.8rem;
          margin-bottom: 7px;
        }

        .p-one-stat strong {
          color: #172033;
          font-size: 1.28rem;
        }

        .p-one-table-wrap {
          overflow-x: auto;
        }

        .p-one-table {
          width: 100%;
          min-width: 680px;
          border-collapse: collapse;
        }

        .p-one-table th,
        .p-one-table td {
          text-align: left;
          padding: 11px 10px;
          border-bottom: 1px solid #e3e9f1;
          font-size: 0.88rem;
        }

        .p-one-table th {
          color: #617287;
          font-weight: 900;
          background: #f6f8fb;
        }

        .p-one-ok {
          color: #177152;
          font-weight: 900;
        }

        .p-one-fail {
          color: #bf3e4a;
          font-weight: 900;
        }

        .p-one-loading,
        .p-one-error {
          padding: 28px;
          text-align: center;
          color: #52667b;
        }

        .p-one-error {
          color: #bf3e4a;
        }

        @media (max-width: 900px) {
          .p-one-page {
            padding: 18px;
          }

          .p-one-topbar,
          .p-one-hero,
          .p-one-content {
            grid-template-columns: 1fr;
          }

          .p-one-topbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .p-one-number {
            width: 128px;
          }

          .p-one-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="p-one-shell">
        <div className="p-one-topbar">
          <a className="p-one-back" href="/fe">返回主页</a>
          <select className="p-one-select" value={dataType} onChange={(e) => setDataType(e.target.value)}>
            <option value="default">默认数据库</option>
            <option value="hk">香港数据库</option>
          </select>
        </div>

        {loading && <div className="p-one-panel p-one-loading">正在读取数据库并回测...</div>}
        {error && !loading && <div className="p-one-panel p-one-error">加载失败：{error}</div>}
        {!loading && !error && data?.status === 'insufficient-history' && (
          <div className="p-one-panel p-one-error">{data.message}</div>
        )}

        {!loading && !error && prediction && (
          <>
            <section className="p-one-panel p-one-hero">
              <div className="p-one-number">{prediction.display}</div>
              <div>
                <div className="p-one-eyebrow">前 5 期候选池单杀</div>
                <h1 className="p-one-title">下期优先排除 {prediction.display}</h1>
                <p className="p-one-subtitle">
                  候选号码只取最近 5 期真实开过的数字，策略用历史库做滚动择优；当前推荐来自：{prediction.strategyName}。
                </p>
                <div className="p-one-pills">
                  <span className={`p-one-pill ${targetMet ? 'good' : 'bad'}`}>
                    {targetMet ? '达标' : '未达标'}
                  </span>
                  <span className={`p-one-pill ${backtest20?.isPerfect ? 'good' : 'bad'}`}>
                    近20期 {backtest20?.successCount}/{backtest20?.count} · {fmtPct(backtest20?.successRate)}
                  </span>
                  <span className={`p-one-pill ${backtest50?.successRate > 0.94 ? 'good' : 'bad'}`}>
                    近50期 {backtest50?.successCount}/{backtest50?.count} · {fmtPct(backtest50?.successRate)}
                  </span>
                  <span className="p-one-pill">最新 {latestLabel}</span>
                </div>
              </div>
              <aside className="p-one-panel p-one-side">
                <h2>最近 5 期候选池</h2>
                <div className="p-one-balls">
                  {(data.historyMeta?.candidatePool || []).map((item) => (
                    <span
                      className={`p-one-ball ${item.number === prediction.number ? 'pick' : ''}`}
                      key={item.number}
                    >
                      {item.display}
                    </span>
                  ))}
                </div>
              </aside>
            </section>

            <div className="p-one-content">
              <section className="p-one-panel p-one-section">
                <h2>达标回测</h2>
                <div className="p-one-stats">
                  <div className="p-one-stat">
                    <span>要求</span>
                    <strong>20期 100%</strong>
                  </div>
                  <div className="p-one-stat">
                    <span>结果</span>
                    <strong>{backtest20?.successCount}/{backtest20?.count}</strong>
                  </div>
                  <div className="p-one-stat">
                    <span>要求</span>
                    <strong>50期 &gt;94%</strong>
                  </div>
                  <div className="p-one-stat">
                    <span>结果</span>
                    <strong>{fmtPct(backtest50?.successRate)}</strong>
                  </div>
                </div>
                <p className="p-one-subtitle" style={{ marginTop: 16 }}>
                  {data.note}
                </p>
              </section>

              <section className="p-one-panel p-one-section">
                <h2>当前候选排序</h2>
                <div className="p-one-table-wrap">
                  <table className="p-one-table">
                    <thead>
                      <tr>
                        <th>号码</th>
                        <th>同类命中</th>
                        <th>样本</th>
                        <th>五期次数</th>
                        <th>五期遗漏</th>
                        <th>转移风险</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.candidateRanking || []).map((item) => (
                        <tr key={item.n}>
                          <td>
                            <span className={`p-one-ball ${item.n === prediction.number ? 'pick' : ''}`}>
                              {item.display}
                            </span>
                          </td>
                          <td>{fmtPct(item.featureAccuracy)}</td>
                          <td>{item.featureSamples}</td>
                          <td>{item.appearInFive}</td>
                          <td>{item.missInFive}</td>
                          <td>{fmtPct(item.transitionRisk)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <section className="p-one-panel p-one-section" style={{ marginTop: 18 }}>
              <h2>最近 20 期明细</h2>
              <div className="p-one-table-wrap">
                <table className="p-one-table">
                  <thead>
                    <tr>
                      <th>期数</th>
                      <th>预测杀</th>
                      <th>当期开奖结果</th>
                      <th>候选池</th>
                      <th>策略</th>
                      <th>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(backtest20?.rows || []).map((row, index) => (
                      <tr key={`${row.year || ''}-${row.No || index}`}>
                        <td>{row.No ? `第 ${row.No} 期` : '--'}</td>
                        <td>
                          <span className={`p-one-ball ${row.success ? 'pick' : 'opened'}`}>
                            {fmtNum(row.predictedNumber)}
                          </span>
                        </td>
                        <td>
                          <div className="p-one-balls">
                            {row.actualNumbers.map((n) => (
                              <span
                                className={`p-one-ball ${n === row.predictedNumber ? 'opened' : ''}`}
                                key={`${row.No}-${n}`}
                              >
                                {fmtNum(n)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="p-one-balls">
                            {row.candidatePool.map((n) => (
                              <span className="p-one-ball" key={`${row.No}-pool-${n}`}>
                                {fmtNum(n)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>{row.strategyName || '--'}</td>
                        <td className={row.success ? 'p-one-ok' : 'p-one-fail'}>
                          {row.success ? '成功避开' : '开出失败'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
