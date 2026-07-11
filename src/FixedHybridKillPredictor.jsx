import React, { useEffect, useMemo, useState } from 'react';

export default function FixedHybridKillPredictor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/fixed-hybrid-kill/probability-4-7', { cache: 'no-store' });
        if (!res.ok) {
          const message = await res.text();
          throw new Error(`HTTP ${res.status}: ${message || res.statusText}`);
        }
        setData(await res.json());
      } catch (err) {
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const sourceCounts = useMemo(() => {
    const rows = data?.predictions || [];
    return rows.reduce(
      (acc, item) => {
        if (String(item.source || '').includes('history')) acc.history += 1;
        if (String(item.source || '').includes('prediction')) acc.probability += 1;
        return acc;
      },
      { history: 0, probability: 0 },
    );
  }, [data]);

  const formatPercent = (value, digits = 1) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '--';
    return `${value.toFixed(digits)}%`;
  };

  const riskText = (risk) => {
    if (risk === 'low') return '低风险';
    if (risk === 'mid') return '中风险';
    if (risk === 'watch') return '观察';
    return '未评级';
  };

  if (loading) {
    return (
      <div className="fixed-hybrid-page">
        <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
        <div className="fixed-loading">正在计算固定 4-7 概率补位策略...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed-hybrid-page">
        <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
        <div className="fixed-error">接口加载失败：{error}</div>
      </div>
    );
  }

  const predictions = data?.predictions || [];
  const backtest = data?.backtest || {};
  const bestByWindow = data?.positionBacktests?.bestByWindow || [];
  const latest = data?.historyMeta?.latest;

  return (
    <div className="fixed-hybrid-page">
      <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
      <main className="fixed-shell">
        <section className="fixed-header">
          <div>
            <p className="fixed-kicker">固定策略</p>
            <h1>Hybrid 4-7 Probability</h1>
            <p className="fixed-subtitle">
              {data.strategy.displayName}，独立接口复刻 NewKillPredictor 原始算法链路。
            </p>
          </div>
          <div className="fixed-meta">
            <span>{data.historyMeta?.count || '--'} 期数据</span>
            <span>
              最新 {latest?.year || '--'}-{latest?.No || latest?.id || '--'}
            </span>
          </div>
        </section>

        <section className="fixed-stats">
          <div>
            <strong>{formatPercent(backtest.overallAccuracy)}</strong>
            <span>综合准确率</span>
          </div>
          <div>
            <strong>{formatPercent(backtest.allCorrectRate)}</strong>
            <span>10 杀全中率</span>
          </div>
          <div>
            <strong>{formatPercent(backtest.ninePlusRate)}</strong>
            <span>最多错 1 个占比</span>
          </div>
          <div>
            <strong>{backtest.totalCorrect ?? '--'} / {backtest.totalPredicted ?? '--'}</strong>
            <span>杀码成功数</span>
          </div>
          <div>
            <strong>{formatPercent(backtest.randomBaseline?.lift)}</strong>
            <span>相对随机提升</span>
          </div>
        </section>

        <section className="fixed-strategy">
          <div>
            <span className="fixed-label">历史筛选</span>
            <strong>近 {data.strategy.window} 期取 {data.strategy.historyCount} 个</strong>
          </div>
          <div>
            <span className="fixed-label">概率补位</span>
            <strong>{data.strategy.predictionCount} 个出现概率低号码</strong>
          </div>
          <div>
            <span className="fixed-label">当前输出来源</span>
            <strong>{sourceCounts.history} 历史 + {sourceCounts.probability} 概率</strong>
          </div>
        </section>

        <section className="fixed-section fixed-top-three-backtest">
          <div className="fixed-section-head">
            <div>
              <h2>近20 / 50 / 100期最佳位次</h2>
              <p className="fixed-section-copy">分别比较h47全部10个输出位次，展示每个回测窗口成功率最高的当前位置。</p>
            </div>
            <span>10个位次滚动比较</span>
          </div>
          <div className="fixed-top-three-grid">
            {bestByWindow.map(({ window, result }) => {
              const item = result?.[`backtest${window}`];
              return (
              <article className="fixed-position-card" key={window}>
                <div className="fixed-position-head">
                  <span>近{window}期最佳</span>
                  <strong>{result?.current?.n ?? '--'}</strong>
                </div>
                <div className="fixed-best-position-result">
                  <div>
                    <strong>第{result?.position ?? '--'}位</strong>
                    <span>当前输出位置</span>
                  </div>
                  <div>
                    <strong>{formatPercent((item?.successRate || 0) * 100)}</strong>
                    <span>{item?.successCount ?? 0}/{item?.count ?? 0} 成功</span>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        </section>

        <section className="fixed-section">
          <div className="fixed-section-head">
            <h2>本期 10 杀号码</h2>
            <span>{data.strategy.name}</span>
          </div>
          <div className="fixed-grid">
            {predictions.map((item) => (
              <article key={item.n} className={`fixed-card source-${item.source}`}>
                <div className="fixed-card-top">
                  <span>#{item.blendRank}</span>
                  <span>{item.source === 'history' ? '历史筛选' : item.source === 'history+prediction' ? '历史+概率' : '概率补位'}</span>
                </div>
                <div className="fixed-ball">{item.n}</div>
                <div className="fixed-card-meta">
                  <span>{riskText(item.risk)}</span>
                  <span>出现率 {formatPercent((item.appearProb || 0) * 100)}</span>
                </div>
                <div className="fixed-reasons">
                  {(item.reasons || []).slice(0, 3).map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="fixed-section">
          <div className="fixed-section-head">
            <h2>近 10 期回测详情</h2>
            <span>固定模型，不自动切换</span>
          </div>
          <div className="fixed-backtest">
            {(backtest.details || []).map((item) => (
              <div key={item.periodOffset} className="fixed-backtest-row">
                <div className="fixed-backtest-top">
                  <strong>倒数第 {item.periodOffset} 期</strong>
                  <span className={item.accuracy === 100 ? 'ok' : item.accuracy >= 80 ? 'mid' : 'bad'}>
                    {item.accuracy.toFixed(0)}% ({item.correctCount}/{item.predicted.length})
                  </span>
                </div>
                <div className="fixed-mini-nums">
                  {item.predicted.map((n) => (
                    <span key={n} className={item.failed.includes(n) ? 'failed' : ''}>{n}</span>
                  ))}
                </div>
                {item.failed.length > 0 && (
                  <div className="fixed-failed">被杀出号：{item.failed.join('、')}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const pageStyles = `
  .fixed-hybrid-page {
    min-height: 100vh;
    background: #101414;
    color: #f8fafc;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 36px 18px 60px;
  }
  .fixed-shell {
    width: min(1180px, 100%);
    margin: 0 auto;
  }
  .fixed-header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-end;
    padding: 24px 0 28px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  }
  .fixed-kicker {
    margin: 0 0 8px;
    color: #5eead4;
    font-weight: 800;
    letter-spacing: 0;
  }
  .fixed-header h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 4.4rem);
    line-height: 0.95;
    letter-spacing: 0;
  }
  .fixed-subtitle {
    margin: 16px 0 0;
    color: #b6c2cf;
    max-width: 620px;
    line-height: 1.7;
  }
  .fixed-meta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .fixed-meta span, .fixed-section-head span {
    border: 1px solid rgba(94, 234, 212, 0.25);
    color: #99f6e4;
    padding: 7px 10px;
    border-radius: 6px;
    background: rgba(20, 184, 166, 0.08);
    font-size: 0.82rem;
    font-weight: 800;
  }
  .fixed-stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1px;
    margin: 28px 0;
    background: rgba(148, 163, 184, 0.2);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }
  .fixed-stats div, .fixed-strategy div {
    background: #151c1c;
    padding: 18px;
  }
  .fixed-stats strong {
    display: block;
    font-size: 1.55rem;
    margin-bottom: 6px;
  }
  .fixed-top-three-backtest { margin-bottom: 28px; }
  .fixed-section-copy { margin: 6px 0 0; color: #91a3b3; font-size: 0.82rem; line-height: 1.55; }
  .fixed-top-three-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .fixed-position-card { border: 1px solid rgba(94, 234, 212, 0.22); background: #151c1c; padding: 14px; }
  .fixed-position-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; color: #99f6e4; font-size: 0.82rem; font-weight: 900; }
  .fixed-position-head strong { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: #ccfbf1; color: #134e4a; font-size: 1.15rem; }
  .fixed-best-position-result { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: rgba(148, 163, 184, 0.18); }
  .fixed-best-position-result div { padding: 12px 9px; background: #111817; }
  .fixed-best-position-result strong { display: block; font-size: 1.1rem; margin-bottom: 4px; }
  .fixed-best-position-result span { color: #91a3b3; font-size: 0.72rem; }
  .fixed-stats span, .fixed-label {
    color: #91a3b3;
    font-size: 0.82rem;
    font-weight: 800;
  }
  .fixed-strategy {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 32px;
  }
  .fixed-strategy div {
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 8px;
  }
  .fixed-strategy strong {
    display: block;
    margin-top: 8px;
    font-size: 1.05rem;
  }
  .fixed-section {
    margin-top: 34px;
  }
  .fixed-section-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
  }
  .fixed-section h2 {
    margin: 0;
    font-size: 1.4rem;
    letter-spacing: 0;
  }
  .fixed-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
  }
  .fixed-card {
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 8px;
    background: #151c1c;
    padding: 16px;
    min-height: 178px;
  }
  .fixed-card.source-history {
    border-color: rgba(94, 234, 212, 0.42);
  }
  .fixed-card.source-prediction {
    border-color: rgba(251, 191, 36, 0.34);
  }
  .fixed-card-top, .fixed-card-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: #9fb0bf;
    font-size: 0.78rem;
    font-weight: 800;
  }
  .fixed-ball {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    margin: 16px auto;
    background: #f8fafc;
    color: #111827;
    font-size: 2rem;
    font-weight: 900;
  }
  .fixed-reasons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .fixed-reasons span {
    background: rgba(255, 255, 255, 0.06);
    color: #cbd5e1;
    border-radius: 6px;
    padding: 5px 7px;
    font-size: 0.74rem;
  }
  .fixed-backtest {
    display: grid;
    gap: 10px;
  }
  .fixed-backtest-row {
    background: #151c1c;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 8px;
    padding: 14px;
  }
  .fixed-backtest-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .fixed-backtest-top span {
    font-weight: 900;
  }
  .fixed-backtest-top .ok { color: #5eead4; }
  .fixed-backtest-top .mid { color: #facc15; }
  .fixed-backtest-top .bad { color: #fb7185; }
  .fixed-mini-nums {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .fixed-mini-nums span {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(94, 234, 212, 0.13);
    color: #ccfbf1;
    font-weight: 900;
  }
  .fixed-mini-nums span.failed {
    background: rgba(244, 63, 94, 0.18);
    color: #fecdd3;
  }
  .fixed-failed {
    margin-top: 10px;
    color: #fda4af;
    font-size: 0.86rem;
    font-weight: 800;
  }
  .fixed-loading, .fixed-error {
    width: min(720px, calc(100% - 32px));
    margin: 80px auto;
    background: #151c1c;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 8px;
    padding: 24px;
    color: #cbd5e1;
    font-weight: 800;
  }
  .fixed-error {
    color: #fecdd3;
    border-color: rgba(244, 63, 94, 0.28);
  }
  @media (max-width: 820px) {
    .fixed-header {
      display: block;
    }
    .fixed-meta {
      justify-content: flex-start;
      margin-top: 18px;
    }
    .fixed-stats, .fixed-strategy, .fixed-top-three-grid {
      grid-template-columns: 1fr;
    }
    .fixed-section-head {
      align-items: flex-start;
      flex-direction: column;
    }
  }
`;
