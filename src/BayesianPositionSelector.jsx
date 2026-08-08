import { useEffect, useState } from 'react';

export default function BayesianPositionSelector() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const endpoint = refresh
        ? '/api/kill-combo/bayesian-position-selector/cache/refresh'
        : '/api/kill-combo/bayesian-position-selector';
      const response = await fetch(endpoint, {
        method: refresh ? 'POST' : 'GET',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await response.json());
    } catch (requestError) {
      setError(`动态择位加载失败：${requestError.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const perfectPositionIds = data?.perfectPositions?.map((item) => item.position) || [];

  return (
    <main className="bps-page">
      <style>{`
        .bps-page{min-height:100vh;box-sizing:border-box;padding:72px 20px 48px;color:#e2e8f0;background:radial-gradient(circle at 16% 0,rgba(124,58,237,.32),transparent 34%),radial-gradient(circle at 88% 12%,rgba(14,165,233,.2),transparent 30%),#070b18;font-family:Inter,system-ui,sans-serif}.bps-shell{width:min(1120px,100%);margin:auto}.bps-kicker{color:#a78bfa;font-size:12px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.bps-title{margin:10px 0 8px;color:#fff;font-size:clamp(34px,6vw,58px);line-height:1.05}.bps-subtitle{max-width:820px;margin:0;color:#94a3b8;line-height:1.75}.bps-actions{display:flex;justify-content:flex-end;margin-top:16px}.bps-button{padding:10px 16px;border:1px solid rgba(167,139,250,.4);border-radius:11px;color:#ddd6fe;background:rgba(109,40,217,.18);cursor:pointer}.bps-button:disabled{opacity:.5}.bps-status,.bps-note{margin-top:20px;padding:18px 20px;border:1px solid rgba(148,163,184,.12);border-radius:16px;color:#94a3b8;background:rgba(15,23,42,.72)}
        .bps-hero{display:grid;grid-template-columns:auto 1fr;gap:26px;align-items:center;margin-top:24px;padding:30px;border:1px solid rgba(167,139,250,.3);border-radius:24px;background:rgba(15,23,42,.76);box-shadow:0 24px 80px rgba(0,0,0,.32)}.bps-main-ball{display:grid;place-items:center;width:116px;height:116px;border-radius:50%;color:#fff;font-size:46px;font-weight:950;background:linear-gradient(145deg,#8b5cf6,#0284c7);box-shadow:0 16px 42px rgba(124,58,237,.38)}.bps-muted{color:#94a3b8;font-size:13px}.bps-value{margin:6px 0;color:#fff;font-size:28px;font-weight:900}.bps-meta{color:#c4b5fd;font-size:14px}.bps-balls{display:flex;flex-wrap:wrap;gap:7px;margin-top:15px}.bps-ball{position:relative;display:grid;place-items:center;width:35px;height:35px;border-radius:50%;color:#fff;font-size:13px;font-weight:800;background:#334155}.bps-ball.perfect{color:#fffbeb;background:#a16207;box-shadow:0 0 0 2px #fbbf24 inset}.bps-ball.active{outline:3px solid #fbbf24;background:#7c3aed;transform:scale(1.08)}.bps-ball small{position:absolute;top:38px;color:#fbbf24;font-size:9px;white-space:nowrap}
        .bps-section{margin-top:34px}.bps-section h2{margin:0 0 14px;color:#fff;font-size:22px}.bps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.bps-card{padding:21px;border:1px solid rgba(148,163,184,.14);border-radius:19px;background:rgba(15,23,42,.66)}.bps-card.perfect{border-color:rgba(251,191,36,.55);background:linear-gradient(145deg,rgba(120,53,15,.3),rgba(15,23,42,.72));box-shadow:0 0 30px rgba(245,158,11,.08)}.bps-rate{margin:10px 0 4px;color:#4ade80;font-size:35px;font-weight:900}.bps-rate.under{color:#fb7185}.bps-rate.perfect{color:#fbbf24}.bps-count{color:#94a3b8;font-size:12px}.bps-perfect-badge{display:inline-block;margin-left:7px;padding:3px 8px;border-radius:999px;color:#422006;background:#fbbf24;font-size:10px;font-weight:900}.bps-perfect-list{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:16px 0 0;padding:16px;border:1px solid rgba(251,191,36,.3);border-radius:15px;color:#fde68a;background:rgba(120,53,15,.16)}.bps-perfect-chip{padding:6px 10px;border:1px solid rgba(251,191,36,.35);border-radius:999px;color:#fff7ed;background:#92400e;font-size:12px;font-weight:850}.bps-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:19px;background:rgba(15,23,42,.66)}.bps-table{width:100%;min-width:760px;border-collapse:collapse}.bps-table th,.bps-table td{padding:13px 14px;border-bottom:1px solid rgba(148,163,184,.09);text-align:center}.bps-table th{color:#94a3b8;font-size:12px}.bps-table td{font-weight:750}.bps-table tr:first-child td{color:#c4b5fd;background:rgba(124,58,237,.09)}.bps-perfect-text{color:#fbbf24}.bps-ok{color:#4ade80}.bps-bad{color:#fb7185}.bps-warning{margin-top:16px;padding:14px 16px;border:1px solid rgba(251,191,36,.25);border-radius:14px;color:#fde68a;background:rgba(120,53,15,.18);font-size:13px;line-height:1.65}.bps-back{display:inline-block;margin-top:22px;color:#c4b5fd;text-decoration:none}@media(max-width:760px){.bps-grid{grid-template-columns:1fr 1fr}.bps-hero{grid-template-columns:1fr}.bps-main-ball{width:92px;height:92px}}
      `}</style>
      <div className="bps-shell">
        <div className="bps-kicker">Recent-window champion selection</div>
        <h1 className="bps-title">近10期冠军动态择位</h1>
        <p className="bps-subtitle">独立分析 Likely22 产生的第1～22位候选。每期开奖后同时更新全部位置，下一期选择最近10期成功次数最高的位置；相同成绩固定取较前位置，保证逐期结果可复现。</p>
        <div className="bps-actions"><button className="bps-button" disabled={refreshing} onClick={() => load(true)}>{refreshing ? '正在重新计算…' : '刷新独立缓存'}</button></div>

        {error ? <div className="bps-status">{error}</div> : !data ? <div className="bps-status">正在进行逐期动态择位回测，首次计算可能需要几秒…</div> : <>
          <section className="bps-hero">
            <div className="bps-main-ball">{data.current.number ?? '--'}</div>
            <div>
              <div className="bps-muted">当前唯一推荐杀码</div>
              <div className="bps-value">号码 {data.current.number ?? '--'} · 第 {data.current.position} 位</div>
              <div className="bps-meta">近10期 {data.current.recentSuccesses}/{data.current.recentSamples} · 基准收缩估计 {data.current.adjustedRate.toFixed(1)}% · 95%下界 {data.current.confidenceLowerBound.toFixed(1)}%</div>
              <div className="bps-balls">{data.currentPredictions.map((number, index) => {
                const position = index + 1;
                const isPerfect = perfectPositionIds.includes(position);
                const isActive = position === data.current.position;
                return <span className={`bps-ball${isPerfect ? ' perfect' : ''}${isActive ? ' active' : ''}`} title={isPerfect ? '近10期 10/10' : undefined} key={`${number}-${index}`}>{number}{isActive && <small>已选</small>}</span>;
              })}</div>
              <div className="bps-warning">近10期显示100%只是10个历史样本；收缩估计和置信下界更能反映不确定性，不能理解为下一期100%成功。</div>
            </div>
          </section>

          <section className="bps-section">
            <h2>动态选择决策的滚动回测</h2>
            <div className="bps-grid">{data.windows.map((window) => {
              const isPerfect = window.periods === 10 && window.rate === 100;
              return <article className={`bps-card${isPerfect ? ' perfect' : ''}`} key={window.periods}>
              <div className="bps-muted">近 {window.periods} 次事前决策 {isPerfect && <span className="bps-perfect-badge">历史全对</span>}</div>
              <div className={`bps-rate${isPerfect ? ' perfect' : window.rate < data.baselineRate ? ' under' : ''}`}>{window.rate.toFixed(1)}%</div>
              <div className="bps-count">成功 {window.successCount}/{window.samples} · 失败 {window.failureCount}</div>
            </article>})}</div>
          </section>

          {data.perfectPositions.length > 0 && <div className="bps-perfect-list">
            <strong>金色 · 近10期 10/10：</strong>
            {data.perfectPositions.map((item) => <span className="bps-perfect-chip" key={item.position}>第{item.position}位 · 号码{item.number}</span>)}
            <span className="bps-count">仅表示最近10期历史全对，不代表下一期100%。</span>
          </div>}

          <section className="bps-section">
            <h2>新版与原贝叶斯算法对比</h2>
            <div className="bps-table-wrap"><table className="bps-table"><thead><tr><th>回测窗口</th><th>近10期冠军</th><th>原贝叶斯算法</th><th>变化</th></tr></thead><tbody>
              {data.comparison.previousWindows.map((previous) => {
                const current = data.windows.find((window) => window.periods === previous.periods);
                const improvement = current.rate - previous.rate;
                return <tr key={previous.periods}><td>近 {previous.periods} 期</td><td>{current.rate.toFixed(1)}%</td><td>{previous.rate.toFixed(1)}%</td><td className={improvement >= 0 ? 'bps-ok' : 'bps-bad'}>{improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}%</td></tr>;
              })}
            </tbody></table></div>
          </section>

          <section className="bps-section">
            <h2>当前近10期排名前5位</h2>
            <div className="bps-table-wrap"><table className="bps-table"><thead><tr><th>排名</th><th>位置</th><th>号码</th><th>近10期</th><th>原始比例</th><th>基准收缩估计</th><th>95%下界</th></tr></thead><tbody>
              {data.topPositions.map((item, index) => {
                const isPerfect = item.recentSamples === 10 && item.recentSuccesses === 10;
                return <tr key={item.position}><td>{index + 1}</td><td>第 {item.position} 位</td><td>{item.number}</td><td className={isPerfect ? 'bps-perfect-text' : ''}>{item.recentSuccesses}/{item.recentSamples}{isPerfect && <span className="bps-perfect-badge">100%</span>}</td><td>{item.recentRate.toFixed(1)}%</td><td>{item.adjustedRate.toFixed(1)}%</td><td>{item.confidenceLowerBound.toFixed(1)}%</td></tr>;
              })}
            </tbody></table></div>
          </section>

          <section className="bps-section">
            <h2>近20次实际择位</h2>
            <div className="bps-table-wrap"><table className="bps-table"><thead><tr><th>开奖期</th><th>当期选择位置</th><th>选择号码</th><th>选择时近10期</th><th>结果</th></tr></thead><tbody>
              {data.recentDecisions.map((row) => <tr key={`${row.year}-${row.No}`}><td>{row.year}-{String(row.No).padStart(3, '0')}</td><td>第 {row.position} 位</td><td>{row.number}</td><td>{row.recentSuccesses}/{row.recentSamples}</td><td className={row.success ? 'bps-ok' : 'bps-bad'}>{row.success ? '成功' : '失败'}</td></tr>)}
            </tbody></table></div>
          </section>

          <div className="bps-note">随机单码未出现基准为 {data.baselineRate.toFixed(1)}%。数据库共 {data.historyMeta.count} 期，最新为 {data.historyMeta.latest.year} 年第 {data.historyMeta.latest.No} 期；先用 {data.warmupSamples} 期热身，之后每一期只使用此前10期数据选择，不读取当期或未来结果。近500期结果最适合判断长期稳定性。</div>
        </>}
        <a className="bps-back" href="/fe/kill/likely22-position-stats">← 查看原 Likely22 位置统计</a>
      </div>
    </main>
  );
}
