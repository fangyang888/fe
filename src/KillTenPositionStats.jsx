import { useEffect, useState } from 'react';

export default function KillTenPositionStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const response = await fetch(
        refresh
          ? '/api/kill-combo/kill10-position-stats/cache/refresh'
          : '/api/kill-combo/kill10-position-stats',
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
    <main className="k10api-page">
      <style>{`
        .k10api-page{min-height:100vh;padding:72px 20px 48px;color:#e2e8f0;background:radial-gradient(circle at 50% 0%,#312e81 0,#111827 44%,#030712 100%);font-family:Inter,system-ui,sans-serif}
        .k10api-shell{width:min(1080px,100%);margin:0 auto}.k10api-eyebrow{color:#a78bfa;font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
        .k10api-title{margin:12px 0 8px;color:#f8fafc;font-size:clamp(32px,6vw,54px);line-height:1.08}.k10api-subtitle{margin:0;color:#94a3b8;line-height:1.7}
        .k10api-actions{display:flex;justify-content:flex-end;margin-top:16px}.k10api-refresh{padding:9px 15px;border:1px solid rgba(167,139,250,.35);border-radius:10px;color:#ddd6fe;background:rgba(76,29,149,.3);cursor:pointer}.k10api-refresh:disabled{opacity:.5}
        .k10api-hero{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;margin-top:24px;padding:28px;border:1px solid rgba(167,139,250,.28);border-radius:24px;background:rgba(15,23,42,.72);box-shadow:0 24px 70px rgba(0,0,0,.3)}
        .k10api-position{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;color:#fff;font-size:42px;font-weight:900;background:linear-gradient(145deg,#8b5cf6,#4f46e5);box-shadow:0 14px 35px rgba(124,58,237,.35)}
        .k10api-muted,.k10api-count{color:#94a3b8;font-size:13px}.k10api-value{margin:6px 0;color:#f8fafc;font-size:26px;font-weight:900}.k10api-meta{color:#c4b5fd;font-size:14px}
        .k10api-current{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.k10api-ball{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;color:#fff;font-weight:800;background:#6d28d9}
        .k10api-section{margin-top:34px}.k10api-section-title{margin:0 0 14px;color:#f8fafc;font-size:22px}.k10api-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        .k10api-card{padding:22px;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:rgba(15,23,42,.62)}.k10api-card-position{margin:10px 0 2px;color:#ddd6fe;font-size:24px;font-weight:900}.k10api-rate{color:#4ade80;font-size:34px;font-weight:900}
        .k10api-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:rgba(15,23,42,.62)}.k10api-table{width:100%;border-collapse:collapse;min-width:700px}.k10api-table th,.k10api-table td{padding:14px 16px;text-align:center;border-bottom:1px solid rgba(148,163,184,.1)}.k10api-table th{color:#94a3b8;font-size:13px}.k10api-table td{font-weight:750}.k10api-table tr.best td{color:#4ade80;background:rgba(74,222,128,.06)}
        .k10api-badge{display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;color:#052e16;background:#4ade80;font-size:11px}.k10api-note,.k10api-status{margin-top:20px;padding:18px 20px;border-radius:16px;color:#94a3b8;line-height:1.65;background:rgba(15,23,42,.62)}.k10api-back{display:inline-block;margin-top:22px;color:#c4b5fd;text-decoration:none}
        @media(max-width:760px){.k10api-grid{grid-template-columns:1fr 1fr}.k10api-hero{grid-template-columns:1fr}.k10api-position{width:88px;height:88px}}
      `}</style>
      <div className="k10api-shell">
        <div className="k10api-eyebrow">Kill 10 position statistics</div>
        <h1 className="k10api-title">10杀位置概率统计</h1>
        <p className="k10api-subtitle">由后端逐期滚动验证“预测下期不会出现的10个数字”，比较第1～10位在近10、20、50、100期的成功率。</p>
        <div className="k10api-actions"><button className="k10api-refresh" disabled={refreshing} onClick={() => load(true)}>{refreshing ? '正在重新计算…' : '刷新统计缓存'}</button></div>

        {error ? <div className="k10api-status">{error}</div> : !data ? (
          <div className="k10api-status">正在读取后端统计缓存，首次计算可能需要一些时间…</div>
        ) : (
          <>
            <section className="k10api-hero">
              <div className="k10api-position">{data.overallBest.position}</div>
              <div>
                <div className="k10api-muted">四窗口综合最高位置</div>
                <div className="k10api-value">第 {data.overallBest.position} 位</div>
                <div className="k10api-meta">四窗口平均 {data.overallBest.averageRate.toFixed(1)}% · 近100期 {longWindow.positions[data.overallBest.position - 1].rate.toFixed(1)}%</div>
                <div className="k10api-current">{data.currentPredictions.map((number, index) => <span className="k10api-ball" key={`${number}-${index}`}>{number}</span>)}</div>
              </div>
            </section>

            <section className="k10api-section">
              <h2 className="k10api-section-title">各窗口最高位置</h2>
              <div className="k10api-grid">{data.windows.map((window) => (
                <article className="k10api-card" key={window.periods}>
                  <div className="k10api-muted">近 {window.periods} 期</div>
                  <div className="k10api-card-position">第 {window.bestPositions.map((item) => item.position).join('、')} 位</div>
                  <div className="k10api-rate">{window.bestPositions[0].rate.toFixed(1)}%</div>
                  <div className="k10api-count">成功 {window.bestPositions[0].successCount}/{window.bestPositions[0].samples}</div>
                </article>
              ))}</div>
            </section>

            <section className="k10api-section">
              <h2 className="k10api-section-title">全部位置对比</h2>
              <div className="k10api-table-wrap"><table className="k10api-table">
                <thead><tr><th>位置</th>{data.windows.map((window) => <th key={window.periods}>近{window.periods}期</th>)}</tr></thead>
                <tbody>{Array.from({ length: 10 }, (_, index) => {
                  const isOverallBest = index + 1 === data.overallBest.position;
                  return <tr className={isOverallBest ? 'best' : ''} key={index}>
                    <td>第 {index + 1} 位 {isOverallBest && <span className="k10api-badge">综合最高</span>}</td>
                    {data.windows.map((window) => {
                      const item = window.positions[index];
                      const isWindowBest = window.bestPositions.some((best) => best.position === item.position);
                      return <td key={window.periods}>{item.rate.toFixed(1)}% {isWindowBest && '★'}<div className="k10api-count">{item.successCount}/{item.samples}</div></td>;
                    })}
                  </tr>;
                })}</tbody>
              </table></div>
            </section>

            <div className="k10api-note">
              数据库共 {data.historyMeta.count} 期，最新为 {data.historyMeta.latest.year} 年第 {data.historyMeta.latest.No} 期。缓存：{data.cacheMeta.hit ? '已命中' : '本次新生成'}（{data.cacheMeta.store}），生成时间 {new Date(data.cacheMeta.generatedAt).toLocaleString('zh-CN')}。
            </div>
          </>
        )}
        <a className="k10api-back" href="/fe/kill">← 返回基础杀码</a>
      </div>
    </main>
  );
}
