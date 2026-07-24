import { useEffect, useMemo, useState } from 'react';

const pct = (value) => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '--';
const ball = (value) => String(value ?? '--').padStart(2, '0');

function Balls({ numbers, compact = false }) {
  return <div className={`ar-balls ${compact ? 'is-compact' : ''}`}>
    {numbers.map((item) => {
      const value = typeof item === 'number' ? item : item.number;
      return <b key={value}>{ball(value)}</b>;
    })}
  </div>;
}

function TierCard({ tier, target, primary }) {
  const blind = tier.blindTest;
  return <article className={`ar-tier ${primary ? 'is-primary' : ''}`}>
    <div className="ar-tier-head">
      <div><span>第 {target.No} 期 · {tier.strategy}</span><h2>{tier.count} 个不出现号码</h2></div>
      <strong>{pct(blind.successRate)}</strong>
    </div>
    <Balls numbers={tier.numberValues}/>
    <div className="ar-tier-grid">
      <div><span>历史审计</span><b>{blind.successCount}/{blind.count}</b></div>
      <div><span>理论随机</span><b>{pct(tier.theoreticalBaseline)}</b></div>
      <div><span>最长连中</span><b>{blind.maxStreak} 期</b></div>
      <div><span>当前连中</span><b>{blind.currentStreak} 期</b></div>
    </div>
  </article>;
}

function Ledger({ tier }) {
  return <div className="ar-ledger">
    {tier.blindTest.latestRows.map((row) => <div className={row.success ? 'ok' : 'fail'} key={`${row.year}-${row.No}`}>
      <span>{row.year}-{String(row.No).padStart(3, '0')}</span>
      <span>{row.picks.map(ball).join(' · ')}</span>
      <b>{row.success ? '命中' : `失败：${row.appeared.map(ball).join('、')}`}</b>
    </div>)}
  </div>;
}

