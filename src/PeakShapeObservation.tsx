import { useEffect, useMemo, useState } from 'react';
import KillBacktestMetric from './KillBacktestMetric';
import { buildPeakObservation, PEAK_NUMBER, PEAK_YEAR } from './lib/peakObservation';
import type { PeakDraw, PeakObservation } from './lib/peakObservation';
import './PeakShapeObservation.css';

const format = (n: number) => String(n).padStart(2, '0');
const period = (d: PeakDraw) => `${d.year}-${String(d.No).padStart(3, '0')}`;
const stage = (no: number) => no <= 150 ? '前段研究' : no <= 253 ? '后段回看' : no === 254 ? '补充回看' : '后续观察';

function ShapeChart({ sources }: { sources: PeakDraw[] }) {
  if (sources.length !== 3) return <p className="pso-muted">需要连续三期有效数据才能绘制形态。</p>;
  const points = sources.map((d, i) => ({ x: 45 + i * 125, y: 155 - (d.numbers[5] - 1) / 48 * 120, draw: d }));
  return <svg className="pso-shape" viewBox="0 0 340 205" role="img" aria-label={`最近三期第6个号码：${sources.map(d => d.numbers[5]).join('，')}`}>
    <title>最近三期 N6 真实走势</title>
    <line x1="25" x2="320" y1="168" y2="168" stroke="#34404a" />
    <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f4c15d" strokeWidth="3" />
    {points.map(p => <g key={p.draw.No}>
      <circle cx={p.x} cy={p.y} r="5" fill="#f4c15d" />
      <text x={p.x} y={p.y - 13} textAnchor="middle" fill="#f4c15d" fontSize="17">{format(p.draw.numbers[5])}</text>
      <text x={p.x} y="190" textAnchor="middle" fill="#b6c1ca" fontSize="12">第 {p.draw.No} 期</text>
    </g>)}
  </svg>;
}

