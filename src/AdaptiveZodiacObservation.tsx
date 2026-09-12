import { useEffect, useMemo, useState } from 'react';
import {
  buildAdaptiveZodiacObservation,
  ZODIAC_MODELS,
  type AdaptiveZodiacObservation,
  type ZodiacBacktestSummary,
  type ZodiacModel,
  type ZodiacObservationRow,
} from './lib/adaptiveZodiacObservation';
import './PeakShapeObservation.css';
import './AdaptiveZodiacObservation.css';

const modelLabel = (model: ZodiacModel | null) => model ? ZODIAC_MODELS[model].label : '无法计算';
const percentage = (value: number, count: number) => count ? `${(value * 100).toFixed(2)}%` : '—';
const phase = (no: number) => no <= 180
  ? '初段记录'
  : no <= 200
    ? '确认记录'
    : no <= 254
      ? '近期回看'
      : '后续观察';

function SummaryCard({label, data, note}: {
  label: string;
  data: ZodiacBacktestSummary;
  note?: string;
}) {
  return <article className="azo-stat">
    <span>{label}</span>
    <div><small>2肖不中</small><strong>{percentage(data.twoSuccessRate, data.count)}</strong><em>{data.twoSuccessCount}/{data.count}</em></div>
    <div><small>3肖不中</small><strong>{percentage(data.threeSuccessRate, data.count)}</strong><em>{data.threeSuccessCount}/{data.count}</em></div>
    {note ? <p>{note}</p> : null}
  </article>;
}

function ZodiacPicks({row}: {row: ZodiacObservationRow}) {
  if (row.selected.length < 3) return <div className="azo-empty-pick">数据不足，暂不出肖</div>;
  return <div className="azo-picks" aria-label={`2肖${row.selected.slice(0, 2).join('、')}，补充${row.selected[2]}`}>
    <div className="azo-primary-picks">
      {row.selected.slice(0, 2).map(zodiac => <strong key={zodiac}>{zodiac}<small>肖</small></strong>)}
    </div>
    <div className="azo-plus"><span>＋1</span><b>{row.selected[2]}<small>肖</small></b></div>
  </div>;
}

function ResultText({value}: {value: boolean | null}) {
  return <span className={value === null ? 'azo-pending' : value ? 'pso-ok' : 'pso-bad'}>
    {value === null ? '待开奖' : value ? '成功' : '失败'}
  </span>;
}

