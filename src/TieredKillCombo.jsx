import { useEffect, useState } from 'react';

const pct = (value) => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '--';
const num = (value) => String(value ?? '--').padStart(2, '0');
const period = (year, no) => `${year}-${String(no).padStart(3, '0')}`;

function Stat({ label, data }) {
  return <div className="tc-stat"><span>{label}</span><strong>{pct(data?.successRate)}</strong><small>{data?.successCount || 0}/{data?.count || 0} · 平均{(data?.averageUniqueCount || 0).toFixed(2)}码</small></div>;
}

function Plan({ plan }) {
  const liveReady = (plan.live?.count || 0) > 0;
  return <section className={`tc-plan tc-${plan.key}`}>
    <header className="tc-plan-head">
      <div><h2>{plan.name}</h2><p>{plan.members.map(item => item.label).join(' · ')}</p></div>
      <div className="tc-theory"><span>随机理论基准</span><strong>{pct(plan.theoreticalRate)}</strong></div>
    </header>
    <div className="tc-current"><div><span>当前组合</span><div className="tc-balls">{plan.currentNumbers.map(n => <b key={n}>{num(n)}</b>)}</div></div><small>{plan.currentUniqueCount}/{plan.nominalCount} 个唯一号码</small></div>
    <div className="tc-stats">
      <Stat label="截至180 · 近20期" data={plan.frozenBacktests.backtest20}/>
      <Stat label="截至180 · 近50期" data={plan.frozenBacktests.backtest50}/>
      <Stat label="截至180 · 近100期" data={plan.frozenBacktests.backtest100}/>
      <Stat label="截至180 · 近200期" data={plan.frozenBacktests.backtest200}/>
      <Stat label="截至180 · 近500期" data={plan.frozenBacktests.backtest500}/>
    </div>
    <div className="tc-checkpoints">
      <div><span>181–198期验证</span><strong>{pct(plan.validation.successRate)}</strong><small>{plan.validation.successCount}/{plan.validation.count}</small></div>
      <div className={liveReady ? 'live' : 'waiting'}><span>199期起实盘</span><strong>{liveReady ? pct(plan.live.successRate) : '等待开奖'}</strong><small>{liveReady ? `${plan.live.successCount}/${plan.live.count}` : '参数与成员已锁定'}</small></div>
    </div>
  </section>;
}

