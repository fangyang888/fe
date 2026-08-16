import { useEffect, useMemo, useState } from 'react';

const MODEL_KEY = 'fourAnchorDifferenceInteraction';
const RANDOM_BASELINE = 42 / 49;
const WINDOWS = [
  ['backtest20', '近20期'],
  ['backtest50', '近50期'],
  ['backtest100', '近100期'],
  ['backtest200', '近200期'],
  ['backtest500', '近500期'],
];

const pct = (value, digits = 1) =>
  Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '--';

const period = (year, no) =>
  year && Number.isFinite(Number(no))
    ? `${year}-${String(no).padStart(3, '0')}`
    : '--';

function Metric({ label, stats }) {
  const lift = stats?.count ? stats.successRate - RANDOM_BASELINE : null;
  return <article className="fad-metric">
    <span>{label}</span>
    <strong>{pct(stats?.successRate)}</strong>
    <small>{stats?.count ? `${stats.successCount}/${stats.count} 成功` : '暂无样本'}</small>
    <em className={lift >= 0 ? 'is-positive' : 'is-negative'}>
      {lift === null ? '等待数据' : `较随机基准 ${lift >= 0 ? '+' : ''}${(lift * 100).toFixed(1)} 个百分点`}
    </em>
  </article>;
}

function ValidationCard({ title, stats, accent = false }) {
  return <article className={`fad-validation${accent ? ' is-accent' : ''}`}>
    <span>{title}</span>
    <strong>{pct(stats?.successRate)}</strong>
    <small>{stats?.count ? `${stats.successCount}/${stats.count} 成功 · ${stats.failureCount} 失败` : stats?.message || '暂无样本'}</small>
  </article>;
}

