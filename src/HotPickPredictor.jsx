import React, { useEffect, useState } from 'react';

export default function HotPickPredictor() {
  const [activeTab, setActiveTab] = useState('default');
  const [hotPick, setHotPick] = useState(null);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [recentOccurrenceStats, setRecentOccurrenceStats] = useState(null);
  const [hotPickKill5, setHotPickKill5] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHotPick = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = activeTab === 'hk' ? '?type=hk' : '';
        const res = await fetch(`/api/predictor/hot-pick${query}`, { cache: 'no-store' });
        if (!res.ok) {
          const message = await res.text();
          throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
        }
        const data = await res.json();
        setHotPick(data.hotPick || null);
        setHistoryMeta(data.historyMeta || null);
        setRecentOccurrenceStats(data.recentOccurrenceStats || null);
        setHotPickKill5(data.hotPickKill5 || null);
      } catch (err) {
        console.error(err);
        setError(`命中模块加载失败。${err.message ? `（${err.message}）` : ''}`);
      } finally {
        setLoading(false);
      }
    };

    fetchHotPick();
  }, [activeTab]);

  const formatPercent = (value, digits = 1) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '--';
    return `${value.toFixed(digits)}%`;
  };

  const formatProbability = (value) => (
    typeof value === 'number' ? formatPercent(value * 100) : '--'
  );

  const formatStrategy = (strategy) => {
    const labels = {
      balanced: '均衡',
      repeat: '连热',
      transition: '转移',
      hot: '热度',
      due: '间隔',
      recent30: '近30联合',
      'hk-balanced': '香港均衡',
      'hk-recent': '香港近热',
      'hk-cycle': '香港周期',
      'hk-transition': '香港转移',
      'hk-stable30': '香港30期稳定',
    };
    return labels[strategy] || strategy || '--';
  };

  const selectedNumbers = new Set((hotPick?.predictions || []).map((p) => p.n));

  const reasonText = () => {
    if (!hotPick) return '';
    if (hotPick.reason === 'history-too-short') {
      return '历史样本偏少，先使用10码均衡方案。';
    }
    if (hotPick.reason === 'ten-count-group-probability') {
      if (hotPick.selectedStrategy === 'recent30') {
        return '固定10码方案，已结合近30期出现期数/排名与滚动贡献筛选。';
      }
      return '固定10码方案，按整组3+概率和滚动贡献筛选。';
    }
    if (hotPick.reason === 'hk-independent-rolling-backtest') {
      return '香港独立算法，按香港库近20/60期滚动回测自动选择策略。';
    }
    if (hotPick.reason === 'hk-independent-history-too-short') {
      return '香港独立算法样本偏少，先使用香港均衡方案。';
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

        .hot-pick-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .hot-pick-tab-btn {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #dbeafe;
          border-radius: 10px;
          padding: 9px 16px;
          font-size: 0.9rem;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease;
        }

        .hot-pick-tab-btn:hover {
          transform: translateY(-1px);
        }

        .hot-pick-tab-btn.active {
          background: #86efac;
          color: #052e16;
          border-color: #86efac;
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

        .hot-pick-kill-panel {
          background: rgba(127, 29, 29, 0.16);
          border: 1px solid rgba(248, 113, 113, 0.24);
          border-radius: 14px;
          padding: 18px;
        }

        .hot-pick-kill-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 14px;
        }

        .hot-pick-kill-title {
          color: #fee2e2;
          font-size: 1rem;
          font-weight: 900;
          margin-bottom: 6px;
        }

        .hot-pick-kill-note {
          color: #fecaca;
          font-size: 0.78rem;
          line-height: 1.5;
        }

        .hot-pick-kill-badge {
          flex-shrink: 0;
          color: #450a0a;
          background: #fca5a5;
          border-radius: 999px;
          padding: 7px 11px;
          font-size: 0.76rem;
          font-weight: 900;
        }

        .hot-pick-kill-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
        }

        .hot-pick-kill-card {
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(254, 202, 202, 0.12);
          border-radius: 12px;
          padding: 13px;
        }

        .hot-pick-kill-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 9px;
        }

        .hot-pick-kill-num {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, #ef4444, #f97316);
          font-weight: 900;
        }

        .hot-pick-kill-prob {
          color: #fecaca;
          font-size: 1rem;
          font-weight: 900;
        }

        .hot-pick-kill-meta {
          color: #fee2e2;
          font-size: 0.72rem;
          line-height: 1.55;
        }

        .hot-pick-kill-reasons {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 9px;
        }

        .hot-pick-kill-reason {
          color: #fecaca;
          background: rgba(248, 113, 113, 0.12);
          border: 1px solid rgba(248, 113, 113, 0.16);
          border-radius: 999px;
          padding: 3px 7px;
          font-size: 0.66rem;
          font-weight: 800;
        }

        .hot-pick-kill-backtest-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 10px;
          margin: 16px 0 12px;
          padding-top: 14px;
          border-top: 1px solid rgba(254, 202, 202, 0.13);
        }

        .hot-pick-kill-backtest-stat {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(254, 202, 202, 0.1);
          border-radius: 10px;
          padding: 11px;
        }

        .hot-pick-kill-backtest-value {
          color: #fee2e2;
          font-size: 1rem;
          font-weight: 900;
          margin-bottom: 4px;
        }

        .hot-pick-kill-backtest-label {
          color: #fecaca;
          font-size: 0.7rem;
        }

        .hot-pick-kill-backtest-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 10px;
        }

        .hot-pick-kill-backtest-row {
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(254, 202, 202, 0.1);
          border-radius: 12px;
          padding: 12px;
        }

        .hot-pick-kill-backtest-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #fee2e2;
          font-size: 0.76rem;
          font-weight: 900;
          margin-bottom: 9px;
        }

        .hot-pick-kill-backtest-ok {
          color: #86efac;
        }

        .hot-pick-kill-backtest-bad {
          color: #fca5a5;
        }

        .hot-pick-kill-backtest-nums {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }

        .hot-pick-kill-backtest-num {
          min-width: 38px;
          min-height: 30px;
          border-radius: 9px;
          padding: 4px 7px;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #fee2e2;
          background: rgba(248, 113, 113, 0.12);
          font-size: 0.7rem;
          font-weight: 900;
        }

        .hot-pick-kill-backtest-num.failed {
          color: #450a0a;
          background: #fca5a5;
        }

        .hot-pick-kill-backtest-prob {
          font-size: 0.58rem;
          opacity: 0.85;
          margin-top: 2px;
        }

        .hot-pick-kill-backtest-meta {
          color: #fecaca;
          font-size: 0.7rem;
          line-height: 1.5;
        }

        .hot-pick-occurrence-summary {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .hot-pick-occurrence-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
          gap: 8px;
        }

        .hot-pick-occurrence-cell {
          min-height: 64px;
          border-radius: 10px;
          padding: 9px;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }

        .hot-pick-occurrence-cell.selected {
          background: rgba(34, 197, 94, 0.13);
          border-color: rgba(134, 239, 172, 0.28);
        }

        .hot-pick-occurrence-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-bottom: 7px;
        }

        .hot-pick-occurrence-num {
          color: #f0f9ff;
          font-size: 0.96rem;
          font-weight: 900;
        }

        .hot-pick-occurrence-rank {
          color: #86efac;
          font-size: 0.68rem;
          font-weight: 900;
        }

        .hot-pick-occurrence-count {
          color: #bae6fd;
          font-size: 0.72rem;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .hot-pick-occurrence-bar {
          height: 5px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
        }

        .hot-pick-occurrence-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #38bdf8, #86efac);
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
        <div className="hot-pick-tabs">
          <button
            type="button"
            className={`hot-pick-tab-btn ${activeTab === 'default' ? 'active' : ''}`}
            onClick={() => setActiveTab('default')}
          >
            默认数据
          </button>
          <button
            type="button"
            className={`hot-pick-tab-btn ${activeTab === 'hk' ? 'active' : ''}`}
            onClick={() => setActiveTab('hk')}
          >
            香港数据
          </button>
        </div>

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
                  <span className="hot-pick-pill">
                    当前库 {activeTab === 'hk' ? '香港 (hk)' : '默认 (default)'}
                  </span>
                  <span className="hot-pick-pill">策略 {formatStrategy(hotPick.selectedStrategy)}</span>
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
                    <div className="hot-pick-stat-label">
                      近{hotPick.selectedStats.calcPeriods}期命中3+占比
                    </div>
                  </div>
                  <div className="hot-pick-stat">
                    <div className="hot-pick-stat-value">
                      {hotPick.selectedStats.avgHit.toFixed(2)}
                    </div>
                    <div className="hot-pick-stat-label">
                      近{hotPick.selectedStats.calcPeriods}期平均命中数
                    </div>
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
                  {hotPick.longBacktestStats && (
                    <div className="hot-pick-stat">
                      <div className="hot-pick-stat-value">
                        {formatPercent(hotPick.longBacktestStats.successRate)}
                      </div>
                      <div className="hot-pick-stat-label">
                        近{hotPick.longBacktestStats.calcPeriods}期命中3+占比
                      </div>
                    </div>
                  )}
                  {hotPick.longBacktestStats && (
                    <div className="hot-pick-stat">
                      <div className="hot-pick-stat-value">
                        {hotPick.longBacktestStats.avgHit.toFixed(2)}
                      </div>
                      <div className="hot-pick-stat-label">
                        近{hotPick.longBacktestStats.calcPeriods}期平均命中数
                      </div>
                    </div>
                  )}
                </div>

                <div className="hot-pick-section-title">
                  近 {hotPick.selectedStats.calcPeriods} 期回测详情
                </div>
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

            {hotPickKill5 && (
              <>
                <div className="hot-pick-section-title">94%+ 高置信 5杀</div>
                <div className="hot-pick-kill-panel">
                  <div className="hot-pick-kill-head">
                    <div>
                      <div className="hot-pick-kill-title">
                        {hotPickKill5.sourceAlgorithm === 'hk-kill5-independent'
                          ? '香港独立 5杀算法'
                          : '基于近30期热度 + NewKill 多模型算法'}
                      </div>
                      <div className="hot-pick-kill-note">{hotPickKill5.note}</div>
                    </div>
                    <div className="hot-pick-kill-badge">
                      {hotPickKill5.selectedCount}/{hotPickKill5.targetCount} 达标
                    </div>
                  </div>

                  <div className="hot-pick-kill-grid">
                    {(hotPickKill5.predictions?.length > 0
                      ? hotPickKill5.predictions
                      : hotPickKill5.candidates?.slice(0, 5) || []
                    ).map((item) => (
                      <div key={item.n} className="hot-pick-kill-card">
                        <div className="hot-pick-kill-top">
                          <span className="hot-pick-kill-num">{item.n}</span>
                          <span className="hot-pick-kill-prob">
                            {formatPercent(item.killProbability)}
                          </span>
                        </div>
                        <div className="hot-pick-kill-meta">
                          近30期 {item.recentCount} 期 · 出现率 {formatPercent(item.recentRate)}
                          <br />
                          热度排名 #{item.heatRank} · 滚动杀码 {formatPercent(item.rollingKillRate)}
                        </div>
                        <div className="hot-pick-kill-reasons">
                          {item.reasons?.slice(0, 4).map((reason) => (
                            <span key={reason} className="hot-pick-kill-reason">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {hotPickKill5.backtest?.details?.length > 0 && (
                    <>
                      <div className="hot-pick-kill-backtest-summary">
                        <div className="hot-pick-kill-backtest-stat">
                          <div className="hot-pick-kill-backtest-value">
                            {formatPercent(hotPickKill5.backtest.overallAccuracy)}
                          </div>
                          <div className="hot-pick-kill-backtest-label">近10期单号杀码准确率</div>
                        </div>
                        <div className="hot-pick-kill-backtest-stat">
                          <div className="hot-pick-kill-backtest-value">
                            {hotPickKill5.backtest.allCorrectPeriods}/{hotPickKill5.backtest.calcPeriods}
                          </div>
                          <div className="hot-pick-kill-backtest-label">5杀全中期数</div>
                        </div>
                        <div className="hot-pick-kill-backtest-stat">
                          <div className="hot-pick-kill-backtest-value">
                            {formatPercent(hotPickKill5.backtest.allCorrectRate)}
                          </div>
                          <div className="hot-pick-kill-backtest-label">5杀全中率</div>
                        </div>
                      </div>

                      <div className="hot-pick-kill-backtest-list">
                        {hotPickKill5.backtest.details.map((item) => (
                          <div key={item.periodOffset} className="hot-pick-kill-backtest-row">
                            <div className="hot-pick-kill-backtest-top">
                              <span>倒数第 {item.periodOffset} 期</span>
                              <span
                                className={
                                  item.failed.length === 0
                                    ? 'hot-pick-kill-backtest-ok'
                                    : 'hot-pick-kill-backtest-bad'
                                }
                              >
                                {item.correctCount}/{item.predicted.length} · {formatPercent(item.accuracy)}
                              </span>
                            </div>
                            <div className="hot-pick-kill-backtest-nums">
                              {item.predicted.map((prediction) => (
                                <span
                                  key={prediction.n}
                                  className={`hot-pick-kill-backtest-num ${
                                    item.failed.includes(prediction.n) ? 'failed' : ''
                                  }`}
                                >
                                  {prediction.n}
                                  <span className="hot-pick-kill-backtest-prob">
                                    {formatPercent(prediction.killProbability)}
                                  </span>
                                </span>
                              ))}
                            </div>
                            <div className="hot-pick-kill-backtest-meta">
                              平均概率 {formatPercent(item.avgKillProbability)} · 整组全杀估算{' '}
                              {formatPercent(item.groupAllKillProbability)} · 达标数 {item.qualifiedCount}/5
                              <br />
                              实际开出 {item.actual.join(', ')}
                              {item.failed.length > 0 && ` · 误杀 ${item.failed.join(', ')}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {recentOccurrenceStats?.numbers?.length > 0 && (
              <>
                <div className="hot-pick-section-title">近 30 期 1-49 出现期数</div>
                <div className="hot-pick-occurrence-summary">
                  <span className="hot-pick-pill">
                    统计 {recentOccurrenceStats.actualPeriods}/{recentOccurrenceStats.windowSize} 期
                  </span>
                  {recentOccurrenceStats.earliest?.No && (
                    <span className="hot-pick-pill">
                      起始第 {recentOccurrenceStats.earliest.No} 期
                    </span>
                  )}
                  {recentOccurrenceStats.latest?.No && (
                    <span className="hot-pick-pill">
                      截止第 {recentOccurrenceStats.latest.No} 期
                    </span>
                  )}
                  <span className="hot-pick-pill">绿色边框=当前10码</span>
                </div>
                <div className="hot-pick-occurrence-grid">
                  {recentOccurrenceStats.numbers.map((item) => (
                    <div
                      key={item.n}
                      className={`hot-pick-occurrence-cell ${
                        selectedNumbers.has(item.n) ? 'selected' : ''
                      }`}
                      title={`近30期出现 ${item.count} 期，频率 ${formatPercent(item.rate)}，排名 #${item.rank}`}
                    >
                      <div className="hot-pick-occurrence-top">
                        <span className="hot-pick-occurrence-num">{item.n}</span>
                        <span className="hot-pick-occurrence-rank">#{item.rank}</span>
                      </div>
                      <div className="hot-pick-occurrence-count">
                        {item.count}期 · {formatPercent(item.rate)}
                      </div>
                      <div className="hot-pick-occurrence-bar">
                        <div
                          className="hot-pick-occurrence-fill"
                          style={{ width: `${Math.min(100, item.rate)}%` }}
                        />
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
