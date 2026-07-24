import { useEffect, useState } from 'react';

export default function SmartSevenPositionStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const response = await fetch(
        refresh
          ? '/api/kill-combo/smart7-position-stats/cache/refresh'
          : '/api/kill-combo/smart7-position-stats',
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

  return (
    <main className="s7ps-page">
      <style>{`
        .s7ps-page{min-height:100vh;padding:72px 20px 48px;color:#e2e8f0;background:radial-gradient(circle at 50% 0%,#064e3b 0,#0f172a 44%,#020617 100%);font-family:Inter,system-ui,sans-serif}
        .s7ps-shell{width:min(1080px,100%);margin:0 auto}.s7ps-eyebrow{color:#34d399;font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
        .s7ps-title{margin:12px 0 8px;color:#f8fafc;font-size:clamp(32px,6vw,54px);line-height:1.08}.s7ps-subtitle{margin:0;color:#94a3b8;line-height:1.7}
        .s7ps-actions{display:flex;justify-content:flex-end;margin-top:16px}.s7ps-refresh{padding:9px 15px;border:1px solid rgba(52,211,153,.3);border-radius:10px;color:#a7f3d0;background:rgba(6,78,59,.35);cursor:pointer}.s7ps-refresh:disabled{opacity:.5}
        .s7ps-hero{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;margin-top:24px;padding:28px;border:1px solid rgba(52,211,153,.28);border-radius:24px;background:rgba(15,23,42,.72);box-shadow:0 24px 70px rgba(0,0,0,.3)}
        .s7ps-position{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;color:#fff;font-size:42px;font-weight:900;background:linear-gradient(145deg,#10b981,#0f766e);box-shadow:0 14px 35px rgba(16,185,129,.3)}
        .s7ps-muted,.s7ps-count{color:#94a3b8;font-size:13px}.s7ps-value{margin:6px 0;color:#f8fafc;font-size:26px;font-weight:900}.s7ps-meta{color:#6ee7b7;font-size:14px}
        .s7ps-current{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}.s7ps-ball{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;color:#fff;font-weight:800;background:#0f766e}.s7ps-ball:last-child{background:#7c3aed}
        .s7ps-section{margin-top:34px}.s7ps-section-title{margin:0 0 14px;color:#f8fafc;font-size:22px}.s7ps-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        .s7ps-card{padding:22px;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:rgba(15,23,42,.62)}.s7ps-card-position{margin:10px 0 2px;color:#a7f3d0;font-size:24px;font-weight:900}.s7ps-rate{color:#4ade80;font-size:34px;font-weight:900}
        .s7ps-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:rgba(15,23,42,.62)}.s7ps-table{width:100%;border-collapse:collapse;min-width:650px}.s7ps-table th,.s7ps-table td{padding:14px 16px;text-align:center;border-bottom:1px solid rgba(148,163,184,.1)}.s7ps-table th{color:#94a3b8;font-size:13px}.s7ps-table td{font-weight:750}.s7ps-table tr.best td{color:#4ade80;background:rgba(74,222,128,.06)}
        .s7ps-badge{display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;color:#052e16;background:#4ade80;font-size:11px}.s7ps-note,.s7ps-status{margin-top:20px;padding:18px 20px;border-radius:16px;color:#94a3b8;line-height:1.65;background:rgba(15,23,42,.62)}.s7ps-back{display:inline-block;margin-top:22px;color:#6ee7b7;text-decoration:none}
        @media(max-width:760px){.s7ps-grid{grid-template-columns:1fr 1fr}.s7ps-hero{grid-template-columns:1fr}.s7ps-position{width:88px;height:88px}}
      `}</style>
      <div className="s7ps-shell">
        <div className="s7ps-eyebrow">Smart 7 position statistics</div>
        <h1 className="s7ps-title">智能7码位置概率统计</h1>
        <p className="s7ps-subtitle">后端逐期滚动验证智能7码第1～7位，比较近10、20、50、100期杀码成功率。第1～6位来自10杀精选，第7位来自高置信候选。</p>
        <div className="s7ps-actions"><button className="s7ps-refresh" disabled={refreshing} onClick={() => load(true)}>{refreshing ? '正在重新计算…' : '刷新统计缓存'}</button></div>

        {error ? <div className="s7ps-status">{error}</div> : !data ? (
          <div className="s7ps-status">后端正在计算最新100期，首次加载可能需要较长时间…</div>
        ) : (
          <>
            <section className="s7ps-hero">
              <div className="s7ps-position">{data.overallBest.position}</div>
              <div>
                <div className="s7ps-muted">四窗口综合最高位置</div>
                <div className="s7ps-value">第 {data.overallBest.position} 位</div>
                <div className="s7ps-meta">四窗口平均 {data.overallBest.averageRate.toFixed(1)}% · 近100期 {longWindow.positions[data.overallBest.position - 1].rate.toFixed(1)}%</div>
                <div className="s7ps-current">{data.currentPredictions.map((number, index) => <span className="s7ps-ball" key={`${number}-${index}`}>{number}</span>)}</div>
              </div>
            </section>

            <section className="s7ps-section">
              <h2 className="s7ps-section-title">各窗口最高位置</h2>
              <div className="s7ps-grid">{data.windows.map((window) => (
                <article className="s7ps-card" key={window.periods}>
                  <div className="s7ps-muted">近 {window.periods} 期</div>
                  <div className="s7ps-card-position">第 {window.bestPositions.map((item) => item.position).join('、')} 位</div>
                  <div className="s7ps-rate">{window.bestPositions[0].rate.toFixed(1)}%</div>
                  <div className="s7ps-count">成功 {window.bestPositions[0].successCount}/{window.bestPositions[0].samples}</div>
                </article>
              ))}</div>
            </section>

            <section className="s7ps-section">
              <h2 className="s7ps-section-title">全部位置对比</h2>
              <div className="s7ps-table-wrap"><table className="s7ps-table">
                <thead><tr><th>位置</th>{data.windows.map((window) => <th key={window.periods}>近{window.periods}期</th>)}</tr></thead>
                <tbody>{Array.from({ length: 7 }, (_, index) => {
                  const isOverallBest = index + 1 === data.overallBest.position;
                  return <tr className={isOverallBest ? 'best' : ''} key={index}>
                    <td>第 {index + 1} 位 {isOverallBest && <span className="s7ps-badge">综合最高</span>}</td>
                    {data.windows.map((window) => {
                      const item = window.positions[index];
                      const isWindowBest = window.bestPositions.some((best) => best.position === item.position);
                      return <td key={window.periods}>{item.rate.toFixed(1)}% {isWindowBest && '★'}<div className="s7ps-count">{item.successCount}/{item.samples}</div></td>;
                    })}
                  </tr>;
                })}</tbody>
              </table></div>
            </section>

            <div className="s7ps-note">
              数据库共 {data.historyMeta.count} 期，最新为 {data.historyMeta.latest.year} 年第 {data.historyMeta.latest.No} 期。缓存：{data.cacheMeta.hit ? '已命中' : '本次新生成'}，生成时间 {new Date(data.cacheMeta.generatedAt).toLocaleString('zh-CN')}。历史回测不代表未来必然结果。
            </div>
          </>
        )}
        <a className="s7ps-back" href="/fe/kill">← 返回基础杀码</a>
      </div>
    </main>
  );
}
