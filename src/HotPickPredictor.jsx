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

  const formatProbability = (value) => (
    typeof value === 'number' ? formatPercent(value * 100) : '--'
  );

  const reasonText = () => {
    if (!hotPick) return '';
    if (hotPick.reason === 'history-too-short') {
      return '历史样本偏少，先使用10码均衡方案。';
    }
    if (hotPick.reason === 'ten-count-group-probability') {
      return '固定10码方案，按整组3+概率和滚动贡献筛选。';
    }
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
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 900;
          background: linear-gradient(135deg, #0284c7, #22c55e);
          box-shadow: 0 14px 26px rgba(14, 165, 233, 0.22);
        }

        .hot-pick-num-main {
          font-size: 1.25rem;
          line-height: 1;
        }

        .hot-pick-num-prob {
          margin-top: 4px;
          color: #dcfce7;
          font-size: 0.64rem;
          line-height: 1;
          font-weight: 900;
        }

        .hot-pick-prob-panel {
          display: grid;
          grid-template-columns: minmax(180px, 1.2fr) repeat(3, minmax(120px, 1fr));
          gap: 12px;
          margin: 22px 0;
        }

        .hot-pick-prob-main,
        .hot-pick-prob-item {
          background: rgba(255, 255, 255, 0.055);
          border: 1px solid rgba(186, 230, 253, 0.14);
          border-radius: 12px;
          padding: 15px;
        }

        .hot-pick-prob-main {
          background: rgba(34, 197, 94, 0.12);
          border-color: rgba(134, 239, 172, 0.22);
        }

        .hot-pick-prob-value {
          color: #f0fdf4;
          font-size: 1.45rem;
          font-weight: 900;
          margin-bottom: 5px;
        }

        .hot-pick-prob-label {
          color: #bae6fd;
          font-size: 0.77rem;
          line-height: 1.45;
        }

        .hot-pick-lift {
          color: #86efac;
        }

        .hot-pick-lift.negative {
          color: #fcd34d;
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

        .hot-pick-contrib-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 10px;
        }

        .hot-pick-contrib {
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 12px;
        }

        .hot-pick-contrib-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: #e0f2fe;
          font-size: 0.86rem;
          font-weight: 900;
          margin-bottom: 8px;
        }

        .hot-pick-contrib-num {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #052e16;
          background: #86efac;
          font-weight: 900;
        }

        .hot-pick-contrib-meta {
          color: #bae6fd;
          font-size: 0.74rem;
          line-height: 1.55;
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
          .hot-pick-prob-panel { grid-template-columns: 1fr; }
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

            {hotPick.groupProbability && (
              <div className="hot-pick-prob-panel">
                <div className="hot-pick-prob-main">
                  <div className="hot-pick-prob-value">
                    {formatPercent(hotPick.groupProbability.estimatedRate)}
                  </div>
                  <div className="hot-pick-prob-label">
                    整组 {hotPick.groupProbability.count} 码命中
                    {hotPick.groupProbability.targetHit}+ 估算概率
                  </div>
                </div>
                <div className="hot-pick-prob-item">
                  <div className="hot-pick-prob-value">
                    {formatPercent(hotPick.groupProbability.randomBaseline)}
                  </div>
                  <div className="hot-pick-prob-label">随机10码基线</div>
                </div>
                <div className="hot-pick-prob-item">
                  <div
                    className={`hot-pick-prob-value hot-pick-lift ${
                      hotPick.groupProbability.lift < 0 ? 'negative' : ''
                    }`}
                  >
                    {hotPick.groupProbability.lift > 0 ? '+' : ''}
                    {formatPercent(hotPick.groupProbability.lift)}
                  </div>
                  <div className="hot-pick-prob-label">相对随机提升</div>
                </div>
                <div className="hot-pick-prob-item">
                  <div className="hot-pick-prob-value">
                    {formatPercent(hotPick.groupProbability.recentBacktestRate)}
                  </div>
                  <div className="hot-pick-prob-label">滚动回测3+占比</div>
                </div>
              </div>
            )}

            <div className="hot-pick-nums">
              {hotPick.predictions.map((p) => (
                <div
                  key={p.n}
                  className="hot-pick-num"
                  title={[
                    `出现概率 ${formatProbability(p.appearProb)}`,
                    ...(p.reasons || []),
                  ].join(' · ')}
                >
                  <span className="hot-pick-num-main">{p.n}</span>
                  <span className="hot-pick-num-prob">
                    {formatProbability(p.appearProb)}
                  </span>
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

            {hotPick.contributionRanking?.length > 0 && (
              <>
                <div className="hot-pick-section-title">滚动贡献筛选 Top 10</div>
                <div className="hot-pick-contrib-list">
                  {hotPick.contributionRanking.map((item) => (
                    <div key={item.n} className="hot-pick-contrib">
                      <div className="hot-pick-contrib-top">
                        <span className="hot-pick-contrib-num">{item.n}</span>
                        <span>
                          {item.successLift > 0 ? '+' : ''}
                          {formatPercent(item.successLift)}
                        </span>
                      </div>
                      <div className="hot-pick-contrib-meta">
                        样本 {item.samples} 期 · 单号命中 {formatPercent(item.hitRate)} · 平均命中贡献{' '}
                        {item.avgHitLift > 0 ? '+' : ''}
                        {item.avgHitLift.toFixed(3)}
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
