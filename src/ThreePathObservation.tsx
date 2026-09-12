import { useEffect, useMemo, useState } from 'react';
import KillBacktestMetric from './KillBacktestMetric';
import { buildThreePathObservation } from './lib/threePathObservation';
import type { PathState, ThreePathObservationData } from './lib/threePathObservation';
import './PeakShapeObservation.css';
import './ThreePathObservation.css';

const fmt = (n: number) => String(n).padStart(2, '0');
const phase = (no: number) => no <= 150 ? '前段研究' : no <= 200 ? '顺序筛选' : no <= 253 ? '末段回看' : no === 254 ? '补充回看' : '后续观察';

function PathCard({ path, index, selected }: { path: PathState; index: number; selected: boolean }) {
  const { definition, values, sources } = path;
  const points = values.map((n, i) => ({ x: 30 + i * 240 / (definition.length - 1), y: 138 - (n - 1) / 48 * 104 }));
  return <article className={`tpo-path ${selected ? 'tpo-selected' : ''}`}>
    <div className="tpo-path-head"><span>优先级 {index + 1}</span><b>{fmt(definition.number)}</b></div>
    <h3>{definition.name}</h3><p>{definition.rule}</p>
    {path.state === 'incomplete' ? <div className="tpo-chart-empty">连续数据不足，无法判断</div> : <svg className="tpo-chart" viewBox="0 0 300 184" role="img" aria-label={`${definition.name}，最近${definition.length}期：${values.join('、')}`}>
      <title>{definition.name}最近走势</title>
      <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f4c15d" strokeWidth="2.5" />
      {points.map((p, i) => <g key={sources[i].No}><circle cx={p.x} cy={p.y} r="4" fill="#f4c15d" /><text x={p.x} y={p.y - 12} textAnchor="middle" fill="#f4c15d" fontSize="15">{fmt(values[i])}</text><text x={p.x} y="170" textAnchor="middle" fill="#b6c1ca" fontSize="12">{sources[i].No}期</text></g>)}
    </svg>}
    <strong className={selected ? 'pso-ok' : 'pso-muted'}>{selected ? '本期采用此路径' : path.state === 'triggered' ? '形态已触发 · 按优先顺序处理' : path.state === 'incomplete' ? '数据不足' : '未触发'}</strong>
  </article>;
}

