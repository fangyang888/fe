import { useEffect, useState } from 'react';

const WINDOW_LABELS = {
  10: '短期表现',
  20: '近期表现',
  50: '中期表现',
  100: '长期表现',
};

export default function FrequencyPositionFiveStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const response = await fetch(
        refresh
          ? '/api/predictor/frequency-position-five/cache/refresh'
          : '/api/predictor/frequency-position-five',
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

  return (
    <main className="f5-page">
      <style>{`
        .f5-page{min-height:100vh;padding:72px 20px 48px;color:#e2e8f0;background:radial-gradient(circle at 50% 0%,#3f1d0b 0,#111827 44%,#030712 100%);font-family:Inter,system-ui,sans-serif}.f5-shell{width:min(980px,100%);margin:auto}
        .f5-eyebrow{color:#fb923c;font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.f5-title{margin:12px 0 8px;color:#f8fafc;font-size:clamp(32px,6vw,56px);line-height:1.05}.f5-subtitle{margin:0;color:#94a3b8;font-size:16px;line-height:1.7}
        .f5-actions{display:flex;justify-content:flex-end;margin-top:16px}.f5-button{padding:9px 15px;border:1px solid rgba(251,146,60,.35);border-radius:10px;color:#fed7aa;background:rgba(124,45,18,.28);cursor:pointer}.f5-button:disabled{opacity:.5}
        .f5-current{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;margin-top:24px;padding:28px;border:1px solid rgba(251,146,60,.28);border-radius:24px;background:rgba(15,23,42,.72);box-shadow:0 24px 70px rgba(0,0,0,.28)}.f5-ball{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;color:#fff;font-size:42px;font-weight:900;background:linear-gradient(145deg,#f97316,#dc2626);box-shadow:0 14px 35px rgba(249,115,22,.32)}
        .f5-current-label,.f5-count{color:#94a3b8;font-size:13px}.f5-current-value{margin:6px 0;color:#f8fafc;font-size:26px;font-weight:900}.f5-current-meta{color:#fdba74;font-size:14px}.f5-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:24px}.f5-card{padding:22px;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:rgba(15,23,42,.62)}.f5-rate{margin:12px 0 4px;color:#f8fafc;font-size:36px;font-weight:900}.f5-rate.good{color:#4ade80}.f5-bar{height:7px;margin-top:18px;overflow:hidden;border-radius:999px;background:#1e293b}.f5-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#f97316,#4ade80)}
        .f5-note,.f5-status{margin-top:20px;padding:18px 20px;border-radius:16px;color:#94a3b8;font-size:14px;line-height:1.65;background:rgba(15,23,42,.6)}.f5-back{display:inline-block;margin-top:22px;color:#fdba74;text-decoration:none}@media(max-width:760px){.f5-grid{grid-template-columns:1fr 1fr}.f5-current{grid-template-columns:1fr}.f5-ball{width:88px;height:88px}}
      `}</style>
      <div className="f5-shell">
        <div className="f5-eyebrow">Focused position statistics</div>
        <h1 className="f5-title">频率模型 · 第5位</h1>
        <p className="f5-subtitle">从 NewKill 多模型中的频率模型取排序第5位，逐期滚动验证近10、20、50、100期杀码成功率。</p>
        <div className="f5-actions"><button className="f5-button" disabled={refreshing} onClick={() => load(true)}>{refreshing ? '正在重新计算…' : '刷新统计缓存'}</button></div>

        {error ? <div className="f5-status">{error}</div> : !data ? <div className="f5-status">正在读取后端统计缓存…</div> : (
          <>
            <section className="f5-current">
              <div className="f5-ball">{data.prediction.n}</div>
              <div>
                <div className="f5-current-label">当前频率模型第5位杀码</div>
                <div className="f5-current-value">号码 {data.prediction.n}</div>
                <div className="f5-current-meta">预测该号码不会出现在下一期7个结果中</div>
              </div>
            </section>
            <section className="f5-grid" aria-label="频率模型第5位滚动回测">
              {data.windows.map((window) => (
                <article className="f5-card" key={window.periods}>
                  <div className="f5-current-label">{WINDOW_LABELS[window.periods]} · 近{window.periods}期</div>
                  <div className={`f5-rate ${window.rate >= 90 ? 'good' : ''}`}>{window.rate.toFixed(1)}%</div>
                  <div className="f5-count">成功 {window.successCount}/{window.samples} · 失败 {window.failureCount}</div>
                  <div className="f5-bar"><div className="f5-fill" style={{ width: `${window.rate}%` }} /></div>
                </article>
              ))}
            </section>
            <div className="f5-note">
              数据库共 {data.historyMeta.count} 期，最新为 {data.historyMeta.latest.year} 年第 {data.historyMeta.latest.No} 期。每个样本只使用开奖前已有的数据重新生成频率模型排序。缓存：{data.cacheMeta.hit ? '已命中' : '本次新生成'}（{data.cacheMeta.store}）。
            </div>
          </>
        )}
        <a className="f5-back" href="/fe/kill/new">← 返回 NewKill 多模型</a>
      </div>
    </main>
  );
}
