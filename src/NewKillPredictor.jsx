import React, { useState, useEffect } from 'react';

// Calculation logic has been moved to the backend PredictorService

// ================================================================
// Component
// ================================================================

export default function NewKillPredictor() {
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState([]);
  const [specialCode, setSpecialCode] = useState(null);
  const [backtestStats, setBacktestStats] = useState(null);
  const [engineInfo, setEngineInfo] = useState(null);
  const [modelComparison, setModelComparison] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/predictor/kill');
        if (!res.ok) {
          const message = await res.text();
          throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
        }
        const data = await res.json();
        
        if (data && data.predictions) {
          setPredictions(data.predictions);
          setSpecialCode(data.specialCode || null);
          setBacktestStats(data.engineBacktestStats || data.probabilityBacktestStats || data.backtestStats);
          setEngineInfo(data.repulsionInfo?.engine || null);
          setModelComparison(data.repulsionInfo?.modelComparison || []);
          setLoading(false);
        } else {
          throw new Error('Invalid data format');
        }
      } catch (err) {
        console.error(err);
        setError(`连接服务端 AI 预测引擎失败，请检查后端服务是否运行。${err.message ? `（${err.message}）` : ''}`);
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const formatPercent = (value, digits = 1) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '--';
    return `${value.toFixed(digits)}%`;
  };

  const formatRisk = (risk) => {
    if (risk === 'low') return '低风险';
    if (risk === 'mid') return '中风险';
    if (risk === 'watch') return '观察';
    return '未评级';
  };

  const formatModelName = (name) => {
    const names = {
      lowRisk: '低风险',
      frequency: '频率',
      repulsion: '排斥',
      markov: '马尔可夫',
      markov2: '二阶',
      knn: 'KNN',
      bayes: '贝叶斯',
      'ensemble-current': '当前 Ensemble',
      'ensemble-strict-hard': '全中优先',
      probability: '出现概率',
      'low-risk': '低风险',
    };
    return names[name] || name;
  };

  return (
    <div className="new-kill-predictor-container">
      <style dangerouslySetInnerHTML={{ __html: `
        .new-kill-predictor-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
          color: #fff;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          padding: 60px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 50px;
          max-width: 900px;
          width: 100%;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          animation: fadeIn 0.8s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .header-section {
          text-align: center;
          margin-bottom: 50px;
        }

        .title {
          font-size: 3rem;
          font-weight: 800;
          background: linear-gradient(to right, #60a5fa, #c084fc, #f472b6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0 0 15px 0;
          letter-spacing: -1px;
        }

        .subtitle {
          color: #94a3b8;
          font-size: 1.1rem;
          max-width: 600px;
          margin: 0 auto;
          line-height: 1.6;
        }

        .predictions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 25px;
        }

        .engine-panel {
          width: 100%;
          margin-bottom: 32px;
          background: rgba(15, 23, 42, 0.58);
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 18px;
          padding: 22px;
        }

        .engine-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 18px;
        }

        .engine-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: #e2e8f0;
          margin-bottom: 6px;
        }

        .engine-subtitle {
          color: #94a3b8;
          font-size: 0.86rem;
          line-height: 1.5;
        }

        .engine-badge {
          flex-shrink: 0;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.14);
          border: 1px solid rgba(34, 197, 94, 0.24);
          color: #86efac;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .engine-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }

        .engine-metric {
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 14px;
        }

        .engine-metric-value {
          color: #f8fafc;
          font-size: 1.18rem;
          font-weight: 800;
          margin-bottom: 4px;
          word-break: break-word;
        }

        .engine-metric-label {
          color: #94a3b8;
          font-size: 0.78rem;
        }

        .model-weight-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 10px;
        }

        .model-weight-item {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.055);
          border-radius: 12px;
          padding: 12px;
        }

        .model-weight-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #e2e8f0;
          font-size: 0.84rem;
          font-weight: 700;
          margin-bottom: 9px;
        }

        .weight-bar {
          height: 7px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.16);
          overflow: hidden;
          margin-bottom: 8px;
        }

        .weight-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #38bdf8, #a78bfa, #f472b6);
        }

        .model-weight-meta {
          color: #94a3b8;
          font-size: 0.74rem;
        }

        .comparison-table {
          width: 100%;
          margin-top: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          overflow: hidden;
        }

        .comparison-row {
          display: grid;
          grid-template-columns: 1.3fr repeat(3, 1fr);
          gap: 10px;
          padding: 11px 13px;
          background: rgba(255, 255, 255, 0.022);
          border-bottom: 1px solid rgba(255, 255, 255, 0.055);
          align-items: center;
          font-size: 0.78rem;
          color: #cbd5e1;
        }

        .comparison-row:last-child {
          border-bottom: 0;
        }

        .comparison-row.header {
          background: rgba(148, 163, 184, 0.08);
          color: #94a3b8;
          font-weight: 800;
        }

        .comparison-row.active {
          background: rgba(34, 197, 94, 0.08);
          color: #e2e8f0;
        }

        .model-name {
          font-weight: 800;
          color: #f8fafc;
        }

        .special-grid {
          grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
          gap: 14px;
        }

        .special-grid .ball-card {
          padding: 18px 10px;
          border-radius: 14px;
        }

        .special-grid .ball {
          width: 52px;
          height: 52px;
          font-size: 1.25rem;
          margin-bottom: 12px;
          background: linear-gradient(135deg, #06b6d4, #22c55e);
        }

        .special-grid .confidence {
          font-size: 0.78rem;
        }

        .ball-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 25px 15px;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .predictions-grid:not(.special-grid) .ball-card {
          align-items: stretch;
          min-height: 312px;
        }

        .predictions-grid:not(.special-grid) .ball,
        .predictions-grid:not(.special-grid) .confidence,
        .predictions-grid:not(.special-grid) .tier-label,
        .predictions-grid:not(.special-grid) .risk-chip {
          align-self: center;
        }

        .ball-card:hover {
          transform: translateY(-8px);
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(192, 132, 252, 0.4);
          box-shadow: 0 15px 35px -10px rgba(192, 132, 252, 0.25);
        }

        .ball {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          font-weight: 800;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.4), 0 8px 16px rgba(0, 0, 0, 0.4);
          margin-bottom: 20px;
          color: #fff;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
          position: relative;
          z-index: 2;
        }

        .ball::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%);
          z-index: 1;
        }

        .ball-card.tier-s1 .ball {
          background: linear-gradient(135deg, #ef4444, #f97316);
        }
        .ball-card.tier-s1 {
          border-color: rgba(239, 68, 68, 0.2);
        }

        .ball-card.tier-s2 .ball {
          background: linear-gradient(135deg, #f59e0b, #eab308);
        }
        
        .ball-card.tier-c2 .ball {
          background: linear-gradient(135deg, #10b981, #14b8a6);
        }

        .rank-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.4);
          font-weight: 700;
        }

        .confidence {
          font-size: 0.9rem;
          color: #e2e8f0;
          text-align: center;
          font-weight: 600;
        }
        
        .tier-label {
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 12px;
          margin-top: 8px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        
        .tier-s1 .tier-label { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
        .tier-s2 .tier-label { background: rgba(245, 158, 11, 0.2); color: #fcd34d; }
        .tier-s3 .tier-label { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }
        .tier-c2 .tier-label { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }

        .risk-chip {
          font-size: 0.72rem;
          padding: 4px 9px;
          border-radius: 999px;
          margin-top: 8px;
          font-weight: 800;
        }

        .risk-low {
          background: rgba(34, 197, 94, 0.16);
          color: #86efac;
        }

        .risk-mid {
          background: rgba(245, 158, 11, 0.16);
          color: #fcd34d;
        }

        .risk-watch {
          background: rgba(56, 189, 248, 0.14);
          color: #7dd3fc;
        }

        .prediction-details {
          width: 100%;
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #cbd5e1;
          font-size: 0.76rem;
          margin-bottom: 8px;
        }

        .detail-row span:first-child {
          color: #94a3b8;
        }

        .reason-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .reason-chip {
          color: #bae6fd;
          background: rgba(14, 165, 233, 0.12);
          border: 1px solid rgba(14, 165, 233, 0.2);
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 0.7rem;
          line-height: 1.2;
        }

        .vote-list {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 8px;
        }

        .vote-chip {
          color: #ddd6fe;
          background: rgba(139, 92, 246, 0.12);
          border: 1px solid rgba(139, 92, 246, 0.18);
          border-radius: 8px;
          padding: 4px 6px;
          font-size: 0.68rem;
        }

        .spinner {
          width: 60px;
          height: 60px;
          border: 4px solid rgba(255,255,255,0.1);
          border-top-color: #c084fc;
          border-radius: 50%;
          animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          margin: 60px auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-message {
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          margin-top: 20px;
        }
        
        .glow {
          position: absolute;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(0,0,0,0) 70%);
          top: -150px;
          right: -150px;
          border-radius: 50%;
          z-index: 0;
          pointer-events: none;
        }
        
        .action-container {
          margin-top: 50px;
          text-align: center;
        }
        
        .btn-back {
          display: inline-block;
          padding: 12px 30px;
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          text-decoration: none;
          border-radius: 30px;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.3s;
        }
        
        .btn-back:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-2px);
        }

        .backtest-section {
          width: 100%;
          margin-top: 40px;
          padding-top: 40px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .section-title {
          font-size: 1.5rem;
          font-weight: 700;
          text-align: center;
          color: #e2e8f0;
          margin-bottom: 30px;
        }

        .stats-overview {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 30px;
          margin-bottom: 30px;
        }

        .stat-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 20px 30px;
          text-align: center;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 800;
          color: #c084fc;
          margin-bottom: 5px;
        }

        .stat-label {
          font-size: 0.9rem;
          color: #94a3b8;
        }

        .backtest-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .backtest-item {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 20px;
        }

        .bt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          font-weight: 600;
          color: #cbd5e1;
        }

        .bt-acc.perfect { color: #10b981; }
        .bt-acc.good { color: #f59e0b; }
        .bt-acc.bad { color: #fca5a5; }

        .bt-row {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
        }
        .bt-row:last-child { margin-bottom: 0; }

        .bt-label {
          width: 75px;
          font-size: 0.85rem;
          color: #94a3b8;
          flex-shrink: 0;
        }
        .bt-label.error { color: #fca5a5; }

        .bt-nums {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .bt-num {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
        }

        .bt-num.success {
          background: rgba(16, 185, 129, 0.2);
          color: #6ee7b7;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .bt-num.failed {
          background: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .bt-num.actual {
          background: rgba(14, 165, 233, 0.2);
          color: #7dd3fc;
          border: 1px solid rgba(14, 165, 233, 0.35);
        }
      ` }} />
      
      <div className="glow"></div>
      
      <div className="glass-card">
        <div className="header-section">
          <h1 className="title">服务端深度预测引擎</h1>
          <p className="subtitle">基于服务端自适应概率模型，优先展示下期最不可能出现的高置信杀码，避免低把握号码稀释准确率。</p>
        </div>

        {loading ? (
          <div>
            <div className="spinner"></div>
            <p style={{ textAlign: 'center', color: '#94a3b8' }}>正在连接服务端集群进行多维网格深度推演...</p>
          </div>
        ) : error ? (
          <div className="error-message">
            ⚠️ {error}
          </div>
        ) : (
          <>
            {engineInfo && (
              <div className="engine-panel">
                <div className="engine-header">
                  <div>
                    <div className="engine-title">Ensemble 回测驱动引擎</div>
                    <div className="engine-subtitle">
                      最近 {engineInfo.evalPeriods || '--'} 期滚动评估 · 当前模式 {engineInfo.selectedModeLabel || formatModelName(engineInfo.selectedMode)} · 主模型 {formatModelName(engineInfo.topModel)} · 自动保护 {engineInfo.guardrails?.protectedCount ?? '--'} 个高误杀风险号
                    </div>
                  </div>
                  <div className="engine-badge">{engineInfo.selectedMode || engineInfo.mode || 'ensemble'}</div>
                </div>

                <div className="engine-metrics">
                  <div className="engine-metric">
                    <div className="engine-metric-value">{formatPercent(engineInfo.backtestSummary?.overallAccuracy)}</div>
                    <div className="engine-metric-label">Ensemble 回测准确率</div>
                  </div>
                  <div className="engine-metric">
                    <div className="engine-metric-value">{formatPercent(engineInfo.backtestSummary?.allCorrectRate)}</div>
                    <div className="engine-metric-label">{engineInfo.killCount || predictions.length}杀全中率</div>
                  </div>
                  <div className="engine-metric">
                    <div className="engine-metric-value">{formatPercent(engineInfo.backtestSummary?.ninePlusRate)}</div>
                    <div className="engine-metric-label">最多错 1 个占比</div>
                  </div>
                  <div className="engine-metric">
                    <div className="engine-metric-value">{formatPercent(engineInfo.backtestSummary?.randomLift)}</div>
                    <div className="engine-metric-label">相对随机全中提升</div>
                  </div>
                  <div className="engine-metric">
                    <div className="engine-metric-value">{engineInfo.backtestSummary?.totalCorrect ?? '--'} / {engineInfo.backtestSummary?.totalPredicted ?? '--'}</div>
                    <div className="engine-metric-label">回测杀码成功数</div>
                  </div>
                  <div className="engine-metric">
                    <div className="engine-metric-value">{formatPercent(engineInfo.topWeight * 100)}</div>
                    <div className="engine-metric-label">最高模型权重</div>
                  </div>
                </div>

                {engineInfo.modelPerformance?.length > 0 && (
                  <div className="model-weight-list">
                    {engineInfo.modelPerformance.slice(0, 6).map((model) => (
                      <div key={model.name} className="model-weight-item">
                        <div className="model-weight-top">
                          <span>{model.displayName || formatModelName(model.name)}</span>
                          <span>{formatPercent(model.weight * 100)}</span>
                        </div>
                        <div className="weight-bar">
                          <div className="weight-fill" style={{ width: `${Math.max(2, model.weight * 100)}%` }} />
                        </div>
                        <div className="model-weight-meta">
                          准确 {formatPercent(model.avgAccuracy)} · 全中 {formatPercent(model.allCorrectRate)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {modelComparison.length > 0 && (
                  <div className="comparison-table">
                    <div className="comparison-row header">
                      <span>模型</span>
                      <span>准确率</span>
                      <span>全中率</span>
                      <span>回测期数</span>
                    </div>
                    {modelComparison.map((model) => (
                      <div
                        key={model.name}
                        className={`comparison-row ${model.name === engineInfo.selectedMode ? 'active' : ''}`}
                      >
                        <span className="model-name">
                          {model.displayName || formatModelName(model.name)}
                        </span>
                        <span>{formatPercent(model.overallAccuracy)}</span>
                        <span>{formatPercent(model.allCorrectRate)}</span>
                        <span>{model.calcPeriods}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="predictions-grid">
              {predictions.map((p, idx) => {
                const tierClass = p.tier ? `tier-${p.tier.toLowerCase()}` : 'tier-s3';
                const riskClass = p.risk ? `risk-${p.risk}` : 'risk-watch';
                const modelVotes = Object.entries(p.modelVotes || {}).slice(0, 5);
                return (
                  <div key={p.n || p} className={`ball-card ${tierClass}`}>
                    <div className="rank-badge">#{idx + 1}</div>
                    <div className="ball">
                      {p.n || p}
                    </div>
                    <div className="confidence">
                      {p.appearProb ? `出现率≈${(p.appearProb * 100).toFixed(1)}%` : '极冷杀码'}
                    </div>
                    {p.tier && (
                      <div className="tier-label">
                        {p.tier === 'S1' ? '低出现率' : p.tier === 'S2' ? '较低出现率' : p.tier === 'C2' ? '低波动率' : '常规杀码'}
                      </div>
                    )}
                    <div className={`risk-chip ${riskClass}`}>
                      {formatRisk(p.risk)}
                    </div>

                    <div className="prediction-details">
                      <div className="detail-row">
                        <span>综合分</span>
                        <strong>{typeof p.score === 'number' ? p.score.toFixed(3) : '--'}</strong>
                      </div>
                      <div className="detail-row">
                        <span>一致度</span>
                        <strong>{typeof p.agreement === 'number' ? formatPercent(p.agreement * 100) : '--'}</strong>
                      </div>
                      {p.reasons?.length > 0 && (
                        <div className="reason-list">
                          {p.reasons.slice(0, 4).map((reason) => (
                            <span key={reason} className="reason-chip">{reason}</span>
                          ))}
                        </div>
                      )}
                      {modelVotes.length > 0 && (
                        <div className="vote-list">
                          {modelVotes.map(([name, value]) => (
                            <span key={name} className="vote-chip">
                              {formatModelName(name)} {Number(value).toFixed(2)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        
        {backtestStats && (
          <div className="backtest-section">
            <h2 className="section-title">
              {engineInfo?.selectedModeLabel || formatModelName(backtestStats.name)} 回测结果
              <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginTop: '8px', fontWeight: 500 }}>
                近 {backtestStats.calcPeriods} 期滚动验证
              </span>
            </h2>
            <div className="stats-overview">
              <div className="stat-box">
                <div className="stat-value">{backtestStats.killCount || predictions.length}</div>
                <div className="stat-label">高置信杀码数</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{backtestStats.overallAccuracy.toFixed(1)}%</div>
                <div className="stat-label">综合准确率</div>
              </div>
              {typeof backtestStats.allCorrectRate === 'number' && (
                <div className="stat-box">
                  <div className="stat-value">{backtestStats.allCorrectRate.toFixed(1)}%</div>
                  <div className="stat-label">{backtestStats.killCount || predictions.length}杀全中率</div>
                </div>
              )}
              <div className="stat-box">
                <div className="stat-value">{backtestStats.totalCorrect} / {backtestStats.totalPredicted}</div>
                <div className="stat-label">杀码成功数</div>
              </div>
              {backtestStats.randomBaseline && (
                <div className="stat-box">
                  <div className="stat-value">{backtestStats.randomBaseline.lift.toFixed(1)}%</div>
                  <div className="stat-label">相对随机提升</div>
                </div>
              )}
              {backtestStats.training?.latestLeaderboard?.[0] && (
                <div className="stat-box">
                  <div className="stat-value">{backtestStats.training.latestLeaderboard[0].name}</div>
                  <div className="stat-label">自动权重方案</div>
                </div>
              )}
              {backtestStats.name && (
                <div className="stat-box">
                  <div className="stat-value">{backtestStats.name}</div>
                  <div className="stat-label">回测模型</div>
                </div>
              )}
            </div>
            
            <h3 style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '20px', fontSize: '1rem' }}>当前选中模式近 10 期回测详情</h3>
            <div className="backtest-list">
              {backtestStats.details.map((item, idx) => {
                const accClass = item.accuracy === 100 ? 'perfect' : item.accuracy >= 80 ? 'good' : 'bad';
                return (
                  <div key={idx} className="backtest-item">
                    <div className="bt-header">
                      <span>倒数第 {item.periodOffset} 期</span>
                      <span className={`bt-acc ${accClass}`}>
                        准确率: {item.accuracy.toFixed(0)}% ({item.correctCount}/{item.predicted.length})
                      </span>
                    </div>
                    <div className="bt-body">
                      <div className="bt-row">
                        <span className="bt-label">预测杀码:</span>
                        <div className="bt-nums">
                          {item.predicted.map(n => (
                            <span key={n} className={`bt-num ${item.failed.includes(n) ? 'failed' : 'success'}`}>
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                      {item.failed.length > 0 && (
                        <div className="bt-row">
                          <span className="bt-label error">被杀出号:</span>
                          <div className="bt-nums">
                            {item.failed.map(n => <span key={n} className="bt-num failed">{n}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* {specialCode && (
          <div className="backtest-section">
            <h2 className="section-title">特别码 n7 预测 20 码</h2>
            <div className="stats-overview">
              <div className="stat-box">
                <div className="stat-value">{specialCode.count}</div>
                <div className="stat-label">候选特别码</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{specialCode.backtest.hitRate.toFixed(1)}%</div>
                <div className="stat-label">近 {specialCode.backtest.calcPeriods} 期命中率</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{specialCode.backtest.top10HitRate.toFixed(1)}%</div>
                <div className="stat-label">Top10 命中率</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{specialCode.backtest.randomBaseline.toFixed(1)}%</div>
                <div className="stat-label">随机基线</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{specialCode.training.selectedWeights}</div>
                <div className="stat-label">权重方案</div>
              </div>
            </div>

            <div className="predictions-grid special-grid">
              {specialCode.predictions.map((p) => (
                <div key={p.n} className={`ball-card tier-${p.tier.toLowerCase()}`}>
                  <div className="rank-badge">#{p.rank}</div>
                  <div className="ball">{p.n}</div>
                  <div className="confidence">综合分 {p.score.toFixed(3)}</div>
                </div>
              ))}
            </div>

            <h3 style={{ textAlign: 'center', color: '#94a3b8', margin: '30px 0 20px', fontSize: '1rem' }}>近 15 期特别码回测</h3>
            <div className="backtest-list">
              {specialCode.backtest.details.map((item, idx) => (
                <div key={idx} className="backtest-item">
                  <div className="bt-header">
                    <span>倒数第 {item.periodOffset} 期</span>
                    <span className={`bt-acc ${item.hit ? 'perfect' : 'bad'}`}>
                      {item.hit ? `命中 · 排名 ${item.rank}` : `未命中 · 实际排名 ${item.rank}`}
                    </span>
                  </div>
                  <div className="bt-row">
                    <span className="bt-label">实际 n7:</span>
                    <div className="bt-nums">
                      <span className="bt-num actual">{item.actual}</span>
                    </div>
                  </div>
                  <div className="bt-row">
                    <span className="bt-label">预测20:</span>
                    <div className="bt-nums">
                      {item.predicted.map((n) => (
                        <span key={n} className={`bt-num ${n === item.actual ? 'success' : ''}`}>
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )} */}

        <div className="action-container">
          <a href="/" className="btn-back">返回主页</a>
        </div>
      </div>
    </div>
  );
}