export default function TieredKillCombo() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/tiered-combo', { cache: 'no-store', signal: controller.signal })
      .then(async response => { const json = await response.json(); if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`); return json; })
      .then(setData).catch(reason => reason.name !== 'AbortError' && setError(reason.message || '加载失败'));
    return () => controller.abort();
  }, []);

  const liveRows = data?.plans?.[data.plans.length - 1]?.live?.rows || [];
  return <main className="tc-page"><style>{`
    .tc-page{min-height:100vh;padding:70px 18px 50px;box-sizing:border-box;color:#e8f0ef;background:#0b1413;font-family:Inter,system-ui,sans-serif}.tc-shell{width:min(1180px,100%);margin:auto}.tc-header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:28px}.tc-header h1{margin:0;font-size:clamp(34px,5vw,58px);line-height:1;letter-spacing:-.04em}.tc-header p{max-width:700px;margin:14px 0 0;color:#8fa3a0;line-height:1.7}.tc-cutoff{text-align:right;color:#7dd3c7;font-size:13px;font-weight:800}.tc-message{padding:22px;border:1px solid #263b38;background:#111f1d}.tc-error{color:#fda4af}.tc-plans{display:grid;gap:18px}.tc-plan{border:1px solid #253a37;background:#101d1b}.tc-plan-head{display:flex;justify-content:space-between;gap:20px;padding:24px 26px;border-bottom:1px solid #253a37}.tc-plan-head h2{margin:0;font-size:25px}.tc-plan-head p{margin:8px 0 0;color:#869b98;font-size:12px;line-height:1.6}.tc-theory{text-align:right;flex:none}.tc-theory span,.tc-current span,.tc-stat span,.tc-stat small,.tc-checkpoints span,.tc-checkpoints small{display:block;color:#7f9491;font-size:11px}.tc-theory strong{display:block;margin-top:5px;font-size:22px;color:#b7c7c5}.tc-current{display:flex;justify-content:space-between;align-items:end;gap:18px;padding:22px 26px;background:#0d1917}.tc-balls{display:flex;gap:9px;flex-wrap:wrap;margin-top:10px}.tc-balls b{display:grid;place-items:center;width:49px;height:49px;border-radius:50%;background:#c7f9ef;color:#073b35;font-size:18px}.tc-current small{color:#718682}.tc-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid #253a37;border-bottom:1px solid #253a37}.tc-stat{padding:18px 20px;border-right:1px solid #253a37}.tc-stat:last-child{border-right:0}.tc-stat strong{display:block;margin:7px 0 4px;font-size:25px}.tc-checkpoints{display:grid;grid-template-columns:1fr 1fr}.tc-checkpoints>div{padding:20px 26px}.tc-checkpoints>div+div{border-left:1px solid #253a37}.tc-checkpoints strong{display:block;margin:6px 0 3px;font-size:27px;color:#7dd3c7}.tc-checkpoints .waiting strong{color:#fbbf24}.tc-table-section{margin-top:20px;padding:24px 26px;border:1px solid #253a37;background:#101d1b}.tc-table-section h2{margin:0 0 15px}.tc-empty{padding:28px 0;color:#819693;border-top:1px solid #253a37}.tc-table-wrap{overflow:auto}.tc-table{width:100%;min-width:760px;border-collapse:collapse}.tc-table th,.tc-table td{padding:11px 9px;border-bottom:1px solid #253a37;text-align:left;font-size:13px}.tc-table th{color:#718783;font-size:11px}.tc-ok{color:#86efac}.tc-bad{color:#fb7185}@media(max-width:850px){.tc-header{display:block}.tc-cutoff{text-align:left;margin-top:14px}.tc-stats{grid-template-columns:repeat(2,1fr)}.tc-stat{border-bottom:1px solid #253a37}.tc-plan-head,.tc-current{align-items:flex-start}.tc-plan-head{display:block}.tc-theory{text-align:left;margin-top:14px}.tc-current{display:block}.tc-current small{display:block;margin-top:12px}}@media(max-width:520px){.tc-page{padding-inline:12px}.tc-checkpoints{grid-template-columns:1fr}.tc-checkpoints>div+div{border-left:0;border-top:1px solid #253a37}.tc-stats{grid-template-columns:1fr}.tc-balls b{width:43px;height:43px}.tc-plan-head,.tc-current,.tc-stat,.tc-checkpoints>div{padding-left:18px;padding-right:18px}}
  `}</style><div className="tc-shell">
    <header className="tc-header"><div><h1>分档组合杀码</h1><p>固定选择基础4个、增强6个与最强7个算法源。整组任意号码开出即判失败，重复推荐自动合并。</p></div><div className="tc-cutoff">180期封存 · 181–198验证 · 199期起实盘</div></header>
    {error && <div className="tc-message tc-error">加载失败：{error}</div>}
    {!error && !data && <div className="tc-message">正在计算组合回测…</div>}
    {data?.status === 'insufficient-history' && <div className="tc-message">{data.message}</div>}
    {data?.plans && <div className="tc-plans">{data.plans.map(plan => <Plan plan={plan} key={plan.key}/>)}</div>}
    {data?.plans && <section className="tc-table-section"><h2>199期起逐期统计</h2>{liveRows.length === 0 ? <div className="tc-empty">暂无199期及以后数据。同步新开奖后，这里会自动累计，不重新选择组合成员。</div> : <div className="tc-table-wrap"><table className="tc-table"><thead><tr><th>期号</th><th>最强7个实际杀码</th><th>唯一号码数</th><th>开奖号码</th><th>结果</th></tr></thead><tbody>{liveRows.map(row => <tr key={`${row.year}-${row.No}`}><td>{period(row.year,row.No)}</td><td>{row.numbers.map(num).join('、')}</td><td>{row.uniqueCount}</td><td>{row.actualNumbers.map(num).join('、')}</td><td className={row.success?'tc-ok':'tc-bad'}>{row.success?'整组成功':'整组失败'}</td></tr>)}</tbody></table></div>}</section>}
  </div></main>;
}
