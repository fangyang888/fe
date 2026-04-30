import React, { useState, useEffect } from 'react';

// Calculation logic has been moved to the backend PredictorService

// ================================================================
// Component
// ================================================================

export default function NewKillPredictor() {
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState([]);
  const [backtestStats, setBacktestStats] = useState(null);
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
          setBacktestStats(data.backtestStats);
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
      ` }} />
      
      <div className="glow"></div>
      
      <div className="glass-card">
        <div className="header-section">
          <h1 className="title">服务端深度预测引擎</h1>
          <p className="subtitle">基于 Node.js 深度自适应学习模型与马尔可夫转移矩阵 (Markov Chains)，计算并过滤出下期最不可能出现的 10 个极冷数字。</p>
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
          <div className="predictions-grid">
            {predictions.map((p, idx) => {
              const tierClass = p.tier ? `tier-${p.tier.toLowerCase()}` : 'tier-s3';
              return (
                <div key={p.n || p} className={`ball-card ${tierClass}`}>
                  <div className="rank-badge">#{idx + 1}</div>
                  <div className="ball">
                    {p.n || p}
                  </div>
                  <div className="confidence">
                    极冷杀码
                  </div>
                  {p.tier && (
                    <div className="tier-label">
                      {p.tier === 'S1' ? '极高置信' : p.tier === 'S2' ? '高置信' : p.tier === 'C2' ? '低波动率' : '常规杀码'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {backtestStats && (
          <div className="backtest-section">
            <h2 className="section-title">基于近 {backtestStats.calcPeriods} 期大样本回测</h2>
            <div className="stats-overview">
              <div className="stat-box">
                <div className="stat-value">{backtestStats.overallAccuracy.toFixed(1)}%</div>
                <div className="stat-label">综合准确率</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{backtestStats.totalCorrect} / {backtestStats.totalPredicted}</div>
                <div className="stat-label">杀码成功数</div>
              </div>
            </div>
            
            <h3 style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '20px', fontSize: '1rem' }}>近 10 期详情</h3>
            <div className="backtest-list">
              {backtestStats.details.map((item, idx) => {
                const accClass = item.accuracy === 100 ? 'perfect' : item.accuracy >= 80 ? 'good' : 'bad';
                return (
                  <div key={idx} className="backtest-item">
                    <div className="bt-header">
                      <span>倒数第 {item.periodOffset} 期</span>
                      <span className={`bt-acc ${accClass}`}>
                        准确率: {item.accuracy.toFixed(0)}% ({item.correctCount}/10)
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

        <div className="action-container">
          <a href="/" className="btn-back">返回主页</a>
        </div>
      </div>
    </div>
  );
}
