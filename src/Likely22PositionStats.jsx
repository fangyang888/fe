import { useEffect, useState } from 'react';

export default function Likely22PositionStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const response = await fetch(
        refresh
          ? '/api/kill-combo/likely22-position-stats/cache/refresh'
          : '/api/kill-combo/likely22-position-stats',
        { method: refresh ? 'POST' : 'GET', cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await response.json());
    } catch (requestError) {
      setError(`统计加载失败：${requestError.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const longWindow = data?.windows?.find((window) => window.periods === 100);
  const specialStats = data?.specialCodeStats;
  const longSpecialWindow = specialStats?.windows?.find((window) => window.periods === 100);
  const specialOverallBestPositions = specialStats?.overallBestPositions || (specialStats?.overallBest ? [specialStats.overallBest] : []);

  return (
    <main className="l22-page">
      <style>{`
        .l22-page{min-height:100vh;padding:72px 20px 48px;color:#e2e8f0;background:radial-gradient(circle at 50% 0%,#164e63 0,#0f172a 44%,#020617 100%);font-family:Inter,system-ui,sans-serif}.l22-shell{width:min(1120px,100%);margin:auto}
        .l22-eyebrow{color:#22d3ee;font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.l22-title{margin:12px 0 8px;color:#f8fafc;font-size:clamp(32px,6vw,54px)}.l22-subtitle{margin:0;color:#94a3b8;line-height:1.7}.l22-actions{display:flex;justify-content:flex-end;margin-top:16px}
        .l22-button{padding:9px 15px;border:1px solid rgba(34,211,238,.35);border-radius:10px;color:#a5f3fc;background:rgba(8,145,178,.18);cursor:pointer}.l22-button:disabled{opacity:.5}.l22-status,.l22-note{margin-top:20px;padding:18px 20px;border-radius:16px;color:#94a3b8;line-height:1.65;background:rgba(15,23,42,.68)}
        .l22-hero{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;margin-top:24px;padding:28px;border:1px solid rgba(34,211,238,.28);border-radius:24px;background:rgba(15,23,42,.72);box-shadow:0 24px 70px rgba(0,0,0,.3)}.l22-position{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;color:#fff;font-size:42px;font-weight:900;background:linear-gradient(145deg,#06b6d4,#2563eb);box-shadow:0 14px 35px rgba(6,182,212,.3)}
        .l22-muted,.l22-count{color:#94a3b8;font-size:13px}.l22-value{margin:6px 0;color:#f8fafc;font-size:26px;font-weight:900}.l22-meta{color:#67e8f9;font-size:14px}.l22-current{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.l22-ball{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;color:#fff;font-size:13px;font-weight:800;background:#0e7490}
        .l22-section{margin-top:34px}.l22-section-title{margin:0 0 14px;color:#f8fafc;font-size:22px}.l22-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.l22-card{padding:22px;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:rgba(15,23,42,.62)}.l22-card-position{margin:10px 0 2px;color:#a5f3fc;font-size:23px;font-weight:900}.l22-rate{color:#fb7185;font-size:34px;font-weight:900}
        .l22-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:rgba(15,23,42,.62)}.l22-table{width:100%;border-collapse:collapse;min-width:720px}.l22-table th,.l22-table td{padding:13px 15px;text-align:center;border-bottom:1px solid rgba(148,163,184,.1)}.l22-table th{color:#94a3b8;font-size:13px}.l22-table td{font-weight:750}.l22-table tr.best td{color:#fb7185;background:rgba(251,113,133,.06)}.l22-badge{display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;color:#fff;background:#e11d48;font-size:11px}.l22-back{display:inline-block;margin-top:22px;color:#67e8f9;text-decoration:none}
        .l22-special{margin-top:42px;padding-top:34px;border-top:1px solid rgba(251,191,36,.24)}.l22-special-intro{margin:-5px 0 18px;color:#94a3b8;line-height:1.7}.l22-special-hero{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;padding:26px;border:1px solid rgba(251,191,36,.3);border-radius:22px;background:linear-gradient(135deg,rgba(120,53,15,.32),rgba(15,23,42,.72))}.l22-special-position{display:grid;place-items:center;width:94px;height:94px;border-radius:50%;color:#422006;font-size:38px;font-weight:950;background:linear-gradient(145deg,#fde68a,#f59e0b);box-shadow:0 14px 35px rgba(245,158,11,.24)}.l22-special-value{margin:6px 0;color:#fef3c7;font-size:25px;font-weight:900}.l22-special-meta{color:#fbbf24;font-size:14px}.l22-special-rate{color:#fbbf24;font-size:34px;font-weight:900}.l22-special-card-position{margin:10px 0 2px;color:#fde68a;font-size:22px;font-weight:900}.l22-table tr.special-best td{color:#fbbf24;background:rgba(251,191,36,.06)}.l22-special-badge{display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;color:#422006;background:#fbbf24;font-size:11px}
        @media(max-width:760px){.l22-grid{grid-template-columns:1fr 1fr}.l22-hero,.l22-special-hero{grid-template-columns:1fr}.l22-position{width:88px;height:88px}}
      `}</style>
      <div className="l22-shell">
        <div className="l22-eyebrow">Likely 32 reverse statistics</div>
        <h1 className="l22-title">32码反向未出现统计</h1>
        <p className="l22-subtitle">对“预测下期最可能出现的32个数字”进行反向验证：数字没有出现在下一期7个结果中记为成功，比较第1～32位在近10、20、50、100期的未出现率。</p>
        <div className="l22-actions"><button className="l22-button" disabled={refreshing} onClick={() => load(true)}>{refreshing ? '正在重新计算…' : '刷新统计缓存'}</button></div>

        {error ? <div className="l22-status">{error}</div> : !data ? <div className="l22-status">正在读取后端统计缓存…</div> : (
          <>
            <section className="l22-hero">
              <div className="l22-position">{data.overallBest.position}</div>
              <div>
                <div className="l22-muted">四窗口综合最高未出现位置</div>
                <div className="l22-value">第 {data.overallBest.position} 位</div>
                <div className="l22-meta">平均未出现率 {data.overallBest.averageRate.toFixed(1)}% · 近100期 {longWindow.positions[data.overallBest.position - 1].rate.toFixed(1)}%</div>
                <div className="l22-current">{data.currentPredictions.map((number, index) => <span className="l22-ball" key={`${number}-${index}`}>{number}</span>)}</div>
              </div>
            </section>

            <section className="l22-section">
              <h2 className="l22-section-title">各窗口最高未出现位置</h2>
              <div className="l22-grid">{data.windows.map((window) => (
                <article className="l22-card" key={window.periods}>
                  <div className="l22-muted">近 {window.periods} 期</div>
                  <div className="l22-card-position">第 {window.bestPositions.map((item) => item.position).join('、')} 位</div>
                  <div className="l22-rate">{window.bestPositions[0].rate.toFixed(1)}%</div>
                  <div className="l22-count">未出现 {window.bestPositions[0].absentCount}/{window.bestPositions[0].samples}</div>
                </article>
              ))}</div>
            </section>

            <section className="l22-section">
              <h2 className="l22-section-title">第1～32位完整对比</h2>
              <div className="l22-table-wrap"><table className="l22-table">
                <thead><tr><th>位置</th>{data.windows.map((window) => <th key={window.periods}>近{window.periods}期</th>)}</tr></thead>
                <tbody>{Array.from({ length: 32 }, (_, index) => {
                  const isOverallBest = index + 1 === data.overallBest.position;
                  return <tr className={isOverallBest ? 'best' : ''} key={index}>
                    <td>第 {index + 1} 位 {isOverallBest && <span className="l22-badge">综合最高</span>}</td>
                    {data.windows.map((window) => {
                      const item = window.positions[index];
                      const isWindowBest = window.bestPositions.some((best) => best.position === item.position);
                      return <td key={window.periods}>{item.rate.toFixed(1)}% {isWindowBest && '★'}<div className="l22-count">{item.absentCount}/{item.samples}</div></td>;
                    })}
                  </tr>;
                })}</tbody>
              </table></div>
            </section>

            {specialStats && longSpecialWindow && (
              <section className="l22-special">
                <h2 className="l22-section-title">特别码未命中位置统计</h2>
                <p className="l22-special-intro">特别码按每期 7 个开奖号码的最后一个号码（n7）计算。32 码中某个位置的候选数字不等于当期 n7，就记为该位置“特别码未命中”；百分比越高，说明该位置越少成为特别码。</p>

                <div className="l22-special-hero">
                  <div className="l22-special-position">{specialOverallBestPositions.length}位</div>
                  <div>
                    <div className="l22-muted">四窗口综合最高特别码未命中位置</div>
                    <div className="l22-special-value">第 {specialOverallBestPositions.map((item) => item.position).join('、')} 位</div>
                    <div className="l22-special-meta">平均未命中率 {specialStats.overallBest.averageRate.toFixed(1)}% · 近100期：{specialOverallBestPositions.map((item) => `第${item.position}位 ${longSpecialWindow.positions[item.position - 1].rate.toFixed(1)}%`).join('、')}</div>
                  </div>
                </div>

                <section className="l22-section">
                  <h3 className="l22-section-title">各窗口未命中率最高位置</h3>
                  <div className="l22-grid">{specialStats.windows.map((window) => (
                    <article className="l22-card" key={window.periods}>
                      <div className="l22-muted">近 {window.periods} 期 · 特别码未被32码覆盖 {window.uncoveredCount}/{window.samples}</div>
                      <div className="l22-special-card-position">第 {window.bestPositions.map((item) => item.position).join('、')} 位</div>
                      <div className="l22-special-rate">{window.bestPositions[0].rate.toFixed(1)}%</div>
                      <div className="l22-count">每个最佳位置未命中 {window.bestPositions[0].missCount}/{window.bestPositions[0].samples} · 32码覆盖率 {window.coverageRate.toFixed(1)}%</div>
                    </article>
                  ))}</div>
                </section>

                <section className="l22-section">
                  <h3 className="l22-section-title">第1～32位特别码未命中对比</h3>
                  <div className="l22-table-wrap"><table className="l22-table">
                    <thead><tr><th>预测位置</th>{specialStats.windows.map((window) => <th key={window.periods}>近{window.periods}期</th>)}</tr></thead>
                    <tbody>{Array.from({ length: 32 }, (_, index) => {
                      const isOverallBest = specialOverallBestPositions.some((item) => item.position === index + 1);
                      return <tr className={isOverallBest ? 'special-best' : ''} key={index}>
                        <td>第 {index + 1} 位 {isOverallBest && <span className="l22-special-badge">综合最高</span>}</td>
                        {specialStats.windows.map((window) => {
                          const item = window.positions[index];
                          const isWindowBest = window.bestPositions.some((best) => best.position === item.position);
                          return <td key={window.periods}>{item.rate.toFixed(1)}% {isWindowBest && '★'}<div className="l22-count">未命中 {item.missCount}/{item.samples}</div></td>;
                        })}
                      </tr>;
                    })}</tbody>
                  </table></div>
                </section>
              </section>
            )}

            <div className="l22-note">数据库共 {data.historyMeta.count} 期，最新为 {data.historyMeta.latest.year} 年第 {data.historyMeta.latest.No} 期。缓存：{data.cacheMeta.hit ? '已命中' : '本次新生成'}（{data.cacheMeta.store}），生成时间 {new Date(data.cacheMeta.generatedAt).toLocaleString('zh-CN')}。上半部分展示没有出现在全部 7 码中的概率；特别码部分只展示没有命中最后一个号码 n7 的概率。</div>
          </>
        )}
        <a className="l22-back" href="/fe/kill">← 返回基础杀码</a>
      </div>
    </main>
  );
}
