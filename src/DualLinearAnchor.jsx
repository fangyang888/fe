import { useEffect, useState } from 'react';
import './DualLinearAnchor.css';

const period = value => value ? `${value.year}-${String(value.No).padStart(3, '0')}` : '—';
const ball = n => String(n).padStart(2, '0');
const rate = value => value.count ? `${(100 * value.successCount / value.count).toFixed(1)}%` : '—';

export default function DualLinearAnchor() {
  const [mode, setMode] = useState('research');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: '' });
    fetch(`/api/kill/dual-linear-anchor?mode=${mode}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
        return response.json();
      })
      .then(data => { if (!controller.signal.aborted) setState({ data, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ data: null, error: error.message }); });
    return () => controller.abort();
  }, [mode, attempt]);
  const { data, error } = state;
  return <main className="dla-page"><div className="dla-shell">
    <header className="dla-header"><div><span className="dla-eyebrow">ANCHORS & TWO-PERIOD SELECTION</span><h1>14 / 100 双锚点</h1><p>两个固定公式 + 两种前两期动态择优，每种策略各排除一个号码。</p></div>
      <label className="dla-mode">统计范围<select value={mode} onChange={e => setMode(e.target.value)}><option value="research">截至2026-243期研究</option><option value="latest">最新连续数据</option></select></label>
    </header>
    <p className="dla-note">公式与动态规则均在截至243期的历史上研究、筛选。历史全对不代表未来全对；成功指该号码未出现在当期全部7个开奖号中。动态策略仅使用前两期信息，同分选100期公式。</p>
    {error ? <div className="dla-message" role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>重新加载</button></div> : null}
    {!data && !error ? <p className="dla-message" role="status">正在计算四种策略…</p> : null}
    {data ? <div className="dla-meta"><span>统计截至 <b>{period(data.evaluatedThrough)}</b></span><span>数据库最新 <b>{period(data.availableLatest)}</b></span>{data.target ? <span>{mode === 'research' ? '历史推算目标' : '下一连续期目标'} <b>{period(data.target)}</b></span> : null}</div> : null}
    {data?.notice ? <p className="dla-message" role="status">{data.notice}</p> : null}
    {data?.status === 'insufficient-history' ? <p className="dla-message">{data.message}</p> : null}
    {data?.algorithms?.map((algorithm, index) => <section className={`dla-card dla-card-${index}`} key={algorithm.key}>
      <header className="dla-card-head"><div><span className="dla-eyebrow">{algorithm.key} · {algorithm.dynamic ? '动态择优' : '固定公式'}</span><h2>{algorithm.name}</h2><p>{algorithm.formula}{algorithm.dynamic ? '' : '，结果循环回绕到1～49'}</p></div><div className="dla-pick"><span>{period(data.target)} 单杀</span><strong>{ball(algorithm.prediction.number)}</strong>{algorithm.dynamic ? <small>采用 {algorithm.prediction.selectedBase}</small> : null}</div></header>
      {algorithm.dynamic ? <div className="dla-evidence">{algorithm.prediction.evidence.map(item => <article key={item.key}><b>{item.key} · {item.score}分</b>{item.previous.map((row, i) => <span key={row.No}>{i === 0 ? '上一期' : '上上期'} {period(row)}：预测 {ball(row.number)} · {row.failed ? '失败' : '成功'}</span>)}</article>)}</div> : null}
      <div className="dla-calculation">来源 <b>{period(algorithm.prediction.source)}</b> 第{algorithm.prediction.position}位 <b>{ball(algorithm.prediction.anchor)}</b><span>→ {algorithm.prediction.multiplier} × {algorithm.prediction.anchor}{algorithm.prediction.offset ? ` + ${algorithm.prediction.offset}` : ''} = {algorithm.prediction.value} → <b>{ball(algorithm.prediction.number)}</b></span></div>
      <div className="dla-windows">{algorithm.windows.map(window => <article key={window.window}><span>近{window.window}期</span><strong>{rate(window)}</strong><small>{window.successCount} / {window.count} 期成功</small></article>)}</div>
      <div className="dla-research"><h3>截至243期的历史研究</h3><p>{algorithm.researchWindows.map(w => `近${w.window}期 ${w.successCount}/${w.count}`).join(' · ')}</p><small>244期起历史复算：{algorithm.afterResearch.count ? `${algorithm.afterResearch.successCount}/${algorithm.afterResearch.count} · ${rate(algorithm.afterResearch)}` : '此统计范围内暂无记录'}。此处不作为提前保存的前瞻预测。</small></div>
      <details><summary>查看最近{algorithm.recent.length}期逐期记录</summary><div className="dla-table"><table><caption className="dla-sr">{algorithm.name}逐期预测、锚点来源和开奖结果</caption><thead><tr><th>期号</th><th>预测单杀</th><th>采用公式 / 评分</th><th>锚点来源</th><th>开奖号</th><th>结果</th></tr></thead><tbody>{algorithm.recent.map(row => <tr key={`${row.year}-${row.No}`} className={row.success ? '' : 'dla-failure'}><td>{period(row)}</td><td><b>{ball(row.number)}</b></td><td>{row.selectedBase}{row.evidence ? ` · ${row.evidence.map(e => `${e.key} ${e.score}分`).join(' / ')}` : ''}</td><td>{period(row.source)} · {ball(row.anchor)}</td><td>{row.actual.map(ball).join(' · ')}</td><td className={row.success ? 'dla-ok' : 'dla-bad'}>{row.success ? '成功' : '失败'}</td></tr>)}</tbody></table></div></details>
    </section>)}
  </div></main>;
}
