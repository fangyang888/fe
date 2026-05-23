import React, { useEffect, useState } from 'react';

export default function KillSevenStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/predictor/kill-seven', { cache: 'no-store' });
        if (!res.ok) {
          const message = await res.text();
          throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
        }
        setData(await res.json());
      } catch (err) {
        console.error(err);
        setError(`7码统计加载失败。${err.message ? `（${err.message}）` : ''}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const generateCache = async () => {
    setCacheLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/predictor/kill-seven/cache/refresh', {
        method: 'POST',
        cache: 'no-store',
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
      }
      setData(await res.json());
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(`缓存生成失败。${err.message ? `（${err.message}）` : ''}`);
    } finally {
      setCacheLoading(false);
    }
  };

  const formatPercent = (value, digits = 1) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '--';
    return `${value.toFixed(digits)}%`;
  };

  const result = data?.killSeven;

  return (
    <div className="kill-seven-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .kill-seven-page {
          min-height: 100vh;
          background: #0b1120;
          color: #f8fafc;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          padding: 42px 18px;
        }
        .kill-seven-shell {
          width: 100%;
          max-width: 1080px;
          margin: 0 auto;
        }
        .kill-seven-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 22px;
        }
        .kill-seven-title {
          margin: 0 0 8px;
          font-size: 2rem;
          font-weight: 900;
          color: #f8fafc;
        }
        .kill-seven-subtitle {
          color: #94a3b8;
          line-height: 1.6;
          font-size: 0.95rem;
          max-width: 740px;
        }
        .kill-seven-badge {
          flex-shrink: 0;
          padding: 9px 14px;
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.14);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #86efac;
          font-size: 0.82rem;
          font-weight: 900;
        }
        .kill-seven-badge.warn {
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.32);
          color: #fbbf24;
        }
        .kill-seven-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
        }
        .kill-seven-cache-btn {
          border: 1px solid rgba(147, 197, 253, 0.32);
          background: rgba(59, 130, 246, 0.12);
          color: #bfdbfe;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 0.84rem;
          font-weight: 900;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }
        .kill-seven-cache-btn:hover {
          background: rgba(59, 130, 246, 0.2);
          border-color: rgba(147, 197, 253, 0.52);
          color: #eff6ff;
        }
        .kill-seven-cache-btn.busy {
          color: #93c5fd;
          cursor: progress;
        }
        .kill-seven-cache-meta {
          color: #64748b;
          font-size: 0.72rem;
          text-align: right;
          max-width: 260px;
          line-height: 1.4;
        }
        .kill-seven-card {
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 8px;
          padding: 22px;
          margin-bottom: 16px;
        }
        .kill-seven-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }
        .kill-seven-stat {
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 8px;
          padding: 14px;
        }
        .kill-seven-stat-value {
          font-size: 1.3rem;
          font-weight: 900;
          color: #f8fafc;
          margin-bottom: 4px;
        }
        .kill-seven-stat-label {
          color: #64748b;
          font-size: 0.76rem;
        }
        .kill-seven-nums {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin: 18px 0 8px;
        }
        .kill-seven-num {
          width: 68px;
          min-height: 76px;
          border-radius: 8px;
          background: linear-gradient(135deg, #ef4444, #f97316);
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          box-shadow: 0 10px 20px rgba(239, 68, 68, 0.2);
        }
        .kill-seven-num-main { font-size: 1.35rem; }
        .kill-seven-num-rate { font-size: 0.68rem; margin-top: 5px; color: #fee2e2; }
        .kill-seven-section-title {
          font-weight: 900;
          color: #e2e8f0;
          margin: 4px 0 12px;
          font-size: 1rem;
        }
        .kill-seven-source-grid,
        .kill-seven-detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }
        .kill-seven-source,
        .kill-seven-detail {
          background: rgba(15, 23, 42, 0.58);
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 8px;
          padding: 14px;
        }
        .kill-seven-source-top,
        .kill-seven-detail-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #cbd5e1;
          font-size: 0.82rem;
          font-weight: 900;
          margin-bottom: 10px;
        }
        .kill-seven-small-nums {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .kill-seven-small-num {
          min-width: 28px;
          height: 28px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          color: #cbd5e1;
          font-size: 0.76rem;
          font-weight: 900;
        }
        .kill-seven-small-num.failed {
          background: #fecaca;
          border-color: #fecaca;
          color: #7f1d1d;
        }
        .kill-seven-small-num.selected {
          background: #f97316;
          border-color: #f97316;
          color: #fff;
        }
        .kill-seven-muted {
          color: #64748b;
          font-size: 0.76rem;
          line-height: 1.55;
          margin-top: 10px;
        }
        .kill-seven-error {
          padding: 16px;
          border-radius: 8px;
          border: 1px solid rgba(248, 113, 113, 0.28);
          color: #fecaca;
          background: rgba(127, 29, 29, 0.18);
        }
        .kill-seven-loading {
          padding: 34px;
          color: #94a3b8;
          text-align: center;
        }
        .kill-seven-back {
          display: inline-block;
          margin-top: 10px;
          color: #93c5fd;
          text-decoration: none;
          font-weight: 800;
        }
      ` }} />

      <div className="kill-seven-shell">
        <div className="kill-seven-header">
          <div>
            <h1 className="kill-seven-title">7码全中统计精选</h1>
            <div className="kill-seven-subtitle">
              汇总 HotPickPredictor 5杀、KillPredictor 10杀、NewKillPredictor 10杀，按历史回测统计筛选当前 7 个杀码。
            </div>
          </div>
          <div className="kill-seven-actions">
            {result && (
              <div className={`kill-seven-badge ${result.thresholdMet ? '' : 'warn'}`}>
                {result.thresholdMet ? '已达90%+' : '未达90%'}
              </div>
            )}
            <button
              type="button"
              className={`kill-seven-cache-btn ${cacheLoading ? 'busy' : ''}`}
              onClick={generateCache}
            >
              {cacheLoading ? '生成中...' : '生成缓存'}
            </button>
            {data?.cacheMeta && (
              <div className="kill-seven-cache-meta">
                缓存 {data.cacheMeta.store}{data.cacheMeta.hit ? ' 命中' : ' 已生成'}
              </div>
            )}
          </div>
        </div>

        {loading && <div className="kill-seven-card kill-seven-loading">正在计算历史统计...</div>}
        {error && <div className="kill-seven-error">{error}</div>}

        {!loading && !error && result && (
          <>
            <div className="kill-seven-card">
              <div className="kill-seven-stats">
                <div className="kill-seven-stat">
                  <div className="kill-seven-stat-value">{formatPercent(result.backtest?.allCorrectRate)}</div>
                  <div className="kill-seven-stat-label">7码整组全中率</div>
                </div>
                <div className="kill-seven-stat">
                  <div className="kill-seven-stat-value">
                    {result.backtest?.allCorrectPeriods}/{result.backtest?.calcPeriods}
                  </div>
                  <div className="kill-seven-stat-label">全中期数</div>
                </div>
                <div className="kill-seven-stat">
                  <div className="kill-seven-stat-value">{formatPercent(result.targetAllCorrectRate, 0)}</div>
                  <div className="kill-seven-stat-label">目标阈值</div>
                </div>
                <div className="kill-seven-stat">
                  <div className="kill-seven-stat-value">{data.historyMeta?.count || '--'}</div>
                  <div className="kill-seven-stat-label">历史样本</div>
                </div>
              </div>

              <div className="kill-seven-nums">
                {(result.selected || []).map((item) => (
                  <div key={item.n} className="kill-seven-num" title={(item.sources || []).join(' / ')}>
                    <span className="kill-seven-num-main">{item.n}</span>
                    <span className="kill-seven-num-rate">{formatPercent(item.periodKillRate)}</span>
                  </div>
                ))}
              </div>
              <div className="kill-seven-muted">{result.note}</div>
            </div>

            <div className="kill-seven-card">
              <div className="kill-seven-section-title">来源算法当前结果</div>
              <div className="kill-seven-source-grid">
                {(result.sources || []).map((source) => (
                  <div key={source.key} className="kill-seven-source">
                    <div className="kill-seven-source-top">
                      <span>{source.name}</span>
                      <span>{formatPercent(source.stats?.allCorrectRate)}</span>
                    </div>
                    <div className="kill-seven-small-nums">
                      {(source.numbers || []).map((n) => (
                        <span
                          key={n}
                          className={`kill-seven-small-num ${
                            (result.selected || []).some((item) => item.n === n) ? 'selected' : ''
                          }`}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                    <div className="kill-seven-muted">
                      单号准确率 {formatPercent(source.stats?.singleAccuracy)} · 全中 {source.stats?.allCorrectPeriods}/{source.stats?.calcPeriods}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="kill-seven-card">
              <div className="kill-seven-section-title">近10期7码回测明细</div>
              <div className="kill-seven-detail-grid">
                {(result.backtest?.details || []).map((item) => (
                  <div key={item.periodOffset} className="kill-seven-detail">
                    <div className="kill-seven-detail-top">
                      <span>倒数第 {item.periodOffset} 期</span>
                      <span>{item.correctCount}/7 · {formatPercent(item.accuracy)}</span>
                    </div>
                    <div className="kill-seven-small-nums">
                      {(item.predicted || []).map((n) => (
                        <span
                          key={n}
                          className={`kill-seven-small-num ${(item.failed || []).includes(n) ? 'failed' : ''}`}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                    <div className="kill-seven-muted">
                      实际 {item.actual?.join(', ')}
                      {(item.failed || []).length > 0 ? ` · 误杀 ${item.failed.join(', ')}` : ' · 无误杀'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <a href="/fe/kill/new" className="kill-seven-back">返回杀码主页面</a>
          </>
        )}
      </div>
    </div>
  );
}
