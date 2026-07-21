import { useEffect, useState } from 'react';

const pct = (value) => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '--';
const num = (value) => String(value ?? '--').padStart(2, '0');

function BallList({ numbers, muted = false }) {
  return <div className={`rcf-balls ${muted ? 'is-muted' : ''}`}>
    {numbers.map((item) => {
      const value = typeof item === 'number' ? item : item.number;
      return <b key={value}>{num(value)}</b>;
    })}
  </div>;
}

function Metric({ label, value, detail, tone = '' }) {
  return <div className={`rcf-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function BacktestCard({ label, adaptive, forced }) {
  return <article className="rcf-backtest-card">
    <h3>{label}</h3>
    <div className="rcf-backtest-lines">
      <div><span>风险受控</span><strong>{pct(adaptive?.successRate)}</strong><small>{adaptive?.successCount || 0}/{adaptive?.issuedCount || 0} · 覆盖 {pct(adaptive?.coverageRate)} · 均值 {(adaptive?.averageIssuedCount || 0).toFixed(2)}码</small></div>
      <div><span>每期强制五码</span><strong>{pct(forced?.successRate)}</strong><small>{forced?.successCount || 0}/{forced?.count || 0} · 随机基准 {pct(forced?.randomBaseline)}</small></div>
    </div>
  </article>;
}

function Alternative({ option, active }) {
  return <article className={`rcf-alt ${active ? 'is-active' : ''}`}>
    <div className="rcf-alt-head"><strong>{option.count}杀方案</strong><span>保守 {pct(option.conservativeRate)}</span></div>
    <BallList numbers={option.numberValues} muted={!active}/>
    <div className="rcf-alt-meta"><span>估计 {pct(option.estimatedRate)}</span><span>近40期 {pct(option.recentRate)}</span><span>随机 {pct(option.randomBaseline)}</span><span>{option.familyCount} 类来源</span></div>
  </article>;
}

function CandidateRow({ candidate, index }) {
  return <tr>
    <td>{index + 1}</td>
    <td><span className="rcf-mini-ball">{candidate.display}</span></td>
    <td>{pct(candidate.avoidScore)}</td>
    <td>{candidate.sources.map((source) => source.label).join(' · ')}</td>
    <td>{candidate.families.join(' · ')}</td>
  </tr>;
}

export default function RiskControlledFive() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

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

  const current = data?.currentRecommendation;
  const backtests = data?.backtests;
  const latest = data?.historyMeta?.latest;
  const live = data?.liveTracking;

  return <main className="rcf-page"><style>{`
    .rcf-page{min-height:100vh;padding:76px 18px 56px;box-sizing:border-box;background:#f0eee8;color:#1e2927;font-family:Inter,system-ui,sans-serif}.rcf-shell{width:min(1180px,100%);margin:auto}.rcf-hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:18px}.rcf-panel{border:1px solid #c9cdc5;background:#faf9f5;box-shadow:0 18px 48px rgba(37,48,43,.08)}.rcf-main{padding:34px}.rcf-kicker{color:#267165;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.rcf-main h1{margin:10px 0 12px;font-size:clamp(34px,5vw,62px);line-height:.98;letter-spacing:-.05em}.rcf-intro{max-width:760px;margin:0;color:#66716d;line-height:1.7}.rcf-decision{margin-top:30px;padding-top:25px;border-top:1px solid #d7dad3}.rcf-decision-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.rcf-decision-head span{display:block;color:#71807a;font-size:12px}.rcf-decision-head strong{display:block;margin-top:5px;font-size:27px}.rcf-gate{max-width:520px;text-align:right;color:#50605b;font-size:13px}.rcf-balls{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.rcf-balls b,.rcf-mini-ball{display:grid;place-items:center;border-radius:50%;background:#174f47;color:#f5fffb;font-weight:900}.rcf-balls b{width:58px;height:58px;font-size:20px;box-shadow:inset 0 -8px 14px rgba(0,0,0,.16)}.rcf-balls.is-muted b{background:#dfe2dc;color:#4f5d59;box-shadow:none}.rcf-empty{margin-top:16px;padding:18px;border:1px dashed #bfc6bd;color:#8a5e1f;background:#fff8e8}.rcf-side{padding:26px;display:flex;flex-direction:column;justify-content:space-between;background:#173b36;color:#eef8f5;border-color:#173b36}.rcf-side h2{margin:0;font-size:20px}.rcf-side p{color:#b7cbc5;line-height:1.65;font-size:13px}.rcf-metrics{display:grid;grid-template-columns:1fr 1fr;margin-top:24px;border:1px solid rgba(255,255,255,.15)}.rcf-metric{padding:16px;border-bottom:1px solid rgba(255,255,255,.15)}.rcf-metric:nth-child(odd){border-right:1px solid rgba(255,255,255,.15)}.rcf-metric span,.rcf-metric small{display:block;color:#9db8b1;font-size:11px}.rcf-metric strong{display:block;margin:6px 0 3px;font-size:24px}.rcf-live{margin-top:20px;padding:17px;border:1px solid rgba(255,255,255,.17);background:rgba(255,255,255,.04)}.rcf-live span,.rcf-live small{display:block;color:#aac1bb;font-size:11px}.rcf-live strong{display:block;margin:5px 0;color:#f6d58b;font-size:21px}.rcf-section{margin-top:18px;padding:26px}.rcf-section-title{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:18px}.rcf-section-title h2{margin:0;font-size:24px}.rcf-section-title p{margin:0;color:#77817e;font-size:12px}.rcf-alts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.rcf-alt{padding:18px;border:1px solid #d2d6ce;background:#f5f4ef}.rcf-alt.is-active{border-color:#2b7569;background:#eff9f5}.rcf-alt-head{display:flex;justify-content:space-between;gap:12px}.rcf-alt-head span{color:#397b70;font-weight:800}.rcf-alt .rcf-balls b{width:42px;height:42px;font-size:15px}.rcf-alt-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:15px;color:#6e7a76;font-size:11px}.rcf-backtests{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.rcf-backtest-card{border:1px solid #d2d6ce;background:#f7f6f2;padding:16px}.rcf-backtest-card h3{margin:0 0 13px;font-size:14px}.rcf-backtest-lines>div+div{margin-top:12px;padding-top:12px;border-top:1px solid #d8dbd5}.rcf-backtest-lines span,.rcf-backtest-lines small{display:block;color:#73807b;font-size:10px}.rcf-backtest-lines strong{display:block;margin:4px 0;font-size:21px}.rcf-table-wrap{overflow:auto}.rcf-table{width:100%;min-width:820px;border-collapse:collapse}.rcf-table th,.rcf-table td{padding:12px 10px;border-bottom:1px solid #dde0da;text-align:left;font-size:12px}.rcf-table th{color:#74807c;font-size:10px}.rcf-mini-ball{width:32px;height:32px}.rcf-note{margin-top:18px;padding:20px 22px;border-left:4px solid #c39032;background:#fff7e7;color:#685b40;line-height:1.7;font-size:13px}.rcf-loading{padding:28px;border:1px solid #c9cdc5;background:#faf9f5}.rcf-error{color:#a22c3b}@media(max-width:900px){.rcf-hero{grid-template-columns:1fr}.rcf-alts{grid-template-columns:1fr}.rcf-backtests{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.rcf-page{padding-inline:12px}.rcf-main,.rcf-side,.rcf-section{padding:20px}.rcf-decision-head,.rcf-section-title{display:block}.rcf-gate{text-align:left;margin-top:10px}.rcf-backtests{grid-template-columns:1fr}.rcf-balls b{width:50px;height:50px}}
  `}</style><div className="rcf-shell">
    {error && <div className="rcf-loading rcf-error">加载失败：{error}</div>}
    {!error && !data && <div className="rcf-loading">正在进行联合风险滚动计算…</div>}
    {data?.status === 'insufficient-history' && <div className="rcf-loading">{data.message}</div>}
    {current && <>
      <div className="rcf-hero">
        <section className="rcf-panel rcf-main">
          <div className="rcf-kicker">Joint risk control · 3–5</div>
          <h1>风险受控五码</h1>
          <p className="rcf-intro">不把单个杀码的成功率相乘，直接评估来源组合同时避开开奖号码的历史表现。证据不足时自动减少杀码数量。</p>
          <div className="rcf-decision">
            <div className="rcf-decision-head"><div><span>第 {Number(latest?.No || 0) + 1} 期当前决策</span><strong>{current.modeLabel}</strong></div><div className="rcf-gate">{current.gateReason}</div></div>
            {current.numbers.length ? <BallList numbers={current.numbers}/> : <div className="rcf-empty">本期联合风险没有通过任何档位门槛，建议观望，不强行凑满五码。</div>}
          </div>
        </section>
        <aside className="rcf-panel rcf-side">
          <div><h2>当前联合风险</h2><p>“估计”经过随机基准收缩；“保守值”再扣除统计不确定性与同族来源惩罚。</p>
            <div className="rcf-metrics">
              <Metric label="保守成功率" value={pct(current.conservativeSetRate)} detail="用于是否发出"/>
              <Metric label="联合估计" value={pct(current.estimatedSetRate)} detail={`较随机 +${pct(current.liftOverRandom)}`}/>
              <Metric label="近40期联合" value={pct(current.recentSetRate)} detail="近期状态"/>
              <Metric label="随机理论基准" value={pct(current.randomBaseline)} detail={`${current.issuedCount} 个唯一号码`}/>
            </div>
          </div>
          <div className="rcf-live"><span>199期起实盘账本</span><strong>{live?.periodCount ? pct(live.successRate) : '等待开奖'}</strong><small>{live?.periodCount ? `${live.successCount}/${live.issuedCount} · 覆盖 ${pct(live.coverageRate)}` : '当前数据库截至198期，下一期开始独立累计'}</small></div>
        </aside>
      </div>

      <section className="rcf-panel rcf-section">
        <div className="rcf-section-title"><h2>3–5杀分档</h2><p>绿色边框为本期实际采用档位</p></div>
        <div className="rcf-alts">{current.alternatives.map((option) => <Alternative key={option.count} option={option} active={option.count === current.issuedCount}/>)}</div>
      </section>

      <section className="rcf-panel rcf-section">
        <div className="rcf-section-title"><h2>严格滚动对照</h2><p>风险受控统计只计算实际发出的期；强制五码每期都出5个</p></div>
        <div className="rcf-backtests">
          {[20, 50, 100, 200, 500].map((count) => <BacktestCard key={count} label={`近${count}期`} adaptive={backtests[`adaptive${count}`]} forced={backtests[`forcedFive${count}`]}/>) }
        </div>
      </section>

      <section className="rcf-panel rcf-section">
        <div className="rcf-section-title"><h2>当前候选池</h2><p>最多8个号码，再枚举组合寻找最低联合风险</p></div>
        <div className="rcf-table-wrap"><table className="rcf-table"><thead><tr><th>排名</th><th>号码</th><th>单号保守避开率</th><th>支持来源</th><th>来源家族</th></tr></thead><tbody>{current.candidatePool.map((candidate, index) => <CandidateRow key={candidate.number} candidate={candidate} index={index}/>)}</tbody></table></div>
      </section>

      <div className="rcf-note">{data.methodology.warning} 当前页面的历史滚动回测仍继承已有公式的历史研发偏差，因此不会把历史成绩包装成未来100%保证；真正可信的成绩从第199期起单独累计。</div>
    </>}
  </div></main>;
}
