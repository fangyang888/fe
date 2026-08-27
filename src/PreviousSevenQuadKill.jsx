import { useEffect, useState } from 'react';
import KillBacktestMetric from './KillBacktestMetric';

function Metric({ label, data }) {
  return <KillBacktestMetric label={label} data={data} className="psq-metric" />;
}

export default function PreviousSevenQuadKill() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/previous-seven-quad', { cache: 'no-store', signal: controller.signal })
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

  return <main className="psq-page">
    <style>{`
      .psq-page{min-height:100vh;box-sizing:border-box;padding:72px 18px 48px;color:#f8fafc;background:radial-gradient(circle at 80% 0,rgba(129,140,248,.2),transparent 35%),#10111a;font-family:Inter,system-ui,sans-serif}
      .psq-shell{width:min(1160px,100%);margin:0 auto}.psq-kicker{margin:0 0 10px;color:#a5b4fc;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.psq-title{margin:0;font-size:clamp(32px,5vw,56px);line-height:1}.psq-subtitle{max-width:760px;margin:14px 0 26px;color:#aeb1c3;line-height:1.7}
      .psq-panel{border:1px solid rgba(165,180,252,.18);border-radius:20px;background:rgba(27,29,45,.86);box-shadow:0 24px 72px rgba(0,0,0,.28)}.psq-message{padding:24px;color:#c4c7d6}.psq-error{color:#fda4af}
      .psq-hero{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(380px,.92fr);gap:16px}.psq-current{padding:28px}.psq-formula{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:18px}.psq-ball{display:grid;place-items:center;width:96px;height:96px;border-radius:50%;background:#818cf8;color:#111329;font-size:38px;font-weight:950}.psq-ball.result{color:#fff;background:#4f46e5;box-shadow:0 16px 38px rgba(79,70,229,.35)}.psq-op{color:#c7d2fe;font-size:25px;font-weight:950}.psq-copy{margin:18px 0 0;color:#c9cad5;font-size:13px;line-height:1.65}.psq-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.psq-tag{padding:6px 10px;border-radius:999px;color:#c7d2fe;background:rgba(129,140,248,.11);font-size:11px;font-weight:800}
      .psq-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.psq-metric{padding:18px;border:1px solid rgba(129,140,248,.22);border-radius:16px;background:rgba(27,29,45,.68)}.psq-metric span,.psq-metric small{display:block;color:#969aad}.psq-metric strong{display:block;margin:7px 0 4px;font-size:30px}.psq-long{grid-column:1/-1}
      .psq-lower{display:grid;grid-template-columns:.72fr 1.28fr;gap:16px;margin-top:16px}.psq-card{padding:22px}.psq-card h3{margin:0 0 14px;font-size:17px}.psq-steps{display:grid;gap:10px}.psq-step{padding:13px;border-radius:12px;background:rgba(255,255,255,.035)}.psq-step b{display:block;color:#a5b4fc;font-size:12px}.psq-step span{display:block;margin-top:5px;color:#c2c4d0;font-size:13px;line-height:1.5}
      .psq-table-wrap{overflow-x:auto}.psq-table{width:100%;min-width:760px;border-collapse:collapse;font-size:13px}.psq-table th,.psq-table td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left}.psq-table th{color:#8f92a5;font-size:11px}.psq-ok{color:#a5b4fc;font-weight:850}.psq-bad{color:#fb7185;font-weight:850}
      @media(max-width:900px){.psq-hero,.psq-lower{grid-template-columns:1fr}.psq-long{grid-column:auto}}@media(max-width:520px){.psq-ball{width:78px;height:78px}.psq-op{font-size:18px}.psq-metrics{grid-template-columns:1fr 1fr}}
    `}</style>
    <div className="psq-shell">
      <p className="psq-kicker">Previous draw affine transform</p>
      <h1 className="psq-title">上一期七码四倍映射</h1>
      <p className="psq-subtitle">读取上一期第7位，执行“乘4减2”，再将结果循环回绕至1～49。公式和参数固定，不根据回测窗口临时切换。</p>
      {error && <div className="psq-panel psq-message psq-error">加载失败：{error}</div>}
      {!error && !data && <div className="psq-panel psq-message">正在计算500期滚动回测…</div>}
      {data?.status === 'insufficient-history' && <div className="psq-panel psq-message">{data.message}</div>}
      {prediction && <>
        <div className="psq-hero">
          <section className="psq-panel psq-current">
            <p className="psq-kicker">当前推荐单杀</p>
            <div className="psq-formula"><div className="psq-ball">{prediction.anchorDisplay}</div><span className="psq-op">× 4 − 2</span><span className="psq-op">→</span><div className="psq-ball result">{prediction.display}</div></div>
            <p className="psq-copy">{prediction.reason}</p>
            <div className="psq-tags"><span className="psq-tag">{prediction.formula}</span><span className="psq-tag">锚点 {prediction.source.year}-{String(prediction.source.No).padStart(3,'0')}</span><span className="psq-tag">数据库 {data.historyMeta.count} 期</span></div>
          </section>
          <div className="psq-metrics"><Metric label="近20期" data={bt.backtest20}/><Metric label="近50期" data={bt.backtest50}/><Metric label="近100期" data={bt.backtest100}/><Metric label="近200期" data={bt.backtest200}/><div className="psq-long"><Metric label="近500期长期观察" data={bt.backtest500}/></div></div>
        </div>
        <div className="psq-lower">
          <section className="psq-panel psq-card"><h3>固定计算流程</h3><div className="psq-steps"><div className="psq-step"><b>锚点</b><span>上一期开奖的第7位。</span></div><div className="psq-step"><b>线性变换</b><span>锚点乘4，然后减2。</span></div><div className="psq-step"><b>循环回绕</b><span>超过49时每次减49，直到进入1～49。</span></div><div className="psq-step"><b>参数冻结</b><span>始终使用第7位、乘4、减2。</span></div></div></section>
          <section className="psq-panel psq-card psq-table-wrap"><h3>近20期逐期核验</h3><table className="psq-table"><thead><tr><th>开奖期</th><th>锚点期</th><th>锚点</th><th>完整公式</th><th>结果</th></tr></thead><tbody>{bt.backtest20.rows.map(row=><tr key={`${row.year}-${row.No}`}><td>{row.year}-{String(row.No).padStart(3,'0')}</td><td>{row.anchorYear}-{String(row.anchorNo).padStart(3,'0')}</td><td>{row.anchorDisplay}</td><td>{row.formula}</td><td className={row.success?'psq-ok':'psq-bad'}>{row.success?'成功':'失败'}</td></tr>)}</tbody></table></section>
        </div>
      </>}
    </div>
  </main>;
}