function ObservationBody({ data }: { data: PeakObservation }) {
  const [filter, setFilter] = useState('triggered');
  const [limit, setLimit] = useState(30);
  const visible = useMemo(() => [...data.rows].reverse().filter(row => filter === 'all' || (filter === 'failures' ? row.state === 'triggered' && !row.success : row.state === 'triggered')), [data.rows, filter]);
  const fired = data.currentState === 'triggered';
  const incomplete = data.currentState === 'incomplete';
  const invalid = data.integrity;
  return <>
    {(invalid.rejected > 0 || invalid.duplicatePeriods > 0 || invalid.missingOrInvalidPeriods > 0) && <div className="pso-message pso-warning" role="status">
      数据需留意：{invalid.rejected} 条格式异常、{invalid.duplicatePeriods} 个重复期号、{invalid.missingOrInvalidPeriods} 个缺失或无效期号。缺期不拼接成形态；无法判断的记录不计入成功率。
    </div>}
    <section className="pso-panel">
      <header className="pso-panel-head">
        <div><span className="pso-eyebrow">固定路径 A · N6 山峰</span><h2>先升后降，观察 28 是否缺席</h2><p>连续三期第 6 个号码：第一个小于第二个，第二个大于第三个。持平不算触发。</p></div>
        <div className={`pso-pick ${fired ? 'is-triggered' : ''}`} data-testid="current-observation"><span>{fired ? '已触发 · 下期观察号' : incomplete ? '数据不足 · 暂不判断' : '未触发 · 本期不出号'}</span><strong>{fired ? format(PEAK_NUMBER) : '—'}</strong><small>{data.latestNo === null ? '等待历史数据' : `第 ${data.latestNo} 期之后的下一期`}</small></div>
      </header>
      <div className="pso-shape-grid"><ShapeChart sources={data.currentSources} /><div className="pso-rule">
        <span>最新形态</span><strong>{data.currentSources.length === 3 ? data.currentSources.map(d => format(d.numbers[5])).join(' → ') : '连续数据不完整'}</strong>
        <p>{fired ? '已形成山峰。下一期开奖后，分别检查 28 是否出现在全部 7 个数中、是否出现在特别码 N7。' : incomplete ? '补齐连续三期数据后再判断，避免跨缺失期连线。' : '没有形成山峰，固定规则暂不触发；未触发期不会被算成成功。'}</p>
        <small>固定排除号为 28，不随近期成绩更换。</small>
      </div></div>
    </section>
    <section className="pso-overview" aria-label="整体历史统计">
      <KillBacktestMetric label="全部已开奖触发样本 · 第5期起" data={data.total} className="pso-stat" />
      <article className="pso-stat"><span>触发与失败</span><strong>{data.total.count}<small> 次触发</small></strong><p>7码排除失败 {data.total.failureCount} 次</p><p>特别码排除失败 {data.total.count - data.total.specialCodeMissCount} 次</p><small>只统计已触发且实际开奖完整的期数。</small></article>
      <article className="pso-stat"><span>统计口径</span><p><b>7码未出现：</b>28 不在 N1～N7 中。</p><p><b>特别码未出现：</b>28 不等于 N7。</p><small>在独立均匀 7/49 抽取假设下，基准分别为 85.7% 和 98.0%；历史比例不是下一期概率保证。</small></article>
    </section>
    <section className="pso-panel"><h2>分阶段观察</h2><p className="pso-muted">前两段属于已筛选的历史回看；第254期是选择路径时已知的数据，计入总览，不计入后续观察。第255期起按同一规则记录。</p>
      <div className="pso-phases">{data.ranges.map(range => <KillBacktestMetric key={range.label} label={range.label} data={range} className="pso-stat" />)}</div>
    </section>
    <section className="pso-panel"><h2>最近开奖窗口</h2><p className="pso-muted">窗口按开奖期号划分，分母只包含窗口内的触发次数，不是窗口期数。</p>
      <div className="pso-windows">{data.windows.map(window => <KillBacktestMetric key={window.window} label={`近 ${window.window} 个开奖期`} data={window} className="pso-stat" />)}</div>
    </section>
    <section className="pso-panel"><div className="pso-record-head"><h2>逐期记录</h2><label>显示范围 <select aria-label="显示范围" value={filter} onChange={e => { setFilter(e.target.value); setLimit(30); }}><option value="triggered">仅触发记录</option><option value="failures">7码排除失败</option><option value="all">全部开奖记录</option></select></label></div>
      <div className="pso-table-wrap"><table><thead><tr><th>目标期号</th><th>阶段</th><th>此前三期 N6</th><th>观察号</th><th>实际 N1～N7</th><th>特别码 N7</th><th>7码未出现</th><th>特别码未出现</th></tr></thead><tbody>
        {visible.slice(0, limit).map(row => <tr key={row.draw.No} className={row.success === false ? 'pso-failure' : ''}>
          <td>{period(row.draw)}</td><td>{stage(row.draw.No)}</td>
          <td title={row.sources.map(period).join(' → ')}>{row.sources.length === 3 ? row.sources.map(d => format(d.numbers[5])).join(' → ') : '缺期，无法判断'}</td>
          <td className="pso-number">{row.state === 'triggered' ? '28' : '—'}</td><td>{row.draw.numbers.map((n, i) => <span key={i} className={n === PEAK_NUMBER ? 'pso-hit' : ''}>{i ? ' · ' : ''}{format(n)}</span>)}</td><td>{format(row.draw.numbers[6])}</td>
          <td className={row.success === null ? '' : row.success ? 'pso-ok' : 'pso-bad'}>{row.success === null ? row.state === 'incomplete' ? '数据不足' : '未触发' : row.success ? '成功' : '失败'}</td>
          <td className={row.specialCodeMiss === null ? '' : row.specialCodeMiss ? 'pso-ok' : 'pso-bad'}>{row.specialCodeMiss === null ? '—' : row.specialCodeMiss ? '成功' : '失败'}</td>
        </tr>)}
        {visible.length === 0 && <tr><td colSpan={8}>当前范围暂无记录。</td></tr>}
      </tbody></table></div>
      <div className="pso-record-footer"><span>显示 {Math.min(limit, visible.length)} / {visible.length} 条</span>{limit < visible.length && <button onClick={() => setLimit(n => n + 50)}>再显示 50 条</button>}</div>
    </section>
  </>;
}

export default function PeakShapeObservation() {
  const [data, setData] = useState<PeakObservation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(''); setData(null);
      try {
        const response = await fetch(`/api/history?year=${PEAK_YEAR}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = buildPeakObservation(await response.json());
        if (!controller.signal.aborted) { setData(result); setUpdatedAt(new Date().toLocaleString('zh-CN')); }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '加载失败');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [revision]);
  return <main className="pso-page"><div className="pso-shell">
    <header className="pso-head"><div><span className="pso-eyebrow">2026 · 固定形态观察</span><h1>N6 山峰 · 排除28</h1><p>看第 6 个号码的三期走势，逐次记录全部7码与特别码的缺席结果。</p></div><button disabled={loading} onClick={() => setRevision(n => n + 1)}>{loading ? '加载中…' : '刷新数据'}</button></header>
    <div className="pso-timeline"><span>形态：先升后降 ↗↘</span><span>固定观察号：28</span><span>特别码：第7个号码 N7</span></div>
    {loading && <div className="pso-message" role="status">正在读取历史数据并逐期计算…</div>}
    {error && <div className="pso-message pso-error" role="alert">加载失败：{error}。请点击刷新数据重试。</div>}
    {data && data.draws.length === 0 && <div className="pso-message">暂无有效的2026年历史数据，暂不生成观察号或成功率。</div>}
    {data && data.draws.length > 0 && <ObservationBody data={data} />}
    {data && <footer className="pso-footer">数据更新：{updatedAt} · 有效记录 {data.draws.length} 期 · 最新接口期号 {data.latestNo ?? '—'}</footer>}
  </div></main>;
}
