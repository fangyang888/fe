import React, { useEffect, useState } from 'react';

export default function HotPickPredictor() {
  const [hotPick, setHotPick] = useState(null);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHotPick = async () => {
      try {
        const res = await fetch('/api/predictor/hot-pick', { cache: 'no-store' });
        if (!res.ok) {
          const message = await res.text();
          throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
        }
        const data = await res.json();
        setHotPick(data.hotPick || null);
        setHistoryMeta(data.historyMeta || null);
      } catch (err) {
        console.error(err);
        setError(`命中模块加载失败。${err.message ? `（${err.message}）` : ''}`);
      } finally {
        setLoading(false);
      }
    };

    fetchHotPick();
  }, []);

  const formatPercent = (value, digits = 1) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '--';
    return `${value.toFixed(digits)}%`;
  };

  const reasonText = () => {
    if (!hotPick) return '';
    if (hotPick.reason === 'six-count-passed-recent-backtest') {
      return '近10期6码回测达标，保持6码方案。';
    }
    if (hotPick.reason === 'eight-count-not-stable-use-expanded') {
      return `6/8码回测不够稳，已自动放宽到${hotPick.selectedCount}码。`;
    }
    return '近10期6码回测不够稳，已自动放宽到8码。';
  };

  return (
    <div className="hot-pick-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .hot-pick-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #082f49 0%, #052e16 100%);
          color: #fff;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          padding: 56px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .hot-pick-card {
          width: 100%;
          max-width: 980px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 36px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
        }

        .hot-pick-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 28px;
        }

        .hot-pick-title {
          font-size: 2.3rem;
          font-weight: 900;
          margin: 0 0 10px 0;
          color: #e0f2fe;
        }

        .hot-pick-subtitle {
          color: #bae6fd;
          font-size: 0.95rem;
          line-height: 1.6;
          max-width: 680px;
        }

        .hot-pick-badge {
          flex-shrink: 0;
          color: #052e16;
          background: #86efac;
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 0.84rem;
          font-weight: 900;
        }

        .hot-pick-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }

        .hot-pick-pill {
          color: #e0f2fe;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(186, 230, 253, 0.16);
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 0.76rem;
          font-weight: 800;
        }

        .hot-pick-nums {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin: 24px 0;
        }

        .hot-pick-num {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 1.3rem;
          font-weight: 900;
          background: linear-gradient(135deg, #0284c7, #22c55e);
          box-shadow: 0 14px 26px rgba(14, 165, 233, 0.22);
        }

        .hot-pick-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin: 22px 0;
        }

        .hot-pick-stat {
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 15px;
        }

        .hot-pick-stat-value {
          color: #f0f9ff;
          font-size: 1.22rem;
          font-weight: 900;
          margin-bottom: 5px;
        }

        .hot-pick-stat-label {
          color: #bae6fd;
          font-size: 0.78rem;
        }

        .hot-pick-section-title {
          color: #e0f2fe;
          font-size: 1rem;
          font-weight: 900;
          margin: 28px 0 14px;
        }

        .hot-pick-backtest {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 10px;
        }

        .hot-pick-row {
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 12px;
        }

        .hot-pick-row-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #e0f2fe;
          font-size: 0.78rem;
          font-weight: 800;
          margin-bottom: 9px;
        }

        .hot-pick-row-hit {
          color: #86efac;
        }

        .hot-pick-row-miss {
          color: #fcd34d;
        }

        .hot-pick-small-nums {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .hot-pick-small-num {
          min-width: 25px;
          height: 25px;
          border-radius: 999px;
          padding: 0 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #bae6fd;
          background: rgba(14, 165, 233, 0.12);
          font-size: 0.72rem;
          font-weight: 800;
        }

        .hot-pick-small-num.hit {
          color: #052e16;
          background: #86efac;
        }

        .error-message {
          color: #fecaca;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(248, 113, 113, 0.22);
          padding: 18px;
          border-radius: 12px;
        }

        .spinner {
          width: 52px;
          height: 52px;
          border: 4px solid rgba(255,255,255,0.12);
          border-top-color: #86efac;
          border-radius: 50%;
          animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          margin: 50px auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .action-container {
          margin-top: 32px;
          text-align: center;
        }

        .btn-back {
          display: inline-block;
          padding: 12px 26px;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          text-decoration: none;
          border-radius: 999px;
          font-weight: 800;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        @media (max-width: 640px) {
          .hot-pick-card { padding: 24px; }
          .hot-pick-header { flex-direction: column; }
          .hot-pick-title { font-size: 1.8rem; }
        }
      ` }} />

      <div className="hot-pick-card">
        {loading && <div className="spinner" />}
        {error && <div className="error-message">{error}</div>}

        {!loading && !error && hotPick && (
          <>
            <div className="hot-pick-header">
              <div>
                <h1 className="hot-pick-title">开出号命中模块</h1>
                <div className="hot-pick-subtitle">
                  目标：一期 7 个开奖中，当前选择 {hotPick.selectedCount} 个号，争取命中至少 3 个。{reasonText()}
                </div>
                <div className="hot-pick-meta">
                  <span className="hot-pick-pill">策略 {hotPick.selectedStrategy || '--'}</span>
                  {hotPick.diversified && <span className="hot-pick-pill">尾数/区间分散</span>}
                  {historyMeta?.latest?.No && (
                    <span className="hot-pick-pill">最新第 {historyMeta.latest.No} 期</span>
                  )}
                  {historyMeta?.count && (
                    <span className="hot-pick-pill">历史 {historyMeta.count} 期</span>
                  )}
                </div>
              </div>
              <div className="hot-pick-badge">{hotPick.selectedCount}码搏3中</div>
            </div>

            <div className="hot-pick-nums">
              {hotPick.predictions.map((p) => (
                <div key={p.n} className="hot-pick-num" title={p.reasons?.join(' · ') || ''}>
                  {p.n}
                </div>
              ))}
            </div>

            {hotPick.selectedStats && (
              <>
                <div className="hot-pick-stats">
                  <div className="hot-pick-stat">
                    <div className="hot-pick-stat-value">
                      {formatPercent(hotPick.selectedStats.successRate)}
                    </div>
                    <div className="hot-pick-stat-label">近10期命中3+占比</div>
                  </div>
                  <div className="hot-pick-stat">
                    <div className="hot-pick-stat-value">
                      {hotPick.selectedStats.avgHit.toFixed(2)}
                    </div>
                    <div className="hot-pick-stat-label">近10期平均命中数</div>
                  </div>
                  <div className="hot-pick-stat">
                    <div className="hot-pick-stat-value">
                      {hotPick.selectedStats.successPeriods}/{hotPick.selectedStats.calcPeriods}
                    </div>
                    <div className="hot-pick-stat-label">达成期数</div>
                  </div>
                  <div className="hot-pick-stat">
                    <div className="hot-pick-stat-value">
                      {formatPercent(hotPick.selectedStats.randomBaseline)}
                    </div>
                    <div className="hot-pick-stat-label">随机基线</div>
                  </div>
                </div>

                <div className="hot-pick-section-title">近 10 期回测详情</div>
                <div className="hot-pick-backtest">
                  {hotPick.selectedStats.details.map((item) => (
                    <div key={item.periodOffset} className="hot-pick-row">
                      <div className="hot-pick-row-top">
                        <span>倒数第 {item.periodOffset} 期</span>
                        <span className={item.success ? 'hot-pick-row-hit' : 'hot-pick-row-miss'}>
                          命中 {item.hitCount}/{item.predicted.length}
                        </span>
                      </div>
                      <div className="hot-pick-small-nums">
                        {item.predicted.map((n) => (
                          <span
                            key={n}
                            className={`hot-pick-small-num ${item.hitNums.includes(n) ? 'hit' : ''}`}
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div className="action-container">
          <a href="/fe/kill/new" className="btn-back">返回杀码主页面</a>
        </div>
      </div>
    </div>
  );
}
