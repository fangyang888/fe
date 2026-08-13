import { useEffect, useState } from 'react';

const pct = (value, count) => count > 0 && typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '--';

function Metric({ label, data, accent = false }) {
  const count = data?.count || 0;
  return <article className={`q49-metric${accent ? ' q49-accent' : ''}`}><span>{label}</span><strong>{pct(data?.successRate, count)}</strong><small>{count > 0 ? `${data?.successCount || 0}/${count} 成功` : '暂无已开奖样本'}</small></article>;
}

export default function QuadraticAnchor49SevenKill({
  endpoint = '/api/kill/quadratic-anchor-49-seven',
  title = '49期七码二次锚点',
  subtitle = '固定读取49期前第7位 x，计算 −4x² + x + 20，再循环回绕至1～49。参数以2026年第180期为截止点封存，181期以后单独作为样本外验证。',
  formulaLabel = '−4x² + x + 20',
  anchorLabel = '49期前第7位 x',
  calculation = (x) => `−4 × ${x}² + ${x} + 20`,
  validationLabel = '样本外验证',
  renderEquation,
  renderTags,
  renderCalculation,
  renderTableHead,
  renderTableRow,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`);
        return json;
      })
      .then(setData)
      .catch((reason) => reason.name !== 'AbortError' && setError(reason.message || '加载失败'));
    return () => controller.abort();
  }, [endpoint]);

  const prediction = data?.prediction;
  const bt = data?.backtests || {};
  const historicalValidation = data?.historicalValidation;
  const validation = data?.validation;

  return <main className="q49-page"><style>{`
    .q49-page{min-height:100vh;box-sizing:border-box;padding:72px 18px 48px;color:#fff7ed;background:radial-gradient(circle at 12% 0,rgba(249,115,22,.2),transparent 35%),#17110d;font-family:Inter,system-ui,sans-serif}.q49-shell{width:min(1160px,100%);margin:0 auto}.q49-kicker{margin:0 0 10px;color:#fb923c;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.q49-title{margin:0;font-size:clamp(32px,5vw,56px);line-height:1}.q49-subtitle{max-width:820px;margin:14px 0 26px;color:#c9b7aa;line-height:1.7}
    .q49-panel{border:1px solid rgba(251,146,60,.2);border-radius:20px;background:rgba(43,31,23,.88);box-shadow:0 24px 72px rgba(0,0,0,.28)}.q49-message{padding:24px;color:#ddc9ba}.q49-error{color:#fda4af}.q49-hero{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(380px,.92fr);gap:16px}.q49-current{padding:28px}.q49-equation{display:flex;align-items:center;gap:15px;flex-wrap:wrap;margin-top:18px}.q49-ball{display:grid;place-items:center;width:98px;height:98px;border-radius:50%;color:#431407;background:#fdba74;font-size:38px;font-weight:950}.q49-ball.result{color:#fff7ed;background:#ea580c;box-shadow:0 16px 38px rgba(234,88,12,.34)}.q49-op{color:#fed7aa;font-size:21px;font-weight:900}.q49-copy{margin:18px 0 0;color:#dfcec1;font-size:13px;line-height:1.65}.q49-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.q49-tag{padding:6px 10px;border-radius:999px;color:#fed7aa;background:rgba(249,115,22,.1);font-size:11px;font-weight:800}
    .q49-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.q49-metric{padding:18px;border:1px solid rgba(251,146,60,.2);border-radius:16px;background:rgba(43,31,23,.7)}.q49-metric span,.q49-metric small{display:block;color:#b9a497}.q49-metric strong{display:block;margin:7px 0 4px;font-size:30px}.q49-wide{grid-column:1/-1}.q49-accent{border-color:rgba(74,222,128,.42);background:rgba(20,83,45,.23)}.q49-accent span,.q49-accent strong{color:#86efac}.q49-lower{display:grid;grid-template-columns:.76fr 1.24fr;gap:16px;margin-top:16px}.q49-card{padding:22px}.q49-card h3{margin:0 0 14px;font-size:17px}.q49-calc{display:grid;gap:10px}.q49-calc div{padding:13px;border-radius:12px;background:rgba(255,255,255,.035)}.q49-calc span{display:block;color:#b49e90;font-size:11px}.q49-calc strong{display:block;margin-top:5px;font-size:17px}.q49-table-wrap{overflow-x:auto}.q49-table{width:100%;min-width:780px;border-collapse:collapse;font-size:13px}.q49-table th,.q49-table td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left}.q49-table th{color:#a78f81;font-size:11px}.q49-ok{color:#86efac;font-weight:850}.q49-bad{color:#fb7185;font-weight:850}@media(max-width:900px){.q49-hero,.q49-lower{grid-template-columns:1fr}.q49-wide{grid-column:auto}}@media(max-width:520px){.q49-ball{width:78px;height:78px}.q49-op{font-size:16px}.q49-metrics{grid-template-columns:1fr 1fr}}
  `}</style><div className="q49-shell">
    <p className="q49-kicker">Frozen out-of-sample candidate</p>
    <h1 className="q49-title">{title}</h1>
    <p className="q49-subtitle">{subtitle}</p>
    {error && <div className="q49-panel q49-message q49-error">加载失败：{error}</div>}
    {!error && !data && <div className="q49-panel q49-message">正在计算历史回测与样本外验证…</div>}
    {data?.status === 'insufficient-history' && <div className="q49-panel q49-message">{data.message}</div>}
    {prediction && <><div className="q49-hero"><section className="q49-panel q49-current"><p className="q49-kicker">当前推荐单杀</p><div className="q49-equation">{renderEquation ? renderEquation(prediction) : <><div className="q49-ball">{prediction.anchorDisplay}</div><span className="q49-op">{formulaLabel}</span><span className="q49-op">→</span><div className="q49-ball result">{prediction.display}</div></>}</div><p className="q49-copy">{prediction.reason}</p><div className="q49-tags">{renderTags ? renderTags(prediction) : <><span className="q49-tag">原始值 {prediction.rawValue}</span><span className="q49-tag">{prediction.wrapFormula}</span><span className="q49-tag">锚点 {prediction.source.year}-{String(prediction.source.No).padStart(3, '0')}</span></>}</div></section>
      <div className="q49-metrics"><Metric label="近20期" data={bt.backtest20}/><Metric label="近50期" data={bt.backtest50}/><Metric label="近100期" data={bt.backtest100}/><Metric label="近200期" data={bt.backtest200}/>{historicalValidation && <div className="q49-wide"><Metric label={`历史留出回放 · ${historicalValidation.start?.No || 199}～${historicalValidation.end?.No || 224}期`} data={historicalValidation}/></div>}<div className="q49-wide"><Metric label={`${validationLabel} · ${validation?.start?.year || 2026}-${validation?.start?.No || 181}期起`} data={validation} accent/></div><div className="q49-wide"><Metric label="近500期长期观察" data={bt.backtest500}/></div></div></div>
      <div className="q49-lower"><section className="q49-panel q49-card"><h3>本期计算</h3><div className="q49-calc">{renderCalculation ? renderCalculation(prediction) : <><div><span>{anchorLabel}</span><strong>{prediction.anchorNumber}</strong></div><div><span>二次公式</span><strong>{calculation(prediction.anchorNumber)}</strong></div><div><span>原始结果</span><strong>{prediction.rawValue}</strong></div><div><span>循环回绕</span><strong>{prediction.wrapFormula}</strong></div></>}</div></section>
      <section className="q49-panel q49-card q49-table-wrap"><h3>近20期逐期核验</h3><table className="q49-table"><thead>{renderTableHead ? renderTableHead() : <tr><th>开奖期</th><th>锚点期</th><th>x</th><th>完整公式</th><th>结果</th></tr>}</thead><tbody>{bt.backtest20?.rows?.map(row => renderTableRow ? renderTableRow(row) : <tr key={`${row.year}-${row.No}`}><td>{row.year}-{String(row.No).padStart(3, '0')}</td><td>{row.anchorYear}-{String(row.anchorNo).padStart(3, '0')}</td><td>{row.anchorDisplay}</td><td>{row.formula}</td><td className={row.success ? 'q49-ok' : 'q49-bad'}>{row.success ? '成功' : '失败'}</td></tr>)}</tbody></table></section></div></>}
  </div></main>;
}
