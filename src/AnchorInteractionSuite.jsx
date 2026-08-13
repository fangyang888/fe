import { useEffect, useState } from 'react';

const COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399'];
const pct = (value, count) => count > 0 && typeof value === 'number'
  ? `${(value * 100).toFixed(1)}%`
  : '--';
const period = (year, no) => `${year}-${String(no).padStart(3, '0')}`;

function Metric({ label, data, accent = false }) {
  return <div className={`ais-metric${accent ? ' accent' : ''}`}>
    <span>{label}</span>
    <strong>{pct(data?.successRate, data?.count)}</strong>
    <small>{data?.count ? `${data.successCount}/${data.count} 成功` : '暂无样本'}</small>
  </div>;
}

function FormulaModule({ model, color }) {
  const prediction = model.prediction;
  const bt = model.backtests;
  return <section className="ais-module" style={{ '--ais-accent': color }}>
    <header className="ais-module-head">
      <div>
        <div className="ais-kicker">{model.status === 'stable' ? 'STABLE' : 'WATCH'} · 独立固定公式</div>
        <h2>{model.name}</h2>
        <p>{model.description}</p>
      </div>
      <code>{model.formula}</code>
    </header>

    <div className="ais-hero">
      <article className="ais-prediction">
        <div className="ais-anchor-row">
          {prediction.anchors.map((anchor) => <div className="ais-anchor" key={anchor.symbol}>
            <span>{anchor.symbol}</span>
            <strong>{anchor.display}</strong>
            <small>{anchor.label}</small>
          </div>)}
          <span className="ais-arrow">→</span>
          <div className="ais-result"><span>单杀</span><strong>{prediction.display}</strong></div>
        </div>
        <p>{prediction.reason}</p>
        <div className="ais-tags">
          <span>原始值 {prediction.rawValue}</span>
          <span>{prediction.wrapFormula}</span>
          {prediction.anchors.map((anchor) =>
            <span key={`${anchor.symbol}-source`}>{anchor.symbol}：{period(anchor.source.year, anchor.source.No)}</span>
          )}
        </div>
      </article>

      <div className="ais-metrics">
        <Metric label="近20期" data={bt.backtest20} />
        <Metric label="近50期" data={bt.backtest50} />
        <Metric label="近100期" data={bt.backtest100} />
        <Metric label="近200期" data={bt.backtest200} />
        <Metric label="近500期" data={bt.backtest500} />
        <Metric label="199～224历史回放" data={model.historicalValidation} />
        <Metric label="225期起真实前瞻" data={model.validation} accent />
      </div>
    </div>

    <div className="ais-detail-grid">
      <article className="ais-calculation">
        <h3>本期完整计算</h3>
        {prediction.anchors.map((anchor) => <div key={`${anchor.symbol}-calc`}>
          <span>{anchor.label} · {anchor.symbol}</span>
          <strong>{anchor.number}</strong>
        </div>)}
        <div><span>固定公式</span><strong>{prediction.formula}</strong></div>
        <div><span>循环回绕</span><strong>{prediction.wrapFormula}</strong></div>
      </article>

      <article className="ais-table-card">
        <h3>近20期逐期核验</h3>
        <div className="ais-table-wrap"><table>
          <thead><tr><th>开奖期</th><th>锚点值</th><th>锚点期</th><th>预测</th><th>结果</th></tr></thead>
          <tbody>{bt.backtest20.rows.map((row) => <tr key={`${model.key}-${row.year}-${row.No}`}>
            <td>{period(row.year, row.No)}</td>
            <td>{row.anchors.map((anchor) => `${anchor.symbol}=${anchor.display}`).join(' / ')}</td>
            <td>{row.anchors.map((anchor) => period(anchor.year, anchor.No)).join(' / ')}</td>
            <td>{row.predictedDisplay}</td>
            <td className={row.success ? 'ais-ok' : 'ais-bad'}>{row.success ? '成功' : '失败'}</td>
          </tr>)}</tbody>
        </table></div>
      </article>
    </div>
  </section>;
}