export default function FourAnchorDifference() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [windowKey, setWindowKey] = useState('backtest50');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/anchor-interaction-suite', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.message || `HTTP ${response.status}`);
        return json;
      })
      .then(setData)
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message || '加载失败');
      });
    return () => controller.abort();
  }, []);

  const model = useMemo(
    () => data?.models?.find((item) => item.key === MODEL_KEY),
    [data],
  );
  const selectedWindow = model?.backtests?.[windowKey];
  const latest = data?.historyMeta?.latest;

  return <main className="fad-page"><style>{`
    .fad-page{--fad-bg:#07120f;--fad-panel:#0d1b17;--fad-panel-2:#11241e;--fad-line:rgba(110,231,183,.19);--fad-green:#6ee7b7;--fad-amber:#fbbf24;min-height:100vh;box-sizing:border-box;padding:78px 20px 56px;background:radial-gradient(circle at 82% -8%,rgba(52,211,153,.18),transparent 34rem),radial-gradient(circle at 4% 24%,rgba(251,191,36,.08),transparent 28rem),var(--fad-bg);color:#ecfdf5;font-family:Inter,system-ui,sans-serif}.fad-shell{width:min(1240px,100%);margin:0 auto}.fad-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:22px}.fad-kicker{color:var(--fad-green);font-size:11px;font-weight:950;letter-spacing:.16em}.fad-head h1{margin:8px 0 10px;font-size:clamp(38px,6vw,68px);line-height:.95;letter-spacing:-.04em}.fad-head p{max-width:770px;margin:0;color:#9ab5aa;line-height:1.7}.fad-status{flex:none;padding:9px 13px;border:1px solid var(--fad-line);border-radius:999px;color:var(--fad-green);background:rgba(110,231,183,.07);font-size:12px;font-weight:900}.fad-message{padding:22px;border:1px solid var(--fad-line);border-radius:16px;background:var(--fad-panel)}.fad-error{color:#fda4af}.fad-hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(290px,.75fr);gap:14px}.fad-card,.fad-metric,.fad-validation,.fad-table-card{border:1px solid var(--fad-line);border-radius:18px;background:linear-gradient(145deg,rgba(17,36,30,.96),rgba(9,24,19,.96));box-shadow:0 20px 55px rgba(0,0,0,.2)}.fad-card{padding:22px}.fad-card-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.fad-card-head span{color:#86a89b;font-size:11px;font-weight:900}.fad-card-head code{max-width:58%;color:var(--fad-amber);font-weight:900;text-align:right;white-space:normal}.fad-flow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:25px 0 18px}.fad-anchor{display:grid;place-items:center;width:86px;height:86px;border:1px solid rgba(110,231,183,.24);border-radius:18px;background:#0a1814}.fad-anchor span{color:#7f9f93;font-size:10px;font-weight:900}.fad-anchor strong{font-size:29px;line-height:1}.fad-anchor small{max-width:72px;color:#607b71;font-size:8px;text-align:center}.fad-operator{color:var(--fad-amber);font-size:24px;font-weight:950}.fad-result{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;background:var(--fad-green);color:#062018;box-shadow:0 16px 44px rgba(110,231,183,.2)}.fad-result span{font-size:10px;font-weight:950}.fad-result strong{font-size:44px;line-height:1}.fad-reason{margin:0;color:#c4d9d0;line-height:1.7}.fad-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:15px}.fad-tags span{padding:6px 9px;border-radius:999px;background:rgba(110,231,183,.08);color:#a7f3d0;font-size:10px;font-weight:800}.fad-calculation{display:grid;align-content:start;gap:0}.fad-calculation h2{margin:0 0 10px;font-size:17px}.fad-calc-row{padding:11px 0;border-bottom:1px solid var(--fad-line)}.fad-calc-row span{display:block;color:#739185;font-size:10px;font-weight:850}.fad-calc-row strong{display:block;margin-top:5px;color:#d9f5e9;font-size:13px;line-height:1.55}.fad-warning{margin-top:15px;padding:12px;border-left:2px solid var(--fad-amber);background:rgba(251,191,36,.07);color:#d8c88e;font-size:11px;line-height:1.6}.fad-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:14px}.fad-metric{padding:15px}.fad-metric span,.fad-metric small,.fad-metric em{display:block}.fad-metric span{color:#78978b;font-size:11px;font-weight:900}.fad-metric strong{display:block;margin:7px 0 3px;font-size:27px}.fad-metric small{color:#9db7ad;font-size:10px}.fad-metric em{margin-top:8px;font-size:9px;font-style:normal;font-weight:850}.fad-metric em.is-positive{color:#6ee7b7}.fad-metric em.is-negative{color:#fda4af}.fad-validations{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.fad-validation{padding:16px}.fad-validation span,.fad-validation small{display:block;color:#78978b;font-size:11px}.fad-validation strong{display:block;margin:5px 0;font-size:25px}.fad-validation.is-accent{border-color:rgba(251,191,36,.36)}.fad-validation.is-accent strong{color:var(--fad-amber)}.fad-table-card{margin-top:14px;padding:20px}.fad-table-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:14px}.fad-table-head h2{margin:0;font-size:20px}.fad-table-head p{margin:5px 0 0;color:#78978b;font-size:11px}.fad-tabs{display:flex;gap:6px;flex-wrap:wrap}.fad-tabs button{padding:7px 10px;border:1px solid var(--fad-line);border-radius:8px;background:#0a1814;color:#9db7ad;font-size:11px;font-weight:850}.fad-tabs button.is-active{border-color:var(--fad-green);background:var(--fad-green);color:#062018}.fad-table-wrap{overflow-x:auto}.fad-table{width:100%;min-width:860px;border-collapse:collapse;font-size:11px}.fad-table th,.fad-table td{padding:9px 8px;border-bottom:1px solid var(--fad-line);text-align:left;white-space:nowrap}.fad-table th{color:#78978b}.fad-table td{color:#c5dbd2}.fad-table tr.is-failure{background:rgba(244,63,94,.055)}.fad-ok{color:#6ee7b7!important;font-weight:950}.fad-bad{color:#fda4af!important;font-weight:950}.fad-foot{display:flex;justify-content:space-between;gap:16px;margin-top:12px;color:#607b71;font-size:10px}@media(max-width:920px){.fad-head,.fad-card-head,.fad-table-head{align-items:flex-start}.fad-hero{grid-template-columns:1fr}.fad-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:620px){.fad-page{padding:72px 10px 36px}.fad-head,.fad-card-head,.fad-table-head{display:grid}.fad-card-head code{max-width:none;text-align:left}.fad-metrics,.fad-validations{grid-template-columns:repeat(2,minmax(0,1fr))}.fad-anchor{width:72px;height:72px}.fad-result{width:88px;height:88px}.fad-foot{display:grid}}
  `}</style><div className="fad-shell">
    <header className="fad-head">
      <div>
        <div className="fad-kicker">FIXED FORMULA · OBSERVATION BOARD</div>
        <h1>四锚点差分交互</h1>
        <p>独立观察固定公式 4(a−b)(c−d) + (a+c) + (b+d) + 32。页面复用四公式接口，不重新训练、不动态换位。</p>
      </div>
      {model && <div className="fad-status">{model.status === 'stable' ? 'STABLE' : 'WATCH'} · 最新 {period(latest?.year, latest?.No)}</div>}
    </header>

    {error && <div className="fad-message fad-error">加载失败：{error}</div>}
    {!error && !data && <div className="fad-message">正在读取四锚点差分统计…</div>}
    {data?.status === 'insufficient-history' && <div className="fad-message">{data.message}</div>}
    {data && !model && data.status !== 'insufficient-history' && <div className="fad-message fad-error">接口中未找到四锚点差分模型。</div>}

    {model && <>
      <section className="fad-hero">
        <article className="fad-card">
          <div className="fad-card-head"><span>当前一期固定计算</span><code>{model.formula}</code></div>
          <div className="fad-flow">
            {model.prediction.anchors.map((anchor) => <div className="fad-anchor" key={anchor.symbol}>
              <span>{anchor.symbol}</span><strong>{anchor.display}</strong><small>{anchor.label}</small>
            </div>)}
            <span className="fad-operator">→</span>
            <div className="fad-result"><span>单杀</span><strong>{model.prediction.display}</strong></div>
          </div>
          <p className="fad-reason">{model.prediction.reason}</p>
          <div className="fad-tags">
            <span>原始值 {model.prediction.rawValue}</span>
            <span>{model.prediction.wrapFormula}</span>
            {model.prediction.anchors.map((anchor) => <span key={`${anchor.symbol}-period`}>
              {anchor.symbol}：{period(anchor.source.year, anchor.source.No)}
            </span>)}
          </div>
        </article>

        <article className="fad-card fad-calculation">
          <h2>公式拆解</h2>
          {model.prediction.anchors.map((anchor) => <div className="fad-calc-row" key={`${anchor.symbol}-calc`}>
            <span>{anchor.label} · {anchor.symbol}</span><strong>{anchor.number}</strong>
          </div>)}
          <div className="fad-calc-row"><span>代入计算</span><strong>{model.prediction.formula}</strong></div>
          <div className="fad-calc-row"><span>1～49循环回绕</span><strong>{model.prediction.wrapFormula}</strong></div>
          <div className="fad-warning">页面显示的是历史单杀成功率，不是下一期保证概率；随机单杀基准为 42/49 ≈ 85.7%。</div>
        </article>
      </section>

      <section className="fad-metrics" aria-label="滚动回测统计">
        {WINDOWS.map(([key, label]) => <Metric key={key} label={label} stats={model.backtests[key]} />)}
      </section>

      <section className="fad-validations">
        <ValidationCard title="199～224 历史回放" stats={model.historicalValidation} />
        <ValidationCard title="225期起真实前瞻" stats={model.validation} accent />
      </section>

      <section className="fad-table-card">
        <div className="fad-table-head">
          <div><h2>逐期观察</h2><p>失败期使用红色底纹标记；所有预测均按当期以前的锚点计算。</p></div>
          <div className="fad-tabs">
            {WINDOWS.map(([key, label]) => <button type="button" key={key} className={windowKey === key ? 'is-active' : ''} onClick={() => setWindowKey(key)}>{label}</button>)}
          </div>
        </div>
        <div className="fad-table-wrap"><table className="fad-table">
          <thead><tr><th>开奖期</th><th>锚点值</th><th>锚点来源期</th><th>原始值</th><th>单杀</th><th>结果</th></tr></thead>
          <tbody>{selectedWindow?.rows?.map((row) => <tr key={`${row.year}-${row.No}`} className={row.success ? '' : 'is-failure'}>
            <td>{period(row.year, row.No)}</td>
            <td>{row.anchors.map((anchor) => `${anchor.symbol}=${anchor.display}`).join(' / ')}</td>
            <td>{row.anchors.map((anchor) => period(anchor.year, anchor.No)).join(' / ')}</td>
            <td>{row.rawValue}</td>
            <td>{row.predictedDisplay}</td>
            <td className={row.success ? 'fad-ok' : 'fad-bad'}>{row.success ? '成功' : '失败'}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="fad-foot">
          <span>当前窗口：{selectedWindow?.successCount || 0} 成功 / {selectedWindow?.failureCount || 0} 失败</span>
          <span>接口生成：{data.generatedAt ? new Date(data.generatedAt).toLocaleString('zh-CN', { hour12: false }) : '--'}</span>
        </div>
      </section>
    </>}
  </div></main>;
}
