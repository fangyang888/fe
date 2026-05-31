import React, { useEffect, useState } from 'react';

export default function KillTwoPredictor() {
  const [activeTab, setActiveTab] = useState('default');
  const [killData, setKillData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cacheAction, setCacheAction] = useState(null);

  const fetchKillData = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = activeTab === 'hk' ? '?type=hk' : '';
      const res = await fetch(`/api/predictor-opt/kill2${query}`, { cache: 'no-store' });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
      }
      const data = await res.json();
      setKillData(data);
    } catch (err) {
      console.error(err);
      setError(`加载排除数据失败。${err.message ? `（${err.message}）` : ''}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKillData();
  }, [activeTab]);

  const runCacheAction = async (action) => {
    setCacheAction(action);
    setError(null);
    try {
      const query = activeTab === 'hk' ? '?type=hk' : '';
      const res = await fetch(`/api/predictor-opt/kill2/cache/${action}${query}`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
      }
      const data = await res.json();
      if (action === 'refresh') {
        setKillData(data);
      } else if (data.cacheMeta) {
        setKillData((prev) => prev ? { ...prev, cacheMeta: data.cacheMeta } : null);
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

  const cacheStatusText = () => {
    const meta = killData?.cacheMeta;
    if (!meta?.store) return '';
    if (meta.action === 'cleared') return `缓存 ${meta.store} 已清空`;
    if (meta.action === 'refreshed') return `缓存 ${meta.store} 已重建`;
    return `缓存 ${meta.store}${meta.hit ? ' 命中' : ' 已刷新'}`;
  };

  const predictions = killData?.predictions || [];
  const candidates = killData?.candidates || [];
  const backtest = killData?.backtest || null;
  const historyMeta = killData?.historyMeta || null;
  const strictValidation = killData?.strictValidation === true;

  return (
    <div className="kill-two-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .kill-two-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #09090e 0%, #111122 50%, #07070b 100%);
          color: #fff;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          padding: 56px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .kill-two-card {
          width: 100%;
          max-width: 980px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 24px;
          padding: 36px;
          box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(12px);
        }

        .kill-two-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 28px;
        }

        .kill-two-title {
          font-size: 2.3rem;
          font-weight: 900;
          margin: 0 0 10px 0;
          background: linear-gradient(to right, #a78bfa, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .kill-two-subtitle {
          color: #94a3b8;
          font-size: 0.95rem;
          line-height: 1.6;
          max-width: 720px;
        }

        .kill-two-badge {
          flex-shrink: 0;
          color: #fff;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          border-radius: 999px;
          padding: 9px 18px;
          font-size: 0.86rem;
          font-weight: 800;
          box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .kill-two-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 28px;
          flex-wrap: wrap;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 16px;
        }

        .kill-two-tab-btn {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #cbd5e1;
          border-radius: 12px;
          padding: 9px 20px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .kill-two-tab-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
        }

        .kill-two-tab-btn.active {
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        }

        .kill-two-cache-actions {
          display: flex;
          gap: 8px;
          margin-left: auto;
          flex-wrap: wrap;
        }

        .kill-two-cache-btn {
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          color: #94a3b8;
          border-radius: 10px;
          padding: 8px 14px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .kill-two-cache-btn:hover:not(:disabled) {
          border-color: rgba(139, 92, 246, 0.5);
          color: #f1f5f9;
          background: rgba(139, 92, 246, 0.05);
        }

        .kill-two-cache-btn:disabled {
          cursor: not-allowed;
          opacity: 0.4;
        }

        .kill-two-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }

        .kill-two-pill {
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 0.76rem;
          font-weight: 700;
        }

        .kill-two-center-panel {
          background: rgba(124, 58, 237, 0.03);
          border: 1px solid rgba(124, 58, 237, 0.15);
          border-radius: 20px;
          padding: 30px;
          margin: 24px 0;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .kill-two-center-panel::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(124, 58, 237, 0.08) 0%, transparent 60%);
          pointer-events: none;
        }

        .kill-two-nums {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin: 20px 0;
        }

        .kill-two-num-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .kill-two-num-ball {
          width: 88px;
          height: 88px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 900;
          font-size: 2.2rem;
          background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
          box-shadow: 0 10px 25px rgba(239, 68, 68, 0.4);
          border: 2px solid rgba(255, 255, 255, 0.15);
          animation: pulse 2s infinite alternate;
        }

        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 10px 25px rgba(239, 68, 68, 0.4); }
          100% { transform: scale(1.05); box-shadow: 0 15px 35px rgba(239, 68, 68, 0.6); }
        }

        .kill-two-num-ball.cyan {
          background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
          box-shadow: 0 10px 25px rgba(6, 182, 212, 0.4);
        }
        .kill-two-num-ball.cyan:hover {
          box-shadow: 0 15px 35px rgba(6, 182, 212, 0.6);
        }

        .kill-two-num-prob {
          margin-top: 10px;
          color: #fca5a5;
          font-size: 0.85rem;
          font-weight: 800;
        }

        .kill-two-num-desc {
          margin-top: 4px;
          color: #64748b;
          font-size: 0.72rem;
        }

        .kill-two-note {
          color: #c084fc;
          font-weight: 700;
          font-size: 0.95rem;
          margin-top: 14px;
          line-height: 1.6;
        }

        .kill-two-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin: 24px 0;
        }

        .kill-two-stat-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 20px;
          text-align: center;
          transition: border-color 0.2s;
        }

        .kill-two-stat-card:hover {
          border-color: rgba(139, 92, 246, 0.2);
        }

        .kill-two-stat-value {
          color: #f8fafc;
          font-size: 1.8rem;
          font-weight: 900;
          margin-bottom: 6px;
          background: linear-gradient(to right, #fff, #cbd5e1);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .kill-two-stat-value.highlight {
          background: linear-gradient(to right, #34d399, #10b981);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .kill-two-stat-label {
          color: #64748b;
          font-size: 0.78rem;
          font-weight: 600;
        }

        .kill-two-section-title {
          color: #f1f5f9;
          font-size: 1.1rem;
          font-weight: 900;
          margin: 36px 0 16px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          border-left: 3px solid #8b5cf6;
          padding-left: 10px;
        }

        .security-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }

        .security-item {
          background: rgba(16, 185, 129, 0.03);
          border: 1px solid rgba(16, 185, 129, 0.15);
          border-radius: 12px;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .security-icon {
          color: #10b981;
          font-size: 1.2rem;
          font-weight: 900;
        }

        .security-text {
          color: #a7f3d0;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .backtest-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 14px;
        }

        .backtest-row {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 16px;
          transition: border-color 0.2s;
        }

        .backtest-row:hover {
          border-color: rgba(255, 255, 255, 0.1);
        }

        .backtest-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .backtest-period {
          color: #94a3b8;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .backtest-status {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
          font-size: 0.72rem;
          font-weight: 900;
          padding: 3px 8px;
          border-radius: 999px;
        }

        .backtest-status.failed {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .backtest-nums {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
        }

        .backtest-num-badge {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 8px;
        }

        .backtest-num-badge.hit {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #fca5a5;
        }

        .backtest-meta {
          color: #64748b;
          font-size: 0.7rem;
          line-height: 1.5;
        }

        .candidates-table-container {
          overflow-x: auto;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          margin-top: 12px;
        }

        .candidates-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.85rem;
        }

        .candidates-table th,
        .candidates-table td {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .candidates-table th {
          color: #64748b;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
        }

        .candidates-table td {
          color: #cbd5e1;
        }

        .candidates-table tr:hover td {
          background: rgba(255, 255, 255, 0.01);
          color: #fff;
        }

        .candidate-num {
          font-weight: 900;
          color: #f59e0b;
        }

        .spinner {
          width: 52px;
          height: 52px;
          border: 4px solid rgba(255, 255, 255, 0.08);
          border-top-color: #8b5cf6;
          border-radius: 50%;
          animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          margin: 80px auto;
        }

        .error-message {
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.15);
          padding: 20px;
          border-radius: 16px;
          margin: 20px 0;
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
          padding: 12px 30px;
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
          text-decoration: none;
          border-radius: 999px;
          font-weight: 800;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.2s ease;
        }

        .btn-back:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.2);
        }
      `}} />

      <div className="kill-two-card">
        <div className="kill-two-tabs">
          <button
            type="button"
            className={`kill-two-tab-btn ${activeTab === 'default' ? 'active' : ''}`}
            onClick={() => setActiveTab('default')}
          >
            默认数据
          </button>
          <button
            type="button"
            className={`kill-two-tab-btn ${activeTab === 'hk' ? 'active' : ''}`}
            onClick={() => setActiveTab('hk')}
          >
            香港数据
          </button>

          <div className="kill-two-cache-actions">
            <button
              type="button"
              className="kill-two-cache-btn"
              disabled={loading || !!cacheAction}
              onClick={() => runCacheAction('clear')}
            >
              {cacheAction === 'clear' ? '清空中...' : '清空缓存'}
            </button>
            <button
              type="button"
              className="kill-two-cache-btn"
              disabled={loading || !!cacheAction}
              onClick={() => runCacheAction('refresh')}
            >
              {cacheAction === 'refresh' ? '重建中...' : '重新生成缓存'}
            </button>
          </div>
        </div>

        {loading && <div className="spinner" />}
        {error && <div className="error-message">{error}</div>}

        {!loading && !error && killData && (
          <>
            <div className="kill-two-header">
              <div>
                <h1 className="kill-two-title">稳健双号排除</h1>
                <div className="kill-two-subtitle">
                  根据号码自身出现周期筛选参考排除号，避开进入回补区间的冷号，并展示近 30 期滚动回测结果。
                </div>
                <div className="kill-two-meta">
                  <span className="kill-two-pill">数据源: {activeTab === 'hk' ? '香港 (hk)' : '默认 (default)'}</span>
                  <span className="kill-two-pill">最新期: {historyMeta?.latest?.No ? `第 ${historyMeta.latest.No} 期` : '--'}</span>
                  <span className="kill-two-pill">历史样本: {historyMeta?.count || 0} 期</span>
                  {killData?.cacheMeta?.store && <span className="kill-two-pill">{cacheStatusText()}</span>}
                </div>
              </div>
              <div className="kill-two-badge">
                {strictValidation ? '严格校验通过' : '参考模式'}
              </div>
            </div>

            <div className="kill-two-center-panel">
              <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#a78bfa' }}>
                【下期排除号码推荐】
              </h3>
              
              {predictions.length > 0 ? (
                <div className="kill-two-nums">
                  {predictions.map((p, idx) => (
                    <div key={p.n} className="kill-two-num-wrapper">
                      <div className={`kill-two-num-ball ${idx === 1 ? 'cyan' : ''}`}>
                        {String(p.n).padStart(2, '0')}
                      </div>
                      <div className="kill-two-num-prob">
                        参考评分: {formatPercent(p.killProbability)}
                      </div>
                      <div className="kill-two-num-desc">
                        当前遗漏 {p.gap} 期 / 平均 {p.avgGap} 期
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px 0', color: '#94a3b8', fontWeight: 700 }}>
                  当前历史数据不足，暂时无法筛选参考排除号。
                </div>
              )}

              <div className="kill-two-note">
                诊断：{killData?.note}
              </div>
            </div>

            <div className="kill-two-section-title">自适应风控锁定状态</div>
            <div className="security-grid">
              <div className="security-item">
                <span className="security-icon">✓</span>
                <span className="security-text">马尔可夫反弹防线已锁定</span>
              </div>
              <div className="security-item">
                <span className="security-icon">✓</span>
                <span className="security-text">极端遗漏隔离锁启用</span>
              </div>
              <div className="security-item">
                <span className="security-icon">✓</span>
                <span className="security-text">尾数/区间分散互斥锁</span>
              </div>
              <div className="security-item">
                <span className="security-icon">✓</span>
                <span className="security-text">
                  {strictValidation ? '近30期严格滚动校验已通过' : '近30期滚动回测仅供参考'}
                </span>
              </div>
            </div>

            {backtest && (
              <>
                <div className="kill-two-stats">
                  <div className="kill-two-stat-card">
                    <div className="kill-two-stat-value highlight">
                      {formatPercent(backtest.allCorrectRate)}
                    </div>
                    <div className="kill-two-stat-label">近 {backtest.calcPeriods} 期全中达成率</div>
                  </div>
                  <div className="kill-two-stat-card">
                    <div className="kill-two-stat-value">
                      {formatPercent(backtest.overallAccuracy)}
                    </div>
                    <div className="kill-two-stat-label">滚动单号杀码准确率</div>
                  </div>
                  <div className="kill-two-stat-card">
                    <div className="kill-two-stat-value">
                      {backtest.allCorrectPeriods} / {backtest.calcPeriods}
                    </div>
                    <div className="kill-two-stat-label">0 误杀达成期数</div>
                  </div>
                  <div className="kill-two-stat-card">
                    <div className="kill-two-stat-value">
                      73.2%
                    </div>
                    <div className="kill-two-stat-label">随机 2杀 基准概率</div>
                  </div>
                </div>

                <div className="kill-two-section-title">近 {backtest.calcPeriods} 期排除滚动演练历程</div>
                <div className="backtest-list">
                  {backtest.details?.slice(0, 15).map((d) => (
                    <div key={d.periodOffset} className="backtest-row">
                      <div className="backtest-top">
                        <span className="backtest-period">倒数第 {d.periodOffset} 期</span>
                        <span className={`backtest-status ${d.failed?.length > 0 ? 'failed' : ''}`}>
                          {d.failed?.length > 0 ? `误杀 ${d.failed.length} 码` : '成功 (0误杀)'}
                        </span>
                      </div>
                      <div className="backtest-nums">
                        {d.predicted?.map((pNum) => {
                          const isFailed = d.failed?.includes(pNum.n);
                          return (
                            <span key={pNum.n} className={`backtest-num-badge ${isFailed ? 'hit' : ''}`}>
                              排除 {String(pNum.n).padStart(2, '0')} ({formatPercent(pNum.killProbability)})
                            </span>
                          );
                        })}
                      </div>
                      <div className="backtest-meta">
                        实际开出: {d.actual?.join(', ') || '--'}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {candidates.length > 0 && (
              <>
                <div className="kill-two-section-title">周期安全候选号特征排行</div>
                <div className="candidates-table-container">
                  <table className="candidates-table">
                    <thead>
                      <tr>
                        <th>号码</th>
                        <th>参考排除评分</th>
                        <th>历史杀码率</th>
                        <th>近况出现次数</th>
                        <th>遗漏周期</th>
                        <th>近30期状态</th>
                        <th>共识数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.slice(0, 8).map((c) => (
                        <tr key={c.n}>
                          <td className="candidate-num">{String(c.n).padStart(2, '0')}</td>
                          <td>{formatPercent(c.killProbability)}</td>
                          <td>{formatPercent(c.historyKillRate)}</td>
                          <td>30期内开出 {c.recentCount} 次</td>
                          <td>{c.gap} / {c.avgGap} 期 ({formatPercent((c.gapRatio || 0) * 100)})</td>
                          <td>
                            {c.recentCount <= 1 ? '近期低频' : c.recentCount >= 6 ? '近期活跃' : '近期常规'}
                          </td>
                          <td>{c.consensus} / 4 模型共识</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
