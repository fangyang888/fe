import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildAdaptiveZodiacObservation,
  ZODIAC_MODELS,
  type AdaptiveZodiacObservation,
  type ZodiacBacktestSummary,
  type ZodiacModel,
  type ZodiacObservationRow,
  type VectorZodiacSummary,
} from './lib/adaptiveZodiacObservation';
import {ZODIAC_VECTOR_CONFIG, ZODIAC_VECTOR_TRIAL_START, ZODIAC_VECTOR_WINDOWS} from './lib/vectorZodiacObservation';
import type {VectorZodiacPrediction} from './lib/vectorZodiacObservation';
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

function VectorScore({data}: {data: VectorZodiacSummary}) {
  return <div className="azo-vector-score"><small>向量 · 3 肖不中</small><strong>{percentage(data.successRate, data.count)}</strong>
    <em>{data.successCount}/{data.count}</em></div>;
}

function SummaryCard({label, data, vector, note}: {
  label: string;
  data: ZodiacBacktestSummary;
  vector?: VectorZodiacSummary;
  note?: string;
}) {
  return <article className="azo-stat">
    <span>{label}</span>
    <div><small>2肖不中</small><strong>{percentage(data.twoSuccessRate, data.count)}</strong><em>{data.twoSuccessCount}/{data.count}</em></div>
    <div><small>3肖不中</small><strong>{percentage(data.threeSuccessRate, data.count)}</strong><em>{data.threeSuccessCount}/{data.count}</em></div>
    {vector ? <VectorScore data={vector}/> : null}
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

function ResultText({value, settled = false}: {value: boolean | null; settled?: boolean}) {
  return <span className={value === null ? 'azo-pending' : value ? 'pso-ok' : 'pso-bad'}>
    {value === null ? (settled ? '未计算' : '待开奖') : value ? '成功' : '失败'}
  </span>;
}

function VectorDetails({vector}: {vector: VectorZodiacPrediction}) {
  return <details className="azo-vector-details">
    <summary>查看 12 肖得分与相似历史</summary>
    <p className="pso-muted">{vector.windows.length === ZODIAC_VECTOR_WINDOWS.length
      ? '各窗口的近邻加权得分取平均，用于排序。'
      : '本期使用 24 期窗口的近邻加权得分。'}</p>
    <ol className="azo-vector-ranking" aria-label="本期向量得分，从低到高">
      {vector.scores.map(row => <li key={row.zodiac} className={vector.selected.includes(row.zodiac) ? 'is-excluded' : undefined}>
        <b>{row.zodiac}肖</b><span>{percentage(row.score, 1)}</span>
      </li>)}
    </ol>
    <div className="pso-table-wrap azo-neighbor-table" tabIndex={0} aria-label="各窗口最相似的历史">
      <table><thead><tr><th>窗口</th><th>历史目标期</th><th>余弦相似度</th><th>随后特别码生肖</th><th>权重</th></tr></thead>
        <tbody>{vector.windows.flatMap(window => window.nearest.map(row => <tr key={`${window.lookback}-${row.No}`}>
          <td>{window.lookback} 期</td><td>第 {row.No} 期</td><td>{row.similarity.toFixed(3)}</td><td>{row.zodiac}肖</td><td>{row.weight.toFixed(2)}</td>
        </tr>))}</tbody>
      </table>
    </div>
  </details>;
}

function ObservationContent({data}: {data: AdaptiveZodiacObservation}) {
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(35);
  const current = data.current;
  const visibleRows = useMemo(() => [...data.rows].reverse().filter(row => {
    if (filter === 'failures') return row.twoSuccess === false;
    if (filter === 'vector-failures') return row.vectorSuccess === false;
    if (filter === 'switches') return row.switched;
    if (filter === 'recent') return row.choice === 'recent';
    return true;
  }), [data.rows, filter]);

  if (!current) return <div className="pso-message">暂无可计算期数。</div>;

  const rollingLead = current.rolling.recentWins - current.rolling.stableWins;
  const currentConfig = current.choice ? ZODIAC_MODELS[current.choice] : null;
  const integrity = data.integrity;
  const {lookback, dimensions, neighbors, minimumNeighbors} = ZODIAC_VECTOR_CONFIG;
  const streakValue = (value: number | null) => value === null ? '—' : `${value} 期`;

  return <>
    {(integrity.rejected > 0 || integrity.duplicatePeriods > 0 || integrity.missingOrInvalidPeriods > 0 || integrity.vectorMissingMetadata > 0) ? <div className="pso-message pso-warning" role="status">
      记录中有 {integrity.rejected} 条异常、{integrity.duplicatePeriods} 个重复期号和 {integrity.missingOrInvalidPeriods} 个缺失或无效期号。
      {integrity.vectorMissingMetadata > 0 ? ` 另有 ${integrity.vectorMissingMetadata} 期普通码生肖数据不完整。` : ''}
      原方案需要此前连续 5 期的特别码生肖，向量方案需要此前连续 {lookback} 期的完整生肖数据。
    </div> : null}

    <section className="pso-panel azo-hero">
      <div className="azo-vector-hero" role="group" aria-labelledby="azo-vector-current">
        <div>
          <span className="pso-eyebrow">第 {current.targetNo} 期 · 待开奖</span>
          <h2 id="azo-vector-current">向量杀 3 肖</h2>
          {current.vector ? <p className="azo-vector-version">{current.vector.windows.length === ZODIAC_VECTOR_WINDOWS.length
            ? '12 / 24 / 36 期多尺度向量'
            : '多尺度数据不足，本期使用 24 期向量'}</p> : null}
          {current.vector ? <div className="azo-vector-picks" role="group" aria-label="向量排除的三个生肖">
            {current.vector.selected.map(zodiac => <strong key={zodiac}>{zodiac}<small>肖</small></strong>)}
          </div> : <p className="azo-empty-pick">需要前 {lookback} 期完整生肖数据及至少 {minimumNeighbors} 个历史近邻。</p>}
        </div>
        <dl className="azo-vector-streaks" aria-label="向量杀 3 肖连错统计">
          <div><dt>当前连错</dt><dd>{streakValue(data.vectorStreak.current)}</dd></div>
          <div><dt>近 20 期内最长</dt><dd>{streakValue(data.vectorStreak.recentLongest)}</dd></div>
          <div><dt>全历史最长</dt><dd>{streakValue(data.vectorStreak.allLongest)}</dd></div>
        </dl>
      </div>
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
      <div className="azo-section-head"><div><h2>模型与切换规则</h2></div><span className="azo-rule-pill">原方案最近 15 期 · 领先 1 次切换</span></div>
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
        <article className="azo-vector-model">
          <span>独立向量杀 3 肖</span><strong>多尺度余弦相似度 · 每个窗口 {dimensions} 维</strong>
          <p>12、24、36 期分别构建生肖频次与遗漏向量，各自匹配最多 {neighbors} 个历史近邻。三个窗口等权平均，排除得分最低的 3 肖。</p>
          {current.vector ? <p>本期近邻 {current.vector.windows.map(window => `${window.lookback} 期窗口采用 ${window.neighborCount} 个`).join('，')}。</p> : null}
        </article>
      </div>
      {current.vector ? <VectorDetails vector={current.vector}/> : null}
    </section>

    <section className="pso-panel">
      <h2>历史回测对照</h2>
      <p className="pso-muted">当期特别码生肖落在所排除的生肖之外，记为成功。每期使用该期之前的开奖记录回放。</p>
      <div className="azo-summary-grid azo-overall-grid">
        <article className="azo-stat azo-vector-model">
          <span>多尺度向量杀 3 肖 · 151 期起</span><VectorScore data={data.vectorTotal}/>
          {data.vectorComparison.count ? <p>向量同期 {data.vectorComparison.count} 期，多尺度成功 {data.vectorComparison.vectorWins} 期，原 24 期向量成功 {data.vectorComparison.baselineWins} 期。</p> : null}
          <p>{data.vectorTrial.count
            ? `从第 ${ZODIAC_VECTOR_TRIAL_START} 期起已对照 ${data.vectorTrial.count} 期，多尺度成功 ${data.vectorTrial.vectorWins} 期，原向量成功 ${data.vectorTrial.baselineWins} 期。`
            : `从第 ${ZODIAC_VECTOR_TRIAL_START} 期起单独对照，目前待开奖入库。`}</p>
          {data.vectorPaired.count ? <p>同期 {data.vectorPaired.count} 期，向量成功 {data.vectorPaired.vectorWins} 期，自适应 3 肖成功 {data.vectorPaired.adaptiveWins} 期。</p> : null}
        </article>
        <SummaryCard label="15期自适应 · 151期起" data={data.total} note="页面当前采用的完整规则" />
        <SummaryCard label="固定稳定模型 · 151期起" data={data.stableTotal} note="始终使用60个相似样本" />
        <SummaryCard label="固定近期模型 · 151期起" data={data.recentTotal} note="始终使用最近80期基准" />
      </div>
    </section>

    <section className="pso-panel">
      <h2>分阶段观察</h2>
      <div className="azo-summary-grid azo-phase-grid">
        {data.ranges.map(range => <SummaryCard key={range.label} label={range.label} data={range} vector={range.vector} />)}
      </div>
    </section>

    <section className="pso-panel">
      <h2>滚动窗口</h2>
      <p className="pso-muted">按最近已开奖记录取窗口，各方案只统计能计算的期次。</p>
      <div className="azo-summary-grid azo-window-grid">
        {data.windows.map(window => <SummaryCard key={window.window} label={`最近 ${window.window} 条记录`} data={window} vector={window.vector} />)}
      </div>
    </section>

    <section className="pso-panel">
      <div className="pso-record-head"><div><h2>逐期预测与结果</h2></div><label>显示范围 <select value={filter} onChange={event => { setFilter(event.target.value); setLimit(35); }} aria-label="显示范围"><option value="all">全部记录</option><option value="vector-failures">仅向量 3 肖失败</option><option value="failures">仅2肖失败</option><option value="switches">仅切换期</option><option value="recent">采用近期模型</option></select></label></div>
      <div className="pso-table-wrap" tabIndex={0} aria-label="自适应和向量逐期对照"><table className="azo-table"><thead><tr><th>目标期</th><th>阶段</th><th>采用模型</th><th>近15期对比</th><th>2肖</th><th>＋1肖</th><th>实际特别码</th><th>2肖不中</th><th>3肖不中</th><th>向量杀 3 肖</th><th>向量结果</th></tr></thead><tbody>
        {visibleRows.slice(0, limit).map(row => <tr key={row.targetNo} className={row.twoSuccess === false ? 'pso-failure' : row.switched ? 'azo-switch-row' : ''}>
          <td>{data.year}-{String(row.targetNo).padStart(3, '0')}</td><td>{phase(row.targetNo)}</td><td><span className={`azo-model-tag ${row.choice === 'recent' ? 'is-recent' : ''}`}>{modelLabel(row.choice)}</span>{row.switched ? <small className="azo-switch">切换</small> : null}</td>
          <td>稳定 {row.rolling.stableWins}/{row.rolling.count} · 近期 {row.rolling.recentWins}/{row.rolling.count}</td>
          <td className="azo-table-picks">{row.selected.slice(0, 2).join(' · ') || '—'}</td><td className="azo-table-plus">{row.selected[2] ?? '—'}</td>
          <td>{row.actual ? `${String(row.actual.specialNumber).padStart(2, '0')} · ${row.actual.zodiac}肖` : '待开奖'}</td><td><ResultText value={row.twoSuccess} /></td><td><ResultText value={row.threeSuccess} /></td>
          <td className="azo-vector-cell">{row.vector?.selected.join(' · ') ?? '—'}{row.vector ? <small>{row.vector.windows.map(window => window.lookback).join(' / ')} 期窗口</small> : null}</td>
          <td><ResultText value={row.vectorSuccess} settled={!!row.actual}/></td>
        </tr>)}
        {visibleRows.length === 0 ? <tr><td colSpan={11}>当前范围暂无记录。</td></tr> : null}
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
  const lastSnapshot = useRef<string | null>(null);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') setRefreshKey(value => value + 1);
    };
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15_000);
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/history?year=2026', {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = await response.text();
        if (!controller.signal.aborted) {
          if (snapshot !== lastSnapshot.current) {
            setData(buildAdaptiveZodiacObservation(JSON.parse(snapshot)));
            lastSnapshot.current = snapshot;
          }
          setUpdatedAt(new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'}));
        }
      } catch (reason) {
        if (controller.signal.reason === 'timeout') setError('读取超时');
        else if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取失败');
      } finally {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') setLoading(false);
      }
    }
    void load();
    return () => {window.clearTimeout(timeout); controller.abort();};
  }, [refreshKey]);

  return <main className="pso-page azo-page"><div className="pso-shell">
    <header className="pso-head">
      <div><span className="pso-eyebrow">2026 · 特别码生肖</span><h1>生肖观察 · 向量杀 3 肖</h1><p>查看下一期排除生肖，以及独立向量与自适应方案的同期回测。</p></div>
      <nav className="azo-history-actions" aria-label="开奖更新">
        <Link to="/history">去同步开奖</Link>
        <button disabled={loading} onClick={() => setRefreshKey(value => value + 1)}>{loading ? '检查中…' : '刷新数据'}</button>
      </nav>
    </header>
    {loading && !data ? <div className="pso-message" role="status">正在读取 2026 年开奖记录并逐期回算…</div> : null}
    {error ? <div className="pso-message pso-error" role="alert">加载失败：{error}。可点击刷新数据重试。</div> : null}
    {data && data.validCount === 0 ? <div className="pso-message">暂无有效的2026年特别码生肖数据。</div> : null}
    {data && data.validCount > 0 ? <ObservationContent data={data} /> : null}
    {data ? <footer className="pso-footer">最近检查 {updatedAt} · 页面可见时每 60 秒检查开奖 · 最新接口期号 {data.latestNo ?? '—'} · 向量已回测 {data.vectorTotal.count} 期</footer> : null}
  </div></main>;
}
