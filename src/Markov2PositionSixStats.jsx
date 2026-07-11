import { useEffect, useState } from 'react';

const WINDOW_LABELS = {
  20: '近期表现',
  50: '中期表现',
  100: '长期表现',
};

export default function Markov2PositionSixStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/predictor/markov2-position-six', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(`统计加载失败：${requestError.message}`);
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="m2-page">
      <style>{`
        .m2-page { min-height: 100vh; padding: 72px 20px 48px; color: #e2e8f0; background: radial-gradient(circle at 50% 0%, #172554 0, #0f172a 42%, #020617 100%); font-family: Inter, system-ui, sans-serif; }
        .m2-shell { width: min(960px, 100%); margin: 0 auto; }
        .m2-eyebrow { color: #60a5fa; font-size: 13px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
        .m2-title { margin: 12px 0 8px; color: #f8fafc; font-size: clamp(32px, 6vw, 56px); line-height: 1.05; }
        .m2-subtitle { margin: 0; color: #94a3b8; font-size: 16px; line-height: 1.7; }
        .m2-section { margin-top: 34px; }
        .m2-section-title { margin: 0 0 14px; color: #f8fafc; font-size: 22px; }
        .m2-current { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; margin: 0 0 22px; padding: 28px; border: 1px solid rgba(96,165,250,.25); border-radius: 24px; background: rgba(15,23,42,.72); box-shadow: 0 24px 70px rgba(0,0,0,.28); }
        .m2-current.probability { border-color: rgba(192,132,252,.28); }
        .m2-ball { display: grid; place-items: center; width: 104px; height: 104px; border-radius: 50%; color: white; font-size: 42px; font-weight: 900; background: linear-gradient(145deg, #3b82f6, #7c3aed); box-shadow: 0 14px 35px rgba(59,130,246,.35); }
        .m2-ball.probability { background: linear-gradient(145deg, #a855f7, #ec4899); box-shadow: 0 14px 35px rgba(168,85,247,.3); }
        .m2-current-label { color: #94a3b8; font-size: 14px; }
        .m2-current-value { margin-top: 6px; color: #f8fafc; font-size: 24px; font-weight: 800; }
        .m2-current-meta { margin-top: 8px; color: #93c5fd; font-size: 14px; }
        .m2-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .m2-card { padding: 24px; border: 1px solid rgba(148,163,184,.16); border-radius: 20px; background: rgba(15,23,42,.62); }
        .m2-card-label { color: #94a3b8; font-size: 13px; }
        .m2-rate { margin: 12px 0 4px; color: #f8fafc; font-size: 38px; font-weight: 900; }
        .m2-rate.good { color: #4ade80; }
        .m2-count { color: #94a3b8; font-size: 13px; }
        .m2-bar { height: 7px; margin-top: 18px; overflow: hidden; border-radius: 999px; background: #1e293b; }
        .m2-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #3b82f6, #4ade80); }
        .m2-note { margin-top: 18px; padding: 18px 20px; border-radius: 16px; color: #94a3b8; font-size: 14px; line-height: 1.65; background: rgba(15,23,42,.5); }
        .m2-back { display: inline-block; margin-top: 22px; color: #93c5fd; text-decoration: none; }
        .m2-status { margin-top: 36px; padding: 26px; border-radius: 18px; background: rgba(15,23,42,.72); }
        @media (max-width: 700px) { .m2-grid { grid-template-columns: 1fr; } .m2-current { grid-template-columns: 1fr; } .m2-ball { width: 88px; height: 88px; } }
      `}</style>

      <div className="m2-shell">
        <div className="m2-eyebrow">Focused position statistics</div>
        <h1 className="m2-title">模型位置专项统计</h1>
        <p className="m2-subtitle">逐期滚动验证二阶马尔可夫第6位与出现概率第7位，分别观察近20、50、100期成功率。</p>

        {error ? <div className="m2-status">{error}</div> : !data ? (
          <div className="m2-status">正在计算滚动统计…</div>
        ) : (
          <>
            <section className="m2-section">
              <h2 className="m2-section-title">二阶马尔可夫 · 第6位</h2>
              <div className="m2-current">
                <div className="m2-ball">{data.prediction.n}</div>
                <div>
                  <div className="m2-current-label">当前第6位预测杀码</div>
                  <div className="m2-current-value">号码 {data.prediction.n}</div>
                  <div className="m2-current-meta">
                    模型杀码概率 {data.prediction.killProbability.toFixed(1)}% · 预计出现概率 {data.prediction.appearProbability.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="m2-grid" aria-label="二阶马尔可夫滚动回测概率">
                {data.windows.map((window) => (
                  <article className="m2-card" key={window.periods}>
                    <div className="m2-card-label">{WINDOW_LABELS[window.periods]} · 近{window.periods}期</div>
                    <div className={`m2-rate ${window.rate >= 90 ? 'good' : ''}`}>{window.rate.toFixed(1)}%</div>
                    <div className="m2-count">成功 {window.successCount} / {window.samples} · 失败 {window.failureCount}</div>
                    <div className="m2-bar"><div className="m2-fill" style={{ width: `${window.rate}%` }} /></div>
                  </article>
                ))}
              </div>
            </section>

            <section className="m2-section">
              <h2 className="m2-section-title">出现概率 · 第7位</h2>
              <div className="m2-current probability">
                <div className="m2-ball probability">{data.probabilityPositionSeven.prediction.n}</div>
                <div>
                  <div className="m2-current-label">当前第7位预测杀码</div>
                  <div className="m2-current-value">号码 {data.probabilityPositionSeven.prediction.n}</div>
                  <div className="m2-current-meta">
                    模型杀码概率 {data.probabilityPositionSeven.prediction.killProbability.toFixed(1)}% · 预计出现概率 {data.probabilityPositionSeven.prediction.appearProbability.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="m2-grid" aria-label="出现概率模型滚动回测概率">
                {data.probabilityPositionSeven.windows.map((window) => (
                  <article className="m2-card" key={window.periods}>
                    <div className="m2-card-label">{WINDOW_LABELS[window.periods]} · 近{window.periods}期</div>
                    <div className={`m2-rate ${window.rate >= 90 ? 'good' : ''}`}>{window.rate.toFixed(1)}%</div>
                    <div className="m2-count">成功 {window.successCount} / {window.samples} · 失败 {window.failureCount}</div>
                    <div className="m2-bar"><div className="m2-fill" style={{ width: `${window.rate}%` }} /></div>
                  </article>
                ))}
              </div>
            </section>

            <div className="m2-note">
              数据库共 {data.historyMeta.count} 期，最新为 {data.historyMeta.latest.year} 年第 {data.historyMeta.latest.No} 期。统计只使用每期开奖前已有的数据，成功表示预测号码未在下一期7个号码中出现。
            </div>
          </>
        )}

        <a className="m2-back" href="/fe/kill/new">← 返回 NewKill 多模型</a>
      </div>
    </main>
  );
}