function ObservationContent({data}: {data: AdaptiveZodiacObservation}) {
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(35);
  const current = data.current;
  const visibleRows = useMemo(() => [...data.rows].reverse().filter(row => {
    if (filter === 'failures') return row.twoSuccess === false;
    if (filter === 'switches') return row.switched;
    if (filter === 'recent') return row.choice === 'recent';
    return true;
  }), [data.rows, filter]);

  if (!current) return <div className="pso-message">暂无可计算期数。</div>;

  const rollingLead = current.rolling.recentWins - current.rolling.stableWins;
  const currentConfig = current.choice ? ZODIAC_MODELS[current.choice] : null;
  const integrity = data.integrity;

  return <>
    {(integrity.rejected > 0 || integrity.duplicatePeriods > 0 || integrity.missingOrInvalidPeriods > 0) ? <div className="pso-message pso-warning" role="status">
      数据提示：{integrity.rejected} 条异常、{integrity.duplicatePeriods} 个重复期号、{integrity.missingOrInvalidPeriods} 个缺失或无效期号。缺少连续五期生肖时不会生成结果。
    </div> : null}

    <section className="pso-panel azo-hero">
      <div className="azo-hero-copy">
        <span className="pso-eyebrow">第 {current.targetNo} 期 · 当前采用 {modelLabel(current.choice)}</span>
        <h2>特别码生肖排除观察</h2>
        <p>前两个生肖为主观察，第三个生肖单独标记为“＋1”。每期从12肖重新排序，不强制排除或保留上期特别码生肖。</p>
        <ZodiacPicks row={current} />
      </div>
      <aside className={`azo-status ${current.choice === 'recent' ? 'is-recent' : ''}`}>
        <span>15期自适应状态</span>
        <strong>{modelLabel(current.choice)}</strong>
        <dl>
          <div><dt>稳定模型</dt><dd>{current.rolling.stableWins}/{current.rolling.count}</dd></div>
          <div><dt>近期模型</dt><dd>{current.rolling.recentWins}/{current.rolling.count}</dd></div>
          <div><dt>当前差值</dt><dd>{rollingLead > 0 ? '+' : ''}{rollingLead}</dd></div>
        </dl>
        <p>{current.rolling.count < data.settings.lookback
          ? `尚需 ${data.settings.lookback - current.rolling.count} 期完成预热，暂用稳定模型。`
          : rollingLead >= data.settings.switchMargin
            ? '近期模型领先至少1次，本期切换到近期参数。'
            : '近期模型未领先，继续采用稳定参数。'}</p>
      </aside>
    </section>

    <section className="pso-panel">
      <div className="azo-section-head"><div><span className="pso-eyebrow">两组参数同时运行</span><h2>模型与切换规则</h2></div><span className="azo-rule-pill">最近15期 · 领先1次切换</span></div>
      <div className="azo-models">
        <article className={current.choice === 'stable' ? 'is-active' : ''}>
          <span>稳定模型</span><strong>5期走势 / 60个邻居</strong><p>使用第53期以来的全局生肖比例作为基准，参数变化较慢。</p>
        </article>
        <article className={current.choice === 'recent' ? 'is-active' : ''}>
          <span>近期模型</span><strong>5期走势 / 50个邻居</strong><p>使用最近80期生肖比例作为基准，对近期阶段变化更敏感。</p>
        </article>
        <article className="azo-model-now">
          <span>本期实际参数</span><strong>{currentConfig ? `${currentConfig.neighbors}个相似样本` : '暂不可用'}</strong><p>{current.switched ? '本期发生模型切换。' : '本期延续当前判断。'} 排名只使用目标期之前的数据。</p>
        </article>
      </div>
    </section>

    <section className="pso-panel">
      <h2>历史回测对照</h2>
      <p className="pso-muted">“成功”表示所选2肖或3肖均不是当期特别码生肖。以下是历史回测率，不是下一期保证。</p>
      <div className="azo-summary-grid">
        <SummaryCard label="15期自适应 · 151期起" data={data.total} note="页面当前采用的完整规则" />
        <SummaryCard label="固定稳定模型 · 151期起" data={data.stableTotal} note="始终使用60个相似样本" />
        <SummaryCard label="固定近期模型 · 151期起" data={data.recentTotal} note="始终使用最近80期基准" />
      </div>
    </section>

    <section className="pso-panel">
      <h2>分阶段观察</h2>
      <div className="azo-summary-grid azo-phase-grid">
        {data.ranges.map(range => <SummaryCard key={range.label} label={range.label} data={range} />)}
      </div>
    </section>

    <section className="pso-panel">
      <h2>滚动窗口</h2>
      <p className="pso-muted">只统计最近已经开奖且能够计算的记录，用于观察自适应规则是否开始衰减。</p>
      <div className="azo-summary-grid azo-window-grid">
        {data.windows.map(window => <SummaryCard key={window.window} label={`最近 ${window.window} 条记录`} data={window} />)}
      </div>
    </section>

    <section className="pso-panel">
      <div className="pso-record-head"><div><span className="pso-eyebrow">逐期留痕</span><h2>模型选择与结果</h2></div><label>显示范围 <select value={filter} onChange={event => { setFilter(event.target.value); setLimit(35); }} aria-label="显示范围"><option value="all">全部记录</option><option value="failures">仅2肖失败</option><option value="switches">仅切换期</option><option value="recent">采用近期模型</option></select></label></div>
      <div className="pso-table-wrap"><table className="azo-table"><thead><tr><th>目标期</th><th>阶段</th><th>采用模型</th><th>近15期对比</th><th>2肖</th><th>＋1肖</th><th>实际特别码</th><th>2肖不中</th><th>3肖不中</th></tr></thead><tbody>
        {visibleRows.slice(0, limit).map(row => <tr key={row.targetNo} className={row.twoSuccess === false ? 'pso-failure' : row.switched ? 'azo-switch-row' : ''}>
          <td>{data.year}-{String(row.targetNo).padStart(3, '0')}</td><td>{phase(row.targetNo)}</td><td><span className={`azo-model-tag ${row.choice === 'recent' ? 'is-recent' : ''}`}>{modelLabel(row.choice)}</span>{row.switched ? <small className="azo-switch">切换</small> : null}</td>
          <td>稳定 {row.rolling.stableWins}/{row.rolling.count} · 近期 {row.rolling.recentWins}/{row.rolling.count}</td>
          <td className="azo-table-picks">{row.selected.slice(0, 2).join(' · ') || '—'}</td><td className="azo-table-plus">{row.selected[2] ?? '—'}</td>
          <td>{row.actual ? `${String(row.actual.specialNumber).padStart(2, '0')} · ${row.actual.zodiac}肖` : '待开奖'}</td><td><ResultText value={row.twoSuccess} /></td><td><ResultText value={row.threeSuccess} /></td>
        </tr>)}
        {visibleRows.length === 0 ? <tr><td colSpan={9}>当前范围暂无记录。</td></tr> : null}
      </tbody></table></div>
      <div className="pso-record-footer"><span>显示 {Math.min(limit, visibleRows.length)} / {visibleRows.length} 条</span>{limit < visibleRows.length ? <button onClick={() => setLimit(value => value + 50)}>再显示 50 条</button> : null}</div>
    </section>
  </>;
}

export default function AdaptiveZodiacObservationPage() {
  const [data, setData] = useState<AdaptiveZodiacObservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/history?year=2026', {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const observation = buildAdaptiveZodiacObservation(await response.json());
        if (!controller.signal.aborted) {
          setData(observation);
          setUpdatedAt(new Date().toLocaleString('zh-CN'));
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取失败');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [refreshKey]);

  return <main className="pso-page azo-page"><div className="pso-shell">
    <header className="pso-head"><div><span className="pso-eyebrow">2026 · 特别码生肖</span><h1>15期自适应生肖观察</h1><p>稳定模型与近期模型并行，根据最近15期成绩自动选择参数。</p></div><button disabled={loading} onClick={() => setRefreshKey(value => value + 1)}>{loading ? '加载中…' : '刷新数据'}</button></header>
    <div className="pso-timeline"><span>主观察：2肖不中</span><span>补充观察：＋1肖</span><span>切换条件：近期模型领先至少1次</span><span>每期都给结果</span></div>
    {loading ? <div className="pso-message" role="status">正在读取2026年历史数据并逐期计算两组模型…</div> : null}
    {error ? <div className="pso-message pso-error" role="alert">加载失败：{error}。可点击刷新数据重试。</div> : null}
    {data && data.validCount === 0 ? <div className="pso-message">暂无有效的2026年特别码生肖数据。</div> : null}
    {data && data.validCount > 0 ? <ObservationContent data={data} /> : null}
    {data ? <footer className="pso-footer">更新：{updatedAt} · 有效数据 {data.validCount} 期 · 最新接口期号 {data.latestNo ?? '—'}</footer> : null}
  </div></main>;
}
