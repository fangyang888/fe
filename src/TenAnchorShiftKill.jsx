import { useEffect, useState } from 'react';
import KillBacktestMetric from './KillBacktestMetric';

const fmtNum = (value) => String(value ?? '--').padStart(2, '0');

function Stat({ label, value, benchmark }) {
  const beats = typeof value?.successRate === 'number' && value.successRate > benchmark;
  return <KillBacktestMetric label={label} data={value} className={`tas-stat ${beats ? 'beats' : ''}`} />;
}

export default function TenAnchorShiftKill() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/ten-anchor-shift', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`);
        return json;
      })
      .then(setData)
      .catch((reason) => reason.name !== 'AbortError' && setError(reason.message || '加载失败'));
    return () => controller.abort();
  }, []);

  const prediction = data?.prediction;
  const bt = data?.backtests || {};
  const latest = data?.historyMeta?.latest;

  return <main className="tas-page">
    <style>{`
      .tas-page { min-height:100vh; box-sizing:border-box; padding:72px 18px 48px; color:#f8fafc; background:radial-gradient(circle at 12% 0,rgba(251,146,60,.18),transparent 32%),#17130f; font-family:Inter,system-ui,sans-serif; }
      .tas-shell { width:min(1160px,100%); margin:0 auto; }
      .tas-kicker { margin:0 0 9px; color:#fb923c; font-size:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; }
      .tas-title { margin:0; font-size:clamp(32px,5vw,56px); line-height:1; }
      .tas-subtitle { max-width:760px; margin:14px 0 26px; color:#b9aea3; line-height:1.7; }
      .tas-panel { border:1px solid rgba(253,186,116,.17); border-radius:18px; background:rgba(38,30,24,.88); box-shadow:0 24px 70px rgba(0,0,0,.25); }
      .tas-message { padding:24px; color:#d3c5b8; } .tas-error { color:#fda4af; }
      .tas-hero { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(380px,.95fr); gap:16px; }
      .tas-current { padding:26px; }
      .tas-flow { display:flex; align-items:center; gap:16px; margin-top:20px; flex-wrap:wrap; }
      .tas-ball { display:grid; place-items:center; width:92px; height:92px; border-radius:50%; color:#3b1703; background:#fdba74; font-size:36px; font-weight:950; }
      .tas-ball.result { color:#fff7ed; background:#ea580c; box-shadow:0 16px 36px rgba(234,88,12,.27); }
      .tas-arrow { color:#fb923c; font-size:26px; font-weight:900; }
      .tas-flow-copy span,.tas-flow-copy strong { display:block; }
      .tas-flow-copy span { color:#9f9184; font-size:11px; } .tas-flow-copy strong { margin-top:5px; font-size:20px; }
      .tas-reason { margin:18px 0 0; color:#d2c5ba; font-size:13px; line-height:1.65; }
      .tas-tags { display:flex; flex-wrap:wrap; gap:7px; margin-top:14px; }
      .tas-tag { padding:6px 9px; border-radius:999px; color:#fed7aa; background:rgba(251,146,60,.1); font-size:11px; font-weight:800; }
      .tas-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .tas-stat { padding:18px; border:1px solid rgba(255,255,255,.07); border-radius:16px; background:rgba(38,30,24,.7); }
      .tas-stat.beats { border-color:rgba(251,146,60,.38); background:rgba(234,88,12,.08); }
      .tas-stat span,.tas-stat small { display:block; color:#a99b8e; } .tas-stat strong { display:block; margin:7px 0 4px; font-size:30px; }
      .tas-wide { grid-column:1/-1; }
      .tas-grid { display:grid; grid-template-columns:.85fr 1.15fr; gap:16px; margin-top:16px; }
      .tas-card { padding:22px; } .tas-card h3 { margin:0 0 14px; font-size:17px; }
      .tas-rule { display:grid; gap:10px; }
      .tas-rule div { display:grid; grid-template-columns:34px 1fr; gap:10px; align-items:center; padding:12px; border-radius:12px; background:rgba(255,255,255,.035); }
      .tas-rule b { display:grid; place-items:center; width:30px; height:30px; border-radius:50%; color:#431407; background:#fb923c; }
      .tas-rule span { color:#cdbfb3; font-size:13px; line-height:1.5; }
      .tas-table-wrap { overflow-x:auto; }
      .tas-table { width:100%; min-width:760px; border-collapse:collapse; font-size:13px; }
      .tas-table th,.tas-table td { padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.07); text-align:left; }
      .tas-table th { color:#9e8f82; font-size:11px; } .tas-ok { color:#fdba74; font-weight:850; } .tas-bad { color:#fb7185; font-weight:850; }
      @media(max-width:900px){.tas-hero,.tas-grid{grid-template-columns:1fr}.tas-wide{grid-column:auto}}
      @media(max-width:540px){.tas-stats{grid-template-columns:1fr 1fr}.tas-ball{width:76px;height:76px}.tas-flow{gap:10px}}
    `}</style>
    <div className="tas-shell">
      <p className="tas-kicker">Ten-period anchor transform</p>
      <h1 className="tas-title">十期锚点位移</h1>
      <p className="tas-subtitle">固定取10期前第7个号码，在1～49内循环减10。页面同时保留锚点期号和计算过程，便于逐期核验。</p>
      {error && <div className="tas-panel tas-message tas-error">加载失败：{error}</div>}
      {!error && !data && <div className="tas-panel tas-message">正在计算500期滚动回测…</div>}
      {data?.status === 'insufficient-history' && <div className="tas-panel tas-message">{data.message}</div>}
      {prediction && <>
        <div className="tas-hero">
          <section className="tas-panel tas-current">
            <div className="tas-kicker">当前推荐单杀</div>
            <div className="tas-flow">
              <div className="tas-ball">{prediction.anchorDisplay}</div>
              <div className="tas-flow-copy"><span>10期前第7位</span><strong>循环减10</strong></div>
              <div className="tas-arrow">→</div><div className="tas-ball result">{prediction.display}</div>
            </div>
            <p className="tas-reason">{prediction.reason}</p>
            <div className="tas-tags"><span className="tas-tag">公式 {prediction.formula}</span><span className="tas-tag">数据库 {data.historyMeta.count} 期</span><span className="tas-tag">最新 {latest?.year}-{String(latest?.No || '').padStart(3,'0')}</span></div>
          </section>
          <div className="tas-stats">
            <Stat label="近20期" value={bt.backtest20} benchmark={.95}/><Stat label="近50期" value={bt.backtest50} benchmark={.96}/>
            <Stat label="近100期" value={bt.backtest100} benchmark={.90}/><Stat label="近200期" value={bt.backtest200} benchmark={.88}/>
            <div className="tas-wide"><Stat label="近500期长期观察" value={bt.backtest500} benchmark={.88}/></div>
          </div>
        </div>
        <div className="tas-grid">
          <section className="tas-panel tas-card"><h3>固定规则</h3><div className="tas-rule">
            <div><b>1</b><span>向前定位整整10期。</span></div><div><b>2</b><span>只读取该期第7个号码。</span></div><div><b>3</b><span>循环减10；小于1时从49继续回绕。</span></div><div><b>4</b><span>参数固定，不因近期失败自动换位。</span></div>
          </div></section>
          <section className="tas-panel tas-card tas-table-wrap"><h3>近20期逐期核验</h3><table className="tas-table"><thead><tr><th>开奖期</th><th>锚点期</th><th>锚点</th><th>计算</th><th>结果</th></tr></thead><tbody>
            {bt.backtest20.rows.map(row=><tr key={`${row.year}-${row.No}`}><td>{row.year}-{String(row.No).padStart(3,'0')}</td><td>{row.anchorYear}-{String(row.anchorNo).padStart(3,'0')}</td><td>{fmtNum(row.anchorNumber)}</td><td>{row.formula}</td><td className={row.success?'tas-ok':'tas-bad'}>{row.success?'成功':'失败'}</td></tr>)}
          </tbody></table></section>
        </div>
      </>}
    </div>
  </main>;
}