export default function AnchorInteractionSuite() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/anchor-interaction-suite', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`);
        return json;
      })
      .then(setData)
      .catch((reason) => reason.name !== 'AbortError' && setError(reason.message || '加载失败'));
    return () => controller.abort();
  }, []);

  return <main className="ais-page"><style>{`
    .ais-page{min-height:100vh;padding:72px 18px 56px;box-sizing:border-box;color:#f8fafc;background:radial-gradient(circle at 10% 0,rgba(56,189,248,.14),transparent 30%),radial-gradient(circle at 90% 8%,rgba(167,139,250,.13),transparent 28%),#081018;font-family:Inter,system-ui,sans-serif}.ais-shell{width:min(1280px,100%);margin:0 auto}.ais-page-head{margin-bottom:28px}.ais-kicker{color:var(--ais-accent,#38bdf8);font-size:11px;font-weight:900;letter-spacing:.14em}.ais-page-head h1{margin:8px 0 12px;font-size:clamp(34px,5vw,60px);line-height:1}.ais-page-head p,.ais-module-head p{max-width:850px;margin:0;color:#94a3b8;line-height:1.7}.ais-message{padding:24px;border:1px solid #1e293b;border-radius:18px;background:#0f172a}.ais-error{color:#fda4af}.ais-module{--ais-accent:#38bdf8;margin-top:22px;padding:24px;border:1px solid color-mix(in srgb,var(--ais-accent) 28%,#1e293b);border-radius:24px;background:rgba(15,23,42,.88);box-shadow:0 24px 70px rgba(0,0,0,.24)}.ais-module-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:18px}.ais-module-head h2{margin:7px 0 9px;font-size:28px}.ais-module-head code{flex:none;max-width:46%;padding:10px 13px;border:1px solid color-mix(in srgb,var(--ais-accent) 35%,transparent);border-radius:12px;color:var(--ais-accent);background:color-mix(in srgb,var(--ais-accent) 8%,transparent);font-weight:800;white-space:normal}.ais-hero{display:grid;grid-template-columns:1.08fr .92fr;gap:14px}.ais-prediction,.ais-metric,.ais-calculation,.ais-table-card{border:1px solid #1e293b;border-radius:17px;background:rgba(2,6,23,.48)}.ais-prediction{padding:20px}.ais-anchor-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ais-anchor,.ais-result{display:grid;place-items:center;width:78px;height:78px;border-radius:50%;background:#172033}.ais-anchor span,.ais-result span{color:#94a3b8;font-size:10px;font-weight:900}.ais-anchor strong,.ais-result strong{font-size:25px;line-height:1}.ais-anchor small{max-width:66px;color:#64748b;font-size:8px;text-align:center}.ais-result{color:#071018;background:var(--ais-accent);box-shadow:0 12px 34px color-mix(in srgb,var(--ais-accent) 30%,transparent)}.ais-result span{color:#071018}.ais-arrow{color:var(--ais-accent);font-size:26px;font-weight:900}.ais-prediction>p{margin:16px 0 0;color:#cbd5e1;line-height:1.65}.ais-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:13px}.ais-tags span{padding:5px 8px;border-radius:999px;color:#bae6fd;background:#0c2637;font-size:10px}.ais-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ais-metric{padding:14px}.ais-metric span,.ais-metric small{display:block;color:#64748b}.ais-metric strong{display:block;margin:5px 0 3px;font-size:25px}.ais-metric.accent{border-color:color-mix(in srgb,var(--ais-accent) 45%,#1e293b)}.ais-metric.accent strong{color:var(--ais-accent)}.ais-detail-grid{display:grid;grid-template-columns:.68fr 1.32fr;gap:14px;margin-top:14px}.ais-calculation,.ais-table-card{padding:18px}.ais-calculation h3,.ais-table-card h3{margin:0 0 12px;font-size:15px}.ais-calculation div{padding:9px 0;border-bottom:1px solid #172033}.ais-calculation span{display:block;color:#64748b;font-size:10px}.ais-calculation strong{display:block;margin-top:4px;font-size:13px;line-height:1.5}.ais-table-wrap{overflow-x:auto}.ais-table-card table{width:100%;min-width:720px;border-collapse:collapse;font-size:11px}.ais-table-card th,.ais-table-card td{padding:8px 7px;border-bottom:1px solid #172033;text-align:left;white-space:nowrap}.ais-table-card th{color:#64748b}.ais-ok{color:#86efac;font-weight:900}.ais-bad{color:#fb7185;font-weight:900}@media(max-width:900px){.ais-module-head,.ais-hero,.ais-detail-grid{display:grid;grid-template-columns:1fr}.ais-module-head code{max-width:none}.ais-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:560px){.ais-page{padding-inline:10px}.ais-module{padding:15px}.ais-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.ais-anchor,.ais-result{width:66px;height:66px}.ais-anchor strong,.ais-result strong{font-size:21px}}
  `}</style><div className="ais-shell">
    <header className="ais-page-head">
      <div className="ais-kicker">FOUR FIXED FORMULAS · 2026-225起真实前瞻</div>
      <h1>锚点交互四公式统计</h1>
      <p>一个页面查看四种固定映射。199～224期仅作历史留出回放；公式在224期冻结，225期起独立累计真实前瞻结果，不根据成绩动态切换算法。</p>
    </header>
    {error && <div className="ais-message ais-error">加载失败：{error}</div>}
    {!error && !data && <div className="ais-message">正在计算四个模块的历史回测…</div>}
    {data?.status === 'insufficient-history' && <div className="ais-message">{data.message}</div>}
    {data?.models?.map((model, index) =>
      <FormulaModule key={model.key} model={model} color={COLORS[index % COLORS.length]} />
    )}
  </div></main>;
}
