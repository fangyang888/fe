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
        @media(max-width:760px){.l22-grid{grid-template-columns:1fr 1fr}.l22-hero{grid-template-columns:1fr}.l22-position{width:88px;height:88px}}
      `}</style>
      <div className="l22-shell">
        <div className="l22-eyebrow">Likely 22 reverse statistics</div>
        <h1 className="l22-title">22码反向未出现统计</h1>
        <p className="l22-subtitle">对“预测下期最可能出现的22个数字”进行反向验证：数字没有出现在下一期7个结果中记为成功，比较第1～22位在近10、20、50、100期的未出现率。</p>
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
              <h2 className="l22-section-title">第1～22位完整对比</h2>
              <div className="l22-table-wrap"><table className="l22-table">
                <thead><tr><th>位置</th>{data.windows.map((window) => <th key={window.periods}>近{window.periods}期</th>)}</tr></thead>
                <tbody>{Array.from({ length: 22 }, (_, index) => {
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

            <div className="l22-note">数据库共 {data.historyMeta.count} 期，最新为 {data.historyMeta.latest.year} 年第 {data.historyMeta.latest.No} 期。缓存：{data.cacheMeta.hit ? '已命中' : '本次新生成'}（{data.cacheMeta.store}），生成时间 {new Date(data.cacheMeta.generatedAt).toLocaleString('zh-CN')}。这里展示的是未出现率，不是出现率。</div>
          </>
        )}
        <a className="l22-back" href="/fe/kill">← 返回基础杀码</a>
      </div>
    </main>
  );
}
