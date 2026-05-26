import React, { useEffect, useState } from 'react';

export default function HotPickPredictorOpt() {
  const [activeTab, setActiveTab] = useState('default');
  const [hotPick, setHotPick] = useState(null);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [recentOccurrenceStats, setRecentOccurrenceStats] = useState(null);
  const [hotPickKill5, setHotPickKill5] = useState(null);
  const [cacheMeta, setCacheMeta] = useState(null);
  const [cacheAction, setCacheAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyHotPickData = (data) => {
    setHotPick(data.hotPick || null);
    setHistoryMeta(data.historyMeta || null);
    setRecentOccurrenceStats(data.recentOccurrenceStats || null);
    setHotPickKill5(data.hotPickKill5 || null);
    setCacheMeta(data.cacheMeta || null);
  };

  useEffect(() => {
    const fetchHotPick = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = activeTab === 'hk' ? '?type=hk' : '';
        const res = await fetch(`/api/predictor-opt/hot-pick${query}`, { cache: 'no-store' });
        if (!res.ok) {
          const message = await res.text();
          throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
        }
        const data = await res.json();
        applyHotPickData(data);
      } catch (err) {
        console.error(err);
        setError(`命中模块加载失败。${err.message ? `（${err.message}）` : ''}`);
      } finally {
        setLoading(false);
      }
    };

    fetchHotPick();
  }, [activeTab]);

  const runCacheAction = async (action) => {
    setCacheAction(action);
    setError(null);
    try {
      const query = activeTab === 'hk' ? '?type=hk' : '';
      const res = await fetch(`/api/predictor-opt/hot-pick/cache/${action}${query}`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
      }
      const data = await res.json();
      if (action === 'refresh') {
        applyHotPickData(data);
      } else {
        setCacheMeta(data.cacheMeta || null);
      }
    } catch (err) {
      console.error(err);
      setError(`缓存操作失败。${err.message ? `（${err.message}）` : ''}`);
    } finally {
      setCacheAction(null);
    }
  };

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

  const cacheStatusText = () => {
    if (!cacheMeta?.store) return '';
    if (cacheMeta.action === 'cleared') return `缓存 ${cacheMeta.store} 已清空`;
    if (cacheMeta.action === 'refreshed') return `缓存 ${cacheMeta.store} 已重设`;
    return `缓存 ${cacheMeta.store}${cacheMeta.hit ? ' 命中' : ' 已刷新'}`;
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
          background: linear-gradient(135deg, #0f172a 0%, #020617 100%);
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
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 36px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(10px);
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
          color: #f1f5f9;
          background: linear-gradient(to right, #f1f5f9, #94a3b8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hot-pick-subtitle {
          color: #94a3b8;
          font-size: 0.95rem;
          line-height: 1.6;
          max-width: 680px;
        }

        .hot-pick-badge {
          flex-shrink: 0;
          color: #0f172a;
          background: linear-gradient(135deg, #38bdf8, #34d399);
          border-radius: 999px;
          padding: 9px 16px;
          font-size: 0.84rem;
          font-weight: 900;
          box-shadow: 0 4px 14px rgba(56, 189, 248, 0.2);
        }

        .hot-pick-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 24px;
          flex-wrap: wrap;
          align-items: center;
        }

        .hot-pick-tab-btn {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          border-radius: 12px;
          padding: 9px 18px;
          font-size: 0.9rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .hot-pick-tab-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f8fafc;
        }

        .hot-pick-tab-btn.active {
          background: linear-gradient(135deg, #38bdf8, #0284c7);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 4px 12px rgba(56, 189, 248, 0.25);
        }

        .hot-pick-cache-actions {
          display: flex;
          gap: 8px;
          margin-left: auto;
          flex-wrap: wrap;
        }

        .hot-pick-cache-btn {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #94a3b8;
          border-radius: 10px;
          padding: 9px 13px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .hot-pick-cache-btn:hover:not(:disabled) {
          border-color: rgba(56, 189, 248, 0.5);
          color: #f1f5f9;
          background: rgba(56, 189, 248, 0.05);
        }

        .hot-pick-cache-btn:disabled {
          cursor: not-allowed;
          opacity: 0.4;
        }

        .hot-pick-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }

        .hot-pick-pill {
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 0.76rem;
          font-weight: 700;
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
          background: linear-gradient(135deg, #0284c7 0%, #0d9488 100%);
          box-shadow: 0 8px 20px rgba(2, 132, 199, 0.3);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .hot-pick-num:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px rgba(2, 132, 199, 0.4);
        }

        .hot-pick-num-main {
          font-size: 1.25rem;
          line-height: 1;
        }

        .hot-pick-num-prob {
          margin-top: 4px;
          color: #99f6e4;
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
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 18px;
        }

        .hot-pick-prob-main {
          background: rgba(13, 148, 136, 0.08);
          border-color: rgba(20, 184, 166, 0.2);
        }

        .hot-pick-prob-value {
          color: #f8fafc;
          font-size: 1.55rem;
          font-weight: 900;
          margin-bottom: 5px;
        }

        .hot-pick-prob-label {
          color: #64748b;
          font-size: 0.77rem;
          line-height: 1.45;
        }

        .hot-pick-lift {
          color: #10b981;
        }

        .hot-pick-lift.negative {
          color: #f59e0b;
        }

        .hot-pick-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin: 22px 0;
        }

        .hot-pick-stat {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 18px;
        }

        .hot-pick-stat-value {
          color: #f1f5f9;
          font-size: 1.22rem;
          font-weight: 900;
          margin-bottom: 5px;
        }

        .hot-pick-stat-label {
          color: #64748b;
          font-size: 0.78rem;
        }

        .hot-pick-section-title {
          color: #e2e8f0;
          font-size: 1.05rem;
          font-weight: 900;
          margin: 32px 0 16px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .hot-pick-backtest {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }

        .hot-pick-row {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 14px;
        }

        .hot-pick-row-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #94a3b8;
          font-size: 0.78rem;
          font-weight: 800;
          margin-bottom: 10px;
        }

        .hot-pick-row-hit {
          color: #34d399;
          font-weight: 900;
        }

        .hot-pick-row-miss {
          color: #f59e0b;
        }

        .hot-pick-small-nums {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .hot-pick-small-num {
          min-width: 26px;
          height: 26px;
          border-radius: 8px;
          padding: 0 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 0.72rem;
          font-weight: 800;
        }

        .hot-pick-small-num.hit {
          color: #064e3b;
          background: #34d399;
          border-color: #34d399;
          font-weight: 900;
        }

        .hot-pick-contrib-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 12px;
        }

        .hot-pick-contrib {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          padding: 14px;
        }

        .hot-pick-contrib-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: #f1f5f9;
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
          color: #fff;
          background: linear-gradient(135deg, #0d9488, #10b981);
          font-weight: 900;
        }

        .hot-pick-contrib-meta {
          color: #64748b;
          font-size: 0.74rem;
          line-height: 1.55;
        }

        .hot-pick-kill-panel {
          background: rgba(239, 68, 68, 0.03);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 18px;
          padding: 20px;
        }

        .hot-pick-kill-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 16px;
        }

        .hot-pick-kill-title {
          color: #fca5a5;
          font-size: 1.05rem;
          font-weight: 900;
          margin-bottom: 6px;
        }

        .hot-pick-kill-note {
          color: #7f1d1d;
          font-size: 0.78rem;
          line-height: 1.5;
        }

        .hot-pick-kill-badge {
          flex-shrink: 0;
          color: #7f1d1d;
          background: #fecaca;
          border-radius: 999px;
          padding: 7px 14px;
          font-size: 0.76rem;
          font-weight: 900;
        }

        .hot-pick-kill-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }

        .hot-pick-kill-card {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(239, 68, 68, 0.08);
          border-radius: 14px;
          padding: 14px;
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
          background: linear-gradient(135deg, #ef4444, #f43f5e);
          font-weight: 900;
          box-shadow: 0 4px 10px rgba(239, 68, 68, 0.2);
        }

        .hot-pick-kill-prob {
          color: #ef4444;
          font-size: 1rem;
          font-weight: 900;
        }

        .hot-pick-kill-meta {
          color: #64748b;
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
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.12);
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 0.66rem;
          font-weight: 800;
        }

        .hot-pick-kill-backtest-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 10px;
          margin: 18px 0 14px;
          padding-top: 16px;
          border-top: 1px solid rgba(239, 68, 68, 0.1);
        }

        .hot-pick-kill-backtest-stat {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(239, 68, 68, 0.08);
          border-radius: 10px;
          padding: 12px;
        }

        .hot-pick-kill-backtest-value {
          color: #fecaca;
          font-size: 1rem;
          font-weight: 900;
          margin-bottom: 4px;
        }

        .hot-pick-kill-backtest-label {
          color: #64748b;
          font-size: 0.7rem;
        }

        .hot-pick-kill-backtest-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }

        .hot-pick-kill-backtest-row {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(239, 68, 68, 0.08);
          border-radius: 14px;
          padding: 14px;
        }

        .hot-pick-kill-backtest-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #94a3b8;
          font-size: 0.76rem;
          font-weight: 900;
          margin-bottom: 9px;
        }

        .hot-pick-kill-backtest-ok {
          color: #34d399;
          font-weight: 900;
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
          border-radius: 8px;
          padding: 4px 7px;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 0.7rem;
          font-weight: 800;
        }

        .hot-pick-kill-backtest-num.failed {
          color: #7f1d1d;
          background: #fca5a5;
          border-color: #fca5a5;
          font-weight: 900;
        }

        .hot-pick-kill-backtest-prob {
          font-size: 0.58rem;
          opacity: 0.85;
          margin-top: 2px;
        }

        .hot-pick-kill-backtest-meta {
          color: #64748b;
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
          border-radius: 12px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.2s ease;
        }

        .hot-pick-occurrence-cell.selected {
          background: rgba(56, 189, 248, 0.04);
          border-color: rgba(56, 189, 248, 0.35);
          box-shadow: inset 0 0 8px rgba(56, 189, 248, 0.05);
        }

        .hot-pick-occurrence-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-bottom: 7px;
        }

        .hot-pick-occurrence-num {
          color: #f1f5f9;
          font-size: 0.96rem;
          font-weight: 900;
        }

        .hot-pick-occurrence-rank {
          color: #38bdf8;
          font-size: 0.68rem;
          font-weight: 900;
        }

        .hot-pick-occurrence-count {
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .hot-pick-occurrence-bar {
          height: 4px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
        }

        .hot-pick-occurrence-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #38bdf8, #10b981);
        }

        .error-message {
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.15);
          padding: 18px;
          border-radius: 14px;
        }

        .spinner {
          width: 52px;
          height: 52px;
          border: 4px solid rgba(255,255,255,0.08);
          border-top-color: #38bdf8;
          border-radius: 50%;
          animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          margin: 60px auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .action-container {
          margin-top: 36px;
          text-align: center;
        }

        .btn-back {
          display: inline-block;
          padding: 12px 28px;
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
          text-decoration: none;
          border-radius: 999px;
          font-weight: 800;
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.2s ease;
        }

        .btn-back:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          transform: translateY(-1px);
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
          <div className="hot-pick-cache-actions">
            <button
              type="button"
              className="hot-pick-cache-btn"
              disabled={loading || Boolean(cacheAction)}
              onClick={() => runCacheAction('clear')}
            >
              {cacheAction === 'clear' ? '清空中...' : '清空缓存'}
            </button>
            <button
              type="button"
              className="hot-pick-cache-btn"
              disabled={loading || Boolean(cacheAction)}
              onClick={() => runCacheAction('refresh')}
            >
              {cacheAction === 'refresh' ? '重设中...' : '重新设置缓存'}
            </button>
          </div>
        </div>

        {loading && <div className="spinner" />}
        {error && <div className="error-message">{error}</div>}

        {!loading && !error && hotPick && (
          <>
            <div className="hot-pick-header">
              <div>
                <h1 className="hot-pick-title">开出号命中模块 (优化重构版)</h1>
                <div className="hot-pick-subtitle">
                  目标：一期 7 个开奖中，当前选择 {hotPick.selectedCount} 个号，争取命中至少 3 个。{reasonText()}
                </div>
                <div className="hot-pick-meta">
                  <span className="hot-pick-pill">
                    当前库 {activeTab === 'hk' ? '香港 (hk)' : '默认 (default)'}
                  </span>
                  <span className="hot-pick-pill">策略 {formatStrategy(hotPick.selectedStrategy)}</span>
                  {hotPick.diversified && <span className="hot-pick-pill">尾数/区间分散 (Soft Penalty)</span>}
                  {historyMeta?.latest?.No && (
                    <span className="hot-pick-pill">最新第 {historyMeta.latest.No} 期</span>
                  )}
                  {historyMeta?.count && (
                    <span className="hot-pick-pill">历史 {historyMeta.count} 期</span>
                  )}
                  {cacheMeta?.store && (
                    <span className="hot-pick-pill">
                      {cacheStatusText()}
                    </span>
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
                    {hotPick.groupProbability.targetHit}+ 估算概率 (Laplace Smoothed)
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
                <div className="hot-pick-section-title">组合优化 5杀</div>
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