export default function RiskControlledFive() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selectedTier, setSelectedTier] = useState(3);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/risk-controlled-five', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`);
        return json;
      })
      .then(setData)
      .catch((reason) => reason.name !== 'AbortError' && setError(reason.message || '加载失败'));
    return () => controller.abort();
  }, []);

  const tier = useMemo(
    () => data?.current?.tiers?.find((item) => item.count === selectedTier),
    [data, selectedTier],
  );

  return <main className="ar-page"><style>{`
    .ar-page{min-height:100vh;padding:70px 18px 60px;box-sizing:border-box;background:#f3f0e8;color:#17201e;font-family:Inter,system-ui,sans-serif}.ar-shell{width:min(1160px,100%);margin:auto}.ar-panel{border:1px solid #c9cec7;background:#fffefa;box-shadow:0 22px 60px rgba(30,44,38,.08)}.ar-hero{display:grid;grid-template-columns:1.25fr .75fr;overflow:hidden}.ar-hero-main{padding:38px}.ar-kicker{color:#176a5e;font-size:11px;font-weight:900;letter-spacing:.12em}.ar-hero h1{margin:10px 0 14px;font-size:clamp(40px,6vw,72px);line-height:.93;letter-spacing:-.055em}.ar-hero p{max-width:720px;margin:0;color:#68736f;line-height:1.75}.ar-stamp{display:inline-flex;margin-top:24px;padding:9px 12px;border:1px solid #2c776b;color:#1c6258;font-size:11px;font-weight:900}.ar-truth{padding:30px;background:#173d37;color:#eef7f4}.ar-truth span{color:#a8c2bb;font-size:11px}.ar-truth strong{display:block;margin:10px 0 14px;font-size:28px;color:#f3d58d}.ar-truth p{color:#bed0cb;font-size:13px}.ar-split{margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.16)}.ar-split b,.ar-split span{display:block}.ar-split b{margin:5px 0}.ar-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}.ar-tier{padding:24px;border:1px solid #cdd2cb;background:#fffefa}.ar-tier.is-primary{border-top:5px solid #1c6d61;padding-top:20px}.ar-tier-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.ar-tier-head span{color:#75807c;font-size:11px}.ar-tier-head h2{margin:4px 0;font-size:19px}.ar-tier-head>strong{color:#1b675c;font-size:25px}.ar-balls{display:flex;flex-wrap:wrap;gap:9px;margin:21px 0}.ar-balls b{display:grid;place-items:center;width:50px;height:50px;border-radius:50%;background:#184f47;color:white;font-size:17px;box-shadow:inset 0 -7px 12px rgba(0,0,0,.18)}.ar-balls.is-compact{margin:0}.ar-balls.is-compact b{width:34px;height:34px;font-size:12px}.ar-tier-grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #dde0da}.ar-tier-grid div{padding:12px 8px 0}.ar-tier-grid span,.ar-tier-grid b{display:block}.ar-tier-grid span{color:#7b8581;font-size:10px}.ar-tier-grid b{margin-top:4px;font-size:14px}.ar-section{margin-top:16px;padding:28px}.ar-section-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:19px}.ar-section-head h2{margin:0;font-size:24px}.ar-section-head p{margin:0;color:#78827f;font-size:12px}.ar-tabs{display:flex;gap:7px}.ar-tabs button{padding:8px 13px;border:1px solid #c9cec7;background:#f3f2ed;cursor:pointer}.ar-tabs button.active{border-color:#1d695e;background:#1d695e;color:white}.ar-ledger{border-top:1px solid #d9ddd6}.ar-ledger>div{display:grid;grid-template-columns:140px 1fr 160px;gap:16px;padding:12px 8px;border-bottom:1px solid #e1e3de;font-size:12px}.ar-ledger .ok b{color:#16705f}.ar-ledger .fail{background:#fff3f0}.ar-ledger .fail b{color:#ad3e35}.ar-candidates{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.ar-candidate{padding:13px;border:1px solid #d5d9d2;background:#f7f6f1}.ar-candidate-head{display:flex;align-items:center;justify-content:space-between}.ar-mini{display:grid;place-items:center;width:33px;height:33px;border-radius:50%;background:#284f49;color:#fff;font-weight:900}.ar-candidate small,.ar-candidate span{color:#76817d;font-size:10px}.ar-candidate strong{display:block;margin:11px 0 3px}.ar-warning{margin-top:16px;padding:20px 24px;border-left:5px solid #c88d2f;background:#fff7e5;color:#69593a;line-height:1.7;font-size:13px}.ar-loading{padding:28px;border:1px solid #ccd1ca;background:#fffefa}.ar-error{color:#a63737}@media(max-width:900px){.ar-hero{grid-template-columns:1fr}.ar-tiers{grid-template-columns:1fr}.ar-candidates{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.ar-page{padding-inline:11px}.ar-hero-main,.ar-truth,.ar-section,.ar-tier{padding:20px}.ar-section-head{display:block}.ar-tabs{margin-top:12px}.ar-ledger>div{grid-template-columns:1fr;gap:4px}.ar-candidates{grid-template-columns:repeat(2,1fr)}}
  `}</style><div className="ar-shell">
    {error && <div className="ar-loading ar-error">加载失败：{error}</div>}
    {!error && !data && <div className="ar-loading">正在读取冻结模型与真实盲测账本…</div>}
    {data?.status === 'insufficient-history' && <div className="ar-loading">{data.message}</div>}
    {data?.current && <>
      <header className="ar-panel ar-hero">
        <div className="ar-hero-main">
          <div className="ar-kicker">ONLINE ABSENCE RISK · FROZEN MODEL</div>
          <h1>在线缺席<br/>风险引擎</h1>
          <p>{data.engine.statement}</p>
          <div className="ar-stamp">多层风险否决 · 5期/10期状态块 · 后60期历史审计</div>
        </div>
        <aside className="ar-truth">
          <span>真实结论</span>
          <strong>分档学习，不强行套同一规则</strong>
          <p>3码和4码按近期实战自动调整专家权重；5码额外使用5期与10期状态块过滤。第198期失败仍完整保留。</p>
          <div className="ar-split"><span>训练 / 开发截止</span><b>{data.split.development.end.year}-{data.split.development.end.No}</b><span>历史审计：2026-139 至 2026-198（{data.split.blindTest.count}期）</span></div>
        </aside>
      </header>

      <section className="ar-tiers">
        {data.current.tiers.map((item) => <TierCard key={item.count} tier={item} target={data.current.target} primary={item.count === 3}/>)}
      </section>

      <section className="ar-panel ar-section">
        <div className="ar-section-head"><div><h2>历史审计末段账本</h2><p>每一期只使用它之前的数据重新计算，红色失败完整保留；真实新账本从199期开始</p></div>
          <div className="ar-tabs">{[3, 4, 5].map((count) => <button key={count} className={selectedTier === count ? 'active' : ''} onClick={() => setSelectedTier(count)}>{count}码</button>)}</div>
        </div>
        {tier && <Ledger tier={tier}/>}
      </section>

      <section className="ar-panel ar-section">
        <div className="ar-section-head"><div><h2>下一期风险排序</h2><p>数值越低，模型估计的出现风险越低；它是排序指标，不是保证概率</p></div><Balls compact numbers={data.current.tiers[0].numberValues}/></div>
        <div className="ar-candidates">{data.current.candidatePool.map((item, index) => <div className="ar-candidate" key={item.number}>
          <div className="ar-candidate-head"><b className="ar-mini">{item.display}</b><span>#{index + 1}</span></div>
          <strong>{pct(item.riskIndex)}</strong><small>{item.familyVotes}类信号支持 · {item.supportSources?.slice(0, 2).join('、') || '综合风险排序'}</small>
        </div>)}</div>
      </section>

      <div className="ar-warning">{data.engine.warning} 若目标是“尽量连续”，优先使用3码档；4码与5码天然会显著降低整组全部不出现的概率。</div>
    </>}
  </div></main>;
}