function Content({ data }: { data: ThreePathObservationData }) {
  const [filter, setFilter] = useState('triggered');
  const [limit, setLimit] = useState(30);
  const visible = useMemo(() => [...data.rows].reverse().filter(row => filter === 'all' || (filter === 'failures' ? row.success === false : row.state === 'triggered')), [data.rows, filter]);
  const selected = data.current.selected;
  const invalid = data.integrity;
  return <>
    {(invalid.rejected > 0 || invalid.duplicatePeriods > 0 || invalid.missingOrInvalidPeriods > 0) && <div className="pso-message pso-warning" role="status">数据提示：{invalid.rejected} 条异常、{invalid.duplicatePeriods} 个重复期号、{invalid.missingOrInvalidPeriods} 个缺失或无效期号。不会跨缺期判断形态，无法判断的期数不计入成功率。</div>}
    <section className="pso-panel"><header className="pso-panel-head"><div><span className="pso-eyebrow">固定顺序 · 每期最多一个号码</span><h2>05 → 28 → 20</h2><p>先看 N3 低位山峰，再看 N6 山峰，最后看 N5 升降升。前一条未触发才轮到下一条；全部不符合就不出号。</p></div>
      <div className={`pso-pick ${selected ? 'is-triggered' : ''}`}><span>{selected ? '当前下期观察号' : data.current.state === 'incomplete' ? '数据不足 · 暂不判断' : '未触发 · 暂不出号'}</span><strong>{selected ? fmt(selected.definition.number) : '—'}</strong><small>{selected?.definition.name ?? '等待形态条件'}</small><small>第 {data.latestNo} 期之后的下一期</small></div></header>
      <div className="tpo-paths">{data.current.paths.map((path, index) => <PathCard key={path.definition.key} path={path} index={index} selected={selected?.definition.key === path.definition.key} />)}</div>
    </section>
    <section className="pso-panel"><h2>与原顺序比较 · 151～253期</h2><p className="pso-muted">这是已经用于研究的历史区间。成功率仅统计实际触发期数，不能当成下一期的保证；未触发不算成功。</p>
      <div className="pso-phases"><KillBacktestMetric label="新顺序 · 05 → 28 → 20" data={data.comparison} className="pso-stat" /><KillBacktestMetric label="原顺序 · 28 → 05 → 20" data={data.oldComparison} className="pso-stat" /><article className="pso-stat"><span>新顺序出号覆盖</span><strong>{data.comparison.count}<small> / {data.comparisonPeriodCount} 个已载入开奖期</small></strong><p>已出号但7码排除失败 {data.comparison.failureCount} 次</p><p>未触发 {data.comparisonPeriodCount - data.comparison.count - data.comparisonUnknownCount} 期 · 数据不足 {data.comparisonUnknownCount} 期</p><small>特别码未出现指观察号码不等于 N7。</small></article></div>
    </section>
    <section className="pso-panel"><h2>分阶段记录</h2><p className="pso-muted">顺序是在历史数据上筛选出的。第254期单独作为补充回看计入总览；第255期起另列观察，不把历史高分当作前瞻保证。</p><div className="tpo-phases">{data.ranges.map(r => <KillBacktestMetric key={r.label} label={r.label} data={r} className="pso-stat" />)}</div></section>
    <section className="pso-panel"><h2>最新触发统计</h2><p className="pso-muted">窗口按开奖期号计算，只将窗口内真实触发且已开奖的记录作为分母。全部7码与特别码 N7 分开统计。</p><div className="pso-windows">{data.windows.map(w => <KillBacktestMetric key={w.window} label={`近 ${w.window} 个开奖期`} data={w} className="pso-stat" />)}</div>
      <div className="tpo-total"><KillBacktestMetric label="全部历史触发 · 第5期起" data={data.total} className="pso-stat" /><p className="pso-muted">在独立均匀 7/49 抽取假设下，单号不在全部7码中的基准为85.7%，不在N7中的基准为98.0%。两项比例含义不同。</p></div>
    </section>
    <section className="pso-panel"><div className="pso-record-head"><h2>逐期观察明细</h2><label>显示范围 <select aria-label="显示范围" value={filter} onChange={e => { setFilter(e.target.value); setLimit(30); }}><option value="triggered">仅触发记录</option><option value="failures">7码排除失败</option><option value="all">全部开奖记录</option></select></label></div>
      <div className="pso-table-wrap"><table><thead><tr><th>目标期号</th><th>阶段</th><th>采用路径</th><th>此前走势</th><th>观察号</th><th>实际 N1～N7</th><th>特别码 N7</th><th>7码未出现</th><th>特别码未出现</th></tr></thead><tbody>
        {visible.slice(0, limit).map(row => <tr key={row.draw.No} className={row.success === false ? 'pso-failure' : ''}><td>{row.draw.year}-{String(row.draw.No).padStart(3, '0')}</td><td>{phase(row.draw.No)}</td><td>{row.decision.selected?.definition.name ?? (row.state === 'incomplete' ? '数据不足' : '未触发')}</td><td title={row.sources.map(d => `${d.year}-${d.No}`).join(' → ')}>{row.decision.selected?.values.map(fmt).join(' → ') ?? '—'}</td><td className="pso-number">{row.number === null ? '—' : fmt(row.number)}</td><td>{row.draw.numbers.map((n, i) => <span key={i} className={n === row.number ? 'pso-hit' : ''}>{i ? ' · ' : ''}{fmt(n)}</span>)}</td><td>{fmt(row.draw.numbers[6])}</td><td className={row.success === null ? '' : row.success ? 'pso-ok' : 'pso-bad'}>{row.success === null ? '不计入' : row.success ? '成功' : '失败'}</td><td className={row.specialCodeMiss === null ? '' : row.specialCodeMiss ? 'pso-ok' : 'pso-bad'}>{row.specialCodeMiss === null ? '不计入' : row.specialCodeMiss ? '成功' : '失败'}</td></tr>)}
        {visible.length === 0 && <tr><td colSpan={9}>当前范围暂无记录。</td></tr>}
      </tbody></table></div><div className="pso-record-footer"><span>显示 {Math.min(limit, visible.length)} / {visible.length} 条</span>{limit < visible.length && <button onClick={() => setLimit(n => n + 50)}>再显示 50 条</button>}</div>
    </section>
  </>;
}

export default function ThreePathObservation() {
  const [data, setData] = useState<ThreePathObservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [updatedAt, setUpdatedAt] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(''); setData(null);
      try {
        const response = await fetch('/api/history?year=2026', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = buildThreePathObservation(await response.json());
        if (!controller.signal.aborted) { setData(result); setUpdatedAt(new Date().toLocaleString('zh-CN')); }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取失败'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [refresh]);
  return <main className="pso-page"><div className="pso-shell"><header className="pso-head"><div><span className="pso-eyebrow">2026 · 三路径组合观察</span><h1>05 / 28 / 20 优先观察</h1><p>符合形态才出号，逐期查看组合结果和特别码未出现率。</p></div><button disabled={loading} onClick={() => setRefresh(n => n + 1)}>{loading ? '加载中…' : '刷新数据'}</button></header>
    <div className="pso-timeline"><span>第一优先：N3低位山峰 → 05</span><span>第二优先：N6山峰 → 28</span><span>第三优先：N5升降升 → 20</span></div>
    {loading && <div className="pso-message" role="status">正在读取历史数据，按固定顺序逐期计算…</div>}
    {error && <div className="pso-message pso-error" role="alert">加载失败：{error}。可点击刷新数据重试。</div>}
    {data && data.validCount === 0 && <div className="pso-message">暂无有效的2026年历史数据，暂不生成观察号和成功率。</div>}
    {data && data.validCount > 0 && <Content data={data} />}
    {data && <footer className="pso-footer">更新：{updatedAt} · 有效数据 {data.validCount} 期 · 最新接口期号 {data.latestNo ?? '—'}</footer>}
  </div></main>;
}
