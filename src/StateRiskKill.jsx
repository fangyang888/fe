import { useEffect, useState } from 'react';

const num = (value) => String(value ?? '--').padStart(2, '0');
const pct = (value) => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '--';

function Stat({ label, value }) {
  const stable = value?.successRate >= 0.9;
  return (
    <article className={`sr-stat ${stable ? 'is-stable' : ''}`}>
      <span>{label}</span>
      <strong>{pct(value?.successRate)}</strong>
      <small>{value?.successCount || 0}/{value?.count || 0} 成功</small>
    </article>
  );
}

export default function StateRiskKill() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kill/state-risk', { cache: 'no-store', signal: controller.signal })
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
  const backtests = data?.backtests || {};
  const latest = data?.historyMeta?.latest;

  return (
    <main className="sr-page">
      <style>{`
        .sr-page { min-height: 100vh; padding: 72px 18px 48px; box-sizing: border-box; color: #f5f7f2; background: radial-gradient(circle at 85% 0, rgba(190,242,100,.13), transparent 34%), #111612; font-family: Inter, system-ui, sans-serif; }
        .sr-shell { width: min(1180px, 100%); margin: 0 auto; }
        .sr-kicker { margin: 0 0 10px; color: #bef264; font-size: 12px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
        .sr-title { margin: 0; font-size: clamp(30px, 5vw, 54px); line-height: 1; }
        .sr-subtitle { max-width: 760px; margin: 14px 0 26px; color: #aab5aa; line-height: 1.7; }
        .sr-panel { border: 1px solid rgba(217,249,157,.15); border-radius: 18px; background: rgba(24,32,25,.86); box-shadow: 0 24px 70px rgba(0,0,0,.22); }
        .sr-message { padding: 24px; color: #bdc7bd; }
        .sr-message.is-error { color: #fda4af; }
        .sr-hero { display: grid; grid-template-columns: minmax(0,1.1fr) minmax(360px,.9fr); gap: 16px; }
        .sr-current { display: flex; gap: 22px; align-items: center; padding: 26px; border-color: rgba(190,242,100,.3); }
        .sr-ball { display: grid; place-items: center; flex: none; width: 112px; height: 112px; border-radius: 50%; color: #172006; background: #bef264; font-size: 44px; font-weight: 950; box-shadow: 0 18px 38px rgba(190,242,100,.2); }
        .sr-label { color: #94a394; font-size: 12px; font-weight: 800; }
        .sr-current h2 { margin: 5px 0 8px; font-size: 24px; }
        .sr-reason { margin: 0; color: #c2cbc2; font-size: 13px; line-height: 1.65; }
        .sr-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
        .sr-tag { padding: 6px 9px; border-radius: 999px; color: #d9f99d; background: rgba(190,242,100,.09); font-size: 11px; font-weight: 800; }
        .sr-stats { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
        .sr-stat { padding: 18px; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; background: rgba(24,32,25,.7); }
        .sr-stat.is-stable { border-color: rgba(190,242,100,.26); }
        .sr-stat span, .sr-stat small { display: block; color: #93a193; }
        .sr-stat strong { display: block; margin: 7px 0 4px; font-size: 30px; }
        .sr-grid { display: grid; grid-template-columns: .9fr 1.1fr; gap: 16px; margin-top: 16px; }
        .sr-card { padding: 22px; }
        .sr-card h3 { margin: 0 0 15px; font-size: 17px; }
        .sr-candidates { display: grid; gap: 8px; }
        .sr-candidate { display: grid; grid-template-columns: 36px 48px 1fr; gap: 10px; align-items: center; padding: 9px; border-radius: 12px; background: rgba(255,255,255,.035); }
        .sr-candidate.is-selected { outline: 1px solid rgba(190,242,100,.38); background: rgba(190,242,100,.07); }
        .sr-rank { color: #7e8d7e; font-size: 11px; font-weight: 800; }
        .sr-mini { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: #162006; background: #a3e635; font-weight: 900; }
        .sr-candidate strong, .sr-candidate small { display: block; }
        .sr-candidate small { margin-top: 3px; color: #8f9d8f; }
        .sr-explain { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
        .sr-explain div { padding: 13px; border-radius: 12px; background: rgba(255,255,255,.035); }
        .sr-explain span, .sr-explain strong { display: block; }
        .sr-explain span { color: #8f9d8f; font-size: 11px; }
        .sr-explain strong { margin-top: 5px; font-size: 18px; }
        .sr-table-wrap { margin-top: 16px; overflow-x: auto; }
        .sr-table-card { padding: 20px; }
        .sr-table-card h3 { margin: 0 0 12px; }
        .sr-table { width: 100%; min-width: 700px; border-collapse: collapse; font-size: 13px; }
        .sr-table th, .sr-table td { padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,.07); text-align: left; }
        .sr-table th { color: #849284; font-size: 11px; }
        .sr-ok { color: #bef264; font-weight: 850; } .sr-bad { color: #fb7185; font-weight: 850; }
        @media (max-width: 900px) { .sr-hero, .sr-grid { grid-template-columns: 1fr; } }
        @media (max-width: 560px) { .sr-current { align-items: flex-start; flex-direction: column; } .sr-ball { width: 92px; height: 92px; } .sr-stats { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="sr-shell">
        <p className="sr-kicker">Independent state-risk model</p>
        <h1 className="sr-title">状态条件风险第5位</h1>
        <p className="sr-subtitle">固定使用240期学习窗口，将遗漏、短中期频次、间隔相位与冷热转折组合成状态，估计下一期出号风险后固定选择第5位。</p>

        {error && <div className="sr-panel sr-message is-error">加载失败：{error}</div>}
        {!error && !data && <div className="sr-panel sr-message">正在计算200期滚动回测…</div>}
        {data?.status === 'insufficient-history' && <div className="sr-panel sr-message">{data.message}</div>}

        {prediction && <>
          <div className="sr-hero">
            <section className="sr-panel sr-current">
              <div className="sr-ball">{prediction.display}</div>
              <div>
                <div className="sr-label">当前推荐单杀</div>
                <h2>号码 {prediction.display} · 风险第{prediction.selectedRank}位</h2>
                <p className="sr-reason">{prediction.reason}</p>
                <div className="sr-tags">
                  <span className="sr-tag">条件出号风险 {prediction.riskPercent}%</span>
                  <span className="sr-tag">数据库 {data.historyMeta.count} 期</span>
                  <span className="sr-tag">最新 {latest?.year}-{String(latest?.No || '').padStart(3, '0')}</span>
                </div>
              </div>
            </section>
            <div className="sr-stats">
              <Stat label="近20期" value={backtests.backtest20} />
              <Stat label="近50期" value={backtests.backtest50} />
              <Stat label="近100期" value={backtests.backtest100} />
              <Stat label="近200期" value={backtests.backtest200} />
            </div>
          </div>

          <div className="sr-grid">
            <section className="sr-panel sr-card">
              <h3>当前前8个低风险状态</h3>
              <div className="sr-candidates">{prediction.topCandidates.map((item) => (
                <div className={`sr-candidate ${item.rank === prediction.selectedRank ? 'is-selected' : ''}`} key={item.number}>
                  <span className="sr-rank">#{item.rank}</span><span className="sr-mini">{item.display}</span>
                  <div><strong>风险 {item.riskPercent}%</strong><small>遗漏 {item.state.raw.miss} · f5 {item.state.raw.f5} · f20 {item.state.raw.f20}</small></div>
                </div>
              ))}</div>
            </section>
            <section className="sr-panel sr-card">
              <h3>当前号码状态</h3>
              <div className="sr-explain">
                <div><span>当前遗漏</span><strong>{prediction.state.raw.miss}期</strong></div>
                <div><span>上次间隔</span><strong>{prediction.state.raw.lastGap}期</strong></div>
                <div><span>近5期频次</span><strong>{prediction.state.raw.f5}次</strong></div>
                <div><span>近20期频次</span><strong>{prediction.state.raw.f20}次</strong></div>
                <div><span>近50期频次</span><strong>{prediction.state.raw.f50}次</strong></div>
                <div><span>间隔相位</span><strong>{prediction.state.raw.phase.toFixed(2)}</strong></div>
              </div>
              <p className="sr-reason" style={{marginTop: 16}}>{data.strategy.description}</p>
              <p className="sr-reason" style={{marginTop: 8}}>{data.independence}</p>
            </section>
          </div>

          <section className="sr-panel sr-table-card sr-table-wrap">
            <h3>近20期逐期回测</h3>
            <table className="sr-table"><thead><tr><th>期号</th><th>杀码</th><th>风险</th><th>结果</th><th>开奖号码</th></tr></thead>
              <tbody>{backtests.backtest20.rows.map((row) => <tr key={`${row.year}-${row.No}`}>
                <td>{row.year}-{String(row.No).padStart(3, '0')}</td><td>{num(row.predictedNumber)}</td><td>{row.riskPercent}%</td>
                <td className={row.success ? 'sr-ok' : 'sr-bad'}>{row.success ? '成功' : '失败'}</td><td>{row.actualNumbers.map(num).join(' ')}</td>
              </tr>)}</tbody>
            </table>
          </section>
        </>}
      </div>
    </main>
  );
}
