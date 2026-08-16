import { useEffect, useMemo, useState } from 'react';

const WINDOWS = [
  ['backtest20', '20期'], ['backtest50', '50期'], ['backtest100', '100期'],
  ['backtest200', '200期'], ['backtest500', '500期'],
];
const pct = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '--';
const period = (value) => value?.year && Number.isFinite(Number(value?.No))
  ? `${value.year}-${String(value.No).padStart(3, '0')}` : '--';

function Metric({ label, frozen, rolling }) {
  return <article className="dfc-metric">
    <span>{label}</span><strong>{pct(frozen?.successRate)}</strong>
    <small>冻结样本 {frozen?.successCount || 0}/{frozen?.count || 0}</small>
    <em>当前滚动 {pct(rolling?.successRate)}</em>
  </article>;
}

export default function DrawFingerprintControl() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [windowKey, setWindowKey] = useState('backtest50');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/draw-fingerprint-control', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.message || `HTTP ${response.status}`);
        return json;
      })
      .then(setData)
      .catch((reason) => reason.name !== 'AbortError' && setError(reason.message || '加载失败'));
    return () => controller.abort();
  }, []);

  const selected = useMemo(() => data?.rollingBacktests?.[windowKey], [data, windowKey]);
  const prediction = data?.prediction;
  const strategy = data?.strategy;

  return <main className="dfc-page"><style>{`
    .dfc-page{--ink:#14201d;--muted:#687a75;--line:#d6e1de;--paper:#f3f6f4;--green:#0f766e;--amber:#b45309;min-height:100vh;box-sizing:border-box;padding:78px 22px 54px;background:radial-gradient(circle at 82% 0,rgba(15,118,110,.1),transparent 30rem),var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}.dfc-shell{width:min(1220px,100%);margin:0 auto}.dfc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:26px;margin-bottom:22px}.dfc-kicker{color:var(--green);font-size:11px;font-weight:950;letter-spacing:.16em}.dfc-head h1{max-width:850px;margin:8px 0 11px;font-size:clamp(38px,6vw,72px);line-height:.94;letter-spacing:-.05em}.dfc-head p{max-width:790px;margin:0;color:var(--muted);line-height:1.7;font-weight:650}.dfc-badge{flex:none;padding:9px 13px;border:1px solid #f0c899;border-radius:999px;background:#fff7ed;color:var(--amber);font-size:11px;font-weight:950}.dfc-message,.dfc-card,.dfc-metric,.dfc-audit,.dfc-table-card{border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.92);box-shadow:0 16px 42px rgba(20,32,29,.06)}.dfc-message{padding:22px}.dfc-error{color:#be123c}.dfc-warning{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;margin-bottom:14px;padding:15px 17px;border:1px solid #fed7aa;border-radius:12px;background:#fff7ed;color:#9a3412}.dfc-warning b{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#fdba74;color:#7c2d12}.dfc-warning strong,.dfc-warning small{display:block}.dfc-warning small{margin-top:4px;line-height:1.55}.dfc-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,.7fr);gap:14px}.dfc-card{padding:22px}.dfc-card-label{color:var(--muted);font-size:11px;font-weight:900}.dfc-pick{display:flex;align-items:center;gap:24px;margin:18px 0}.dfc-ball{display:grid;place-items:center;width:132px;height:132px;border-radius:50%;background:var(--green);color:#fff;box-shadow:0 20px 44px rgba(15,118,110,.22)}.dfc-ball span{font-size:10px;font-weight:900}.dfc-ball strong{font-size:58px;line-height:.95}.dfc-pick-copy{display:grid;gap:8px}.dfc-pick-copy span{color:var(--muted);font-size:11px}.dfc-pick-copy strong{font-size:19px}.dfc-pick-copy code{color:var(--green);font-size:12px;font-weight:850;overflow-wrap:anywhere}.dfc-card>p{margin:0;color:#52645e;line-height:1.7}.dfc-numbers{display:flex;flex-wrap:wrap;gap:7px;margin-top:15px}.dfc-numbers span{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#e7efec;color:#27433c;font-size:12px;font-weight:900}.dfc-detail{display:grid;align-content:start}.dfc-detail h2{margin:0 0 11px;font-size:18px}.dfc-detail-row{padding:10px 0;border-bottom:1px solid var(--line)}.dfc-detail-row span,.dfc-detail-row strong{display:block}.dfc-detail-row span{color:var(--muted);font-size:10px;font-weight:850}.dfc-detail-row strong{margin-top:4px;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.dfc-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:14px}.dfc-metric{padding:15px}.dfc-metric span,.dfc-metric small,.dfc-metric em{display:block}.dfc-metric span{color:var(--muted);font-size:11px;font-weight:900}.dfc-metric strong{display:block;margin:5px 0;font-size:28px}.dfc-metric small{color:#6c8079;font-size:10px}.dfc-metric em{margin-top:8px;color:var(--green);font-size:10px;font-style:normal;font-weight:850}.dfc-audits{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.dfc-audit{padding:17px}.dfc-audit span,.dfc-audit small{display:block;color:var(--muted);font-size:11px}.dfc-audit strong{display:block;margin:6px 0;font-size:26px}.dfc-audit.is-prospective{border-color:#9dcfc9}.dfc-audit.is-prospective strong{color:var(--green)}.dfc-table-card{margin-top:14px;padding:20px}.dfc-table-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:13px}.dfc-table-head h2{margin:0;font-size:20px}.dfc-table-head p{margin:5px 0 0;color:var(--muted);font-size:11px}.dfc-tabs{display:flex;gap:6px;flex-wrap:wrap}.dfc-tabs button{padding:7px 10px;border:1px solid var(--line);border-radius:7px;background:#f5f8f7;color:#59716a;font-size:11px;font-weight:900}.dfc-tabs button.is-active{border-color:var(--green);background:var(--green);color:#fff}.dfc-table-wrap{overflow-x:auto}.dfc-table{width:100%;min-width:800px;border-collapse:collapse;font-size:11px}.dfc-table th,.dfc-table td{padding:9px 8px;border-bottom:1px solid #e4ece9;text-align:left;white-space:nowrap}.dfc-table th{color:var(--muted)}.dfc-table tr.is-failure{background:#fff1f2}.dfc-ok{color:var(--green);font-weight:950}.dfc-bad{color:#be123c;font-weight:950}.dfc-foot{margin-top:12px;color:#71827d;font-size:10px}@media(max-width:900px){.dfc-grid{grid-template-columns:1fr}.dfc-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:620px){.dfc-page{padding:72px 10px 34px}.dfc-head,.dfc-table-head{display:grid;align-items:start}.dfc-metrics,.dfc-audits{grid-template-columns:repeat(2,minmax(0,1fr))}.dfc-pick{align-items:flex-start}.dfc-ball{width:104px;height:104px}.dfc-ball strong{font-size:44px}}
  `}</style><div className="dfc-shell">
    <header className="dfc-head"><div><div className="dfc-kicker">OUT-OF-ROUTE · NEGATIVE CONTROL</div><h1>上一期开奖指纹哈希对照</h1><p>一个不在现有路由与锚点四公式中的固定映射。它用于观察“历史海选高分”在冻结后的真实表现，不作为高概率算法宣传。</p></div><div className="dfc-badge">负对照 · 2026-199起冻结验证</div></header>
    {error && <div className="dfc-message dfc-error">加载失败：{error}</div>}
    {!error && !data && <div className="dfc-message">正在计算固定指纹映射…</div>}
    {data?.status === 'insufficient-history' && <div className="dfc-message">{data.message}</div>}

    {prediction && <>
      <aside className="dfc-warning"><b>!</b><div><strong>参数海选警告</strong><small>{strategy.warning}</small></div></aside>
      <section className="dfc-grid">
        <article className="dfc-card"><span className="dfc-card-label">下一期固定结果 · {period(prediction.target)}</span><div className="dfc-pick"><div className="dfc-ball"><span>单杀对照</span><strong>{prediction.display}</strong></div><div className="dfc-pick-copy"><span>来源 {period(prediction.source)}</span><strong>上一期七码位置指纹</strong><code>{prediction.sourceSignatureHex} → {prediction.mixedValueHex}</code></div></div><p>{prediction.reason}</p><div className="dfc-numbers">{prediction.source.numbers.map((number, index) => <span key={`${number}-${index}`}>{String(number).padStart(2, '0')}</span>)}</div></article>
        <article className="dfc-card dfc-detail"><h2>固定规则</h2><div className="dfc-detail-row"><span>映射公式</span><strong>{strategy.formula}</strong></div><div className="dfc-detail-row"><span>冻结盐值</span><strong>{strategy.salt.toLocaleString('en-US')}</strong></div><div className="dfc-detail-row"><span>历史候选数量</span><strong>{strategy.searchedCandidateCount.toLocaleString('en-US')}</strong></div><div className="dfc-detail-row"><span>冻结点 / 前瞻起点</span><strong>{period(strategy.frozenAt)} / {period(strategy.prospectiveStart)}</strong></div><div className="dfc-detail-row"><span>本期最终计算</span><strong>{prediction.formula}</strong></div></article>
      </section>

      <section className="dfc-metrics">{WINDOWS.map(([key, label]) => <Metric key={key} label={label} frozen={data.frozenBacktests[key]} rolling={data.rollingBacktests[key]} />)}</section>
      <section className="dfc-audits"><article className="dfc-audit"><span>较早分段审计 · 20个入选参数</span><strong>{pct(data.offlineAudit.meanTestRate)}</strong><small>后段范围 {pct(data.offlineAudit.minTestRate)}～{pct(data.offlineAudit.maxTestRate)}；随机基准 {pct(data.offlineAudit.randomBaseline)}</small></article><article className="dfc-audit is-prospective"><span>199期起真实前瞻</span><strong>{pct(data.validation.successRate)}</strong><small>{data.validation.count ? `${data.validation.successCount}/${data.validation.count} 成功` : data.validation.message}</small></article></section>

      <section className="dfc-table-card"><div className="dfc-table-head"><div><h2>滚动逐期记录</h2><p>红色行为失败；冻结后只追加结果，不更换盐值。</p></div><div className="dfc-tabs">{WINDOWS.map(([key, label]) => <button type="button" key={key} className={windowKey === key ? 'is-active' : ''} onClick={() => setWindowKey(key)}>{label}</button>)}</div></div><div className="dfc-table-wrap"><table className="dfc-table"><thead><tr><th>开奖期</th><th>来源期</th><th>来源指纹</th><th>混合值</th><th>单杀</th><th>结果</th></tr></thead><tbody>{selected?.rows?.map((row) => <tr key={`${row.year}-${row.No}`} className={row.success ? '' : 'is-failure'}><td>{period(row)}</td><td>{period(row.source)}</td><td>0x{row.sourceSignature.toString(16).padStart(8, '0')}</td><td>{row.mixedValue}</td><td>{row.predictedDisplay}</td><td className={row.success ? 'dfc-ok' : 'dfc-bad'}>{row.success ? '成功' : '失败'}</td></tr>)}</tbody></table></div><div className="dfc-foot">历史成功率不是下一期概率。页面的核心观察指标是199期起冻结前瞻，而不是继续刷新样本内最高分。</div></section>
    </>}
  </div></main>;
}
