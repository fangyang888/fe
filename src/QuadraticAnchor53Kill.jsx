import { useEffect, useState } from 'react';

const pct = (value) => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '--';

function Metric({ label, data }) {
  return <article className="qa-metric"><span>{label}</span><strong>{pct(data?.successRate)}</strong><small>{data?.successCount || 0}/{data?.count || 0} 成功</small></article>;
}

export default function QuadraticAnchor53Kill() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/quadratic-anchor-53', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const json = await response.json(); if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`); return json; })
      .then(setData).catch((reason) => reason.name !== 'AbortError' && setError(reason.message || '加载失败'));
    return () => controller.abort();
  }, []);
  const prediction = data?.prediction;
  const bt = data?.backtests || {};

  return <main className="qa-page"><style>{`
    .qa-page{min-height:100vh;box-sizing:border-box;padding:72px 18px 48px;color:#ecfeff;background:radial-gradient(circle at 15% 0,rgba(34,211,238,.17),transparent 34%),#0c1517;font-family:Inter,system-ui,sans-serif}.qa-shell{width:min(1160px,100%);margin:0 auto}.qa-kicker{margin:0 0 10px;color:#67e8f9;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.qa-title{margin:0;font-size:clamp(32px,5vw,56px);line-height:1}.qa-subtitle{max-width:790px;margin:14px 0 26px;color:#a4b9bc;line-height:1.7}
    .qa-panel{border:1px solid rgba(103,232,249,.17);border-radius:20px;background:rgba(18,36,39,.87);box-shadow:0 24px 72px rgba(0,0,0,.27)}.qa-message{padding:24px;color:#bed2d5}.qa-error{color:#fda4af}.qa-hero{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(380px,.92fr);gap:16px}.qa-current{padding:28px}.qa-equation{display:flex;align-items:center;gap:15px;flex-wrap:wrap;margin-top:18px}.qa-ball{display:grid;place-items:center;width:98px;height:98px;border-radius:50%;color:#083344;background:#67e8f9;font-size:38px;font-weight:950}.qa-ball.result{color:#ecfeff;background:#0891b2;box-shadow:0 16px 38px rgba(8,145,178,.34)}.qa-op{color:#a5f3fc;font-size:22px;font-weight:900}.qa-copy{margin:18px 0 0;color:#c4d5d7;font-size:13px;line-height:1.65}.qa-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.qa-tag{padding:6px 10px;border-radius:999px;color:#a5f3fc;background:rgba(34,211,238,.09);font-size:11px;font-weight:800}
    .qa-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.qa-metric{padding:18px;border:1px solid rgba(34,211,238,.2);border-radius:16px;background:rgba(18,36,39,.68)}.qa-metric span,.qa-metric small{display:block;color:#8ea8ab}.qa-metric strong{display:block;margin:7px 0 4px;font-size:30px}.qa-long{grid-column:1/-1}.qa-lower{display:grid;grid-template-columns:.76fr 1.24fr;gap:16px;margin-top:16px}.qa-card{padding:22px}.qa-card h3{margin:0 0 14px;font-size:17px}.qa-calc{display:grid;gap:10px}.qa-calc div{padding:13px;border-radius:12px;background:rgba(255,255,255,.035)}.qa-calc span{display:block;color:#8eaaad;font-size:11px}.qa-calc strong{display:block;margin-top:5px;font-size:17px}.qa-table-wrap{overflow-x:auto}.qa-table{width:100%;min-width:780px;border-collapse:collapse;font-size:13px}.qa-table th,.qa-table td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left}.qa-table th{color:#809ca0;font-size:11px}.qa-ok{color:#67e8f9;font-weight:850}.qa-bad{color:#fb7185;font-weight:850}@media(max-width:900px){.qa-hero,.qa-lower{grid-template-columns:1fr}.qa-long{grid-column:auto}}@media(max-width:520px){.qa-ball{width:78px;height:78px}.qa-op{font-size:16px}.qa-metrics{grid-template-columns:1fr 1fr}}
  `}</style><div className="qa-shell">
    <p className="qa-kicker">Quadratic anchor transform</p><h1 className="qa-title">53期二次锚点</h1><p className="qa-subtitle">固定读取53期前第2位 x，计算 2x² + 3x − 7，再将结果循环回绕至1～49。页面保留原始值和锚点期号供逐期核验。</p>
    {error && <div className="qa-panel qa-message qa-error">加载失败：{error}</div>}{!error && !data && <div className="qa-panel qa-message">正在计算500期滚动回测…</div>}{data?.status === 'insufficient-history' && <div className="qa-panel qa-message">{data.message}</div>}
    {prediction && <><div className="qa-hero"><section className="qa-panel qa-current"><p className="qa-kicker">当前推荐单杀</p><div className="qa-equation"><div className="qa-ball">{prediction.anchorDisplay}</div><span className="qa-op">2x² + 3x − 7</span><span className="qa-op">→</span><div className="qa-ball result">{prediction.display}</div></div><p className="qa-copy">{prediction.reason}</p><div className="qa-tags"><span className="qa-tag">原始值 {prediction.rawValue}</span><span className="qa-tag">{prediction.wrapFormula}</span><span className="qa-tag">锚点 {prediction.source.year}-{String(prediction.source.No).padStart(3,'0')}</span></div></section>
      <div className="qa-metrics"><Metric label="近20期" data={bt.backtest20}/><Metric label="近50期" data={bt.backtest50}/><Metric label="近100期" data={bt.backtest100}/><Metric label="近200期" data={bt.backtest200}/><div className="qa-long"><Metric label="近500期长期观察" data={bt.backtest500}/></div></div></div>
      <div className="qa-lower"><section className="qa-panel qa-card"><h3>本期计算</h3><div className="qa-calc"><div><span>53期前第2位 x</span><strong>{prediction.anchorNumber}</strong></div><div><span>二次公式</span><strong>2 × {prediction.anchorNumber}² + 3 × {prediction.anchorNumber} − 7</strong></div><div><span>原始结果</span><strong>{prediction.rawValue}</strong></div><div><span>循环回绕</span><strong>{prediction.wrapFormula}</strong></div></div></section>
      <section className="qa-panel qa-card qa-table-wrap"><h3>近20期逐期核验</h3><table className="qa-table"><thead><tr><th>开奖期</th><th>锚点期</th><th>x</th><th>完整公式</th><th>结果</th></tr></thead><tbody>{bt.backtest20.rows.map(row=><tr key={`${row.year}-${row.No}`}><td>{row.year}-{String(row.No).padStart(3,'0')}</td><td>{row.anchorYear}-{String(row.anchorNo).padStart(3,'0')}</td><td>{row.anchorDisplay}</td><td>{row.formula}</td><td className={row.success?'qa-ok':'qa-bad'}>{row.success?'成功':'失败'}</td></tr>)}</tbody></table></section></div></>}
  </div></main>;
}
