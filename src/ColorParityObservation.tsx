import {useEffect, useMemo, useRef, useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {
  buildColorParityObservation,
  COLOR_PARITY_MODELS,
  COLOR_PARITY_VECTOR_CONFIG,
  COLOR_PARITY_VECTOR_WINDOWS,
  COLOR_PARITY_YEAR,
  MODEL_KEYS,
  type BallColor,
  type ColorParityModelKey,
  type ColorParityObservation,
  type ModelBacktestSummary,
  type VectorWindowDetail,
} from './lib/colorParityObservation';
import './PeakShapeObservation.css';
import './AdaptiveZodiacObservation.css';
import './ColorParityObservation.css';

const pct = (value: number, count = 1) => (count > 0 ? `${(value * 100).toFixed(2)}%` : '—');
const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');
const streakText = (v: number | null) => (v === null ? '—' : `${v} 期`);

function colorClass(color: BallColor | undefined): string {
  if (color === '红') return 'is-red';
  if (color === '绿') return 'is-green';
  if (color === '蓝') return 'is-blue';
  return '';
}

function colorFromLabel(label: string | undefined | null): BallColor | undefined {
  if (!label) return undefined;
  const first = label[0];
  if (first === '红' || first === '绿' || first === '蓝') return first;
  return undefined;
}

function phaseLabel(no: number): string {
  if (no <= 150) return '初段回看';
  if (no <= 230) return '中段验证';
  return '近期观察';
}

function ResultBadge({value, settled}: {value: boolean | null; settled: boolean}) {
  return (
    <span className={value === null ? 'azo-pending' : value ? 'pso-ok' : 'pso-bad'}>
      {value === null ? (settled ? '未计算' : '待开奖') : value ? '排除成功' : '开出失败'}
    </span>
  );
}

function WaveChip({label}: {label: string | null | undefined}) {
  if (!label) return <span className="azo-pending">—</span>;
  return <span className={`cpo-table-chip ${colorClass(colorFromLabel(label))}`}>{label}</span>;
}

function VectorNeighborsDetails({windows}: {windows: VectorWindowDetail[]}) {
  if (windows.length === 0) return null;
  return (
    <details className="cpo-details">
      <summary>查看融合模型内部 · 余弦向量 Top-K 相似历史近邻（{windows.map(w => `${w.lookback}期`).join(' / ')}）</summary>
      <p className="pso-muted">
        各窗口权重由目标期之前的在线对数评分自适应更新：
        {windows.map(w => ` ${w.lookback}期窗口 ${pct(w.share)}（有效近邻 ${w.neighborCount} 个）`).join(' · ')}
      </p>
      <div className="pso-table-wrap azo-neighbor-table" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>上下文窗口</th>
              <th>历史匹配期</th>
              <th>余弦相似度</th>
              <th>历史第7码</th>
              <th>实际半波</th>
              <th>半衰期权重</th>
            </tr>
          </thead>
          <tbody>
            {windows.flatMap(win =>
              win.nearest.map(item => (
                <tr key={`${win.lookback}-${item.No}`}>
                  <td>{win.lookback} 期（短窗 {win.shortWindow}）</td>
                  <td>2026-{pad3(item.No)}</td>
                  <td>{item.similarity.toFixed(3)}</td>
                  <td>{pad2(item.specialNumber)}</td>
                  <td><WaveChip label={item.label} /></td>
                  <td>{item.weight.toFixed(2)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function StatSummaryBox({
  label,
  activeModel,
  stats,
}: {
  label: string;
  activeModel: ColorParityModelKey;
  stats: Record<ColorParityModelKey, ModelBacktestSummary>;
}) {
  const otherModel: ColorParityModelKey = activeModel === 'ensemble' ? 'prior' : 'ensemble';
  const main = stats[activeModel];
  const other = stats[otherModel];
  return (
    <article className="cpo-stat-box">
      <span>{label}</span>
      <div className="cpo-stat-primary">
        <strong>{pct(main.successRate, main.count)}</strong>
        <em>{main.successCount}/{main.count} 成功</em>
      </div>
      <ul className="cpo-stat-list">
        <li>
          <span>{COLOR_PARITY_MODELS[otherModel].shortLabel}</span>
          <b>{pct(other.successRate, other.count)} ({other.successCount}/{other.count})</b>
        </li>
      </ul>
    </article>
  );
}

function ObservationBody({data}: {data: ColorParityObservation}) {
  const [activeModel, setActiveModel] = useState<ColorParityModelKey>('ensemble');
  const [filter, setFilter] = useState<'all' | 'failures' | 'diverged'>('all');
  const [limit, setLimit] = useState(35);

  const current = data.current;
  const activeForecast = current?.forecasts[activeModel] ?? null;
  const diag = data.diagnostics;
  const activeStreak = data.streaks[activeModel];
  const pickMeta = activeForecast
    ? diag.classes.find(item => item.label === activeForecast.pickLabel) ?? null
    : null;

  const visibleRows = useMemo(
    () =>
      [...data.rows].reverse().filter(row => {
        if (filter === 'failures') return row.results[activeModel] === false;
        if (filter === 'diverged') return !row.agreed;
        return true;
      }),
    [data.rows, filter, activeModel],
  );

  if (!current) {
    return <div className="pso-message">暂无可计算的 2026 年开奖期数。</div>;
  }

  const integrity = data.integrity;

  return (
    <>
      {(integrity.rejected > 0 ||
        integrity.duplicatePeriods > 0 ||
        integrity.missingOrInvalidPeriods > 0 ||
        integrity.vectorMissingMetadata > 0) && (
        <div className="pso-message pso-warning" role="status">
          数据校验提示：发现 {integrity.rejected} 条异常记录、{integrity.duplicatePeriods} 个重复期号、
          {integrity.missingOrInvalidPeriods} 个缺失或无效期号
          {integrity.vectorMissingMetadata > 0
            ? `，另有 ${integrity.vectorMissingMetadata} 期缺少普通码颜色信息（仅影响融合内部向量分量，自动降级继续计算）`
            : ''}
          。算法严格按连续期号回放，不跨缺期拼接。
        </div>
      )}

      <section className="cpo-truth-banner" role="note" aria-label="6类半波概率基准说明">
        <div>
          <h3>
            6 类半波基准：红单 / 红双 / 绿单 / 绿双 / 蓝单 / 蓝双（每类 7～9 个号码，理论不开上限 {pct(diag.theoreticalMaxNotRate)}）
          </h3>
          <p>
            49 个号码中最小的半波是「绿双」（7/49 球，理论不开 <b>85.71%</b>；红单/蓝单/蓝双为 8 球 83.67%；红双/绿单为 9 球 81.63%）。
            2026 年 {diag.sampleCount} 期独立性检验：边际 χ² = {diag.marginalChi2.toFixed(2)}（阈值 {diag.marginalCritical05}），
            一阶转移 χ² = {diag.markovChi2.toFixed(2)}（阈值 {diag.markovCritical05}）。
          </p>
        </div>
      </section>

      <section className="pso-panel cpo-hero">
        <div>
          <div className="cpo-model-tabs" role="tablist" aria-label="选择预测模型">
            {MODEL_KEYS.map(key => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeModel === key}
                className={`cpo-model-tab ${activeModel === key ? 'is-active' : ''}`}
                onClick={() => setActiveModel(key)}
              >
                {COLOR_PARITY_MODELS[key].label}
              </button>
            ))}
          </div>

          <span className="pso-eyebrow">
            第 {current.targetNo} 期 · 待开奖 · {COLOR_PARITY_MODELS[activeModel].label}
          </span>
          <h2>下期预测不会开的半波</h2>

          {activeForecast && pickMeta ? (
            <div className="cpo-pick-showcase">
              <div className={`cpo-pick-pill ${colorClass(pickMeta.color)}`}>
                <span>建议排除</span>
                <strong>{activeForecast.pickLabel}</strong>
                <small>
                  预测不开 {pct(activeForecast.ranked[0].excludeProb)} · 含 {pickMeta.ballCount} 码
                </small>
              </div>
              <div className="cpo-pick-meta">
                <p>{COLOR_PARITY_MODELS[activeModel].summary}</p>
                <p>
                  次选排除：<b>{activeForecast.runnerUpLabel}</b>（预测不开 {pct(activeForecast.ranked[1].excludeProb)}）
                  {' · '}
                  当前已连续遗漏 <b>{pickMeta.currentOmission} 期</b>
                  {' · '}
                  2026 实际不开率 <b>{pct(pickMeta.actualNotRate)}</b>
                </p>
                <div className="cpo-ball-chips" aria-label={`${activeForecast.pickLabel}包含的号码`}>
                  {pickMeta.numbers.map(num => (
                    <span key={num} className={`cpo-ball ${colorClass(pickMeta.color)}`}>
                      {pad2(num)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="cpo-hero-aside" aria-label="当前模型回测摘要">
          <div>
            <h3>{COLOR_PARITY_MODELS[activeModel].label} · 2026 因果回测</h3>
            <dl className="cpo-aside-grid" style={{marginTop: 12}}>
              <div>
                <dt>全段排除成功率</dt>
                <dd>{pct(data.totals[activeModel].successRate, data.totals[activeModel].count)}</dd>
              </div>
              <div>
                <dt>已回测期数</dt>
                <dd>{data.totals[activeModel].successCount}/{data.totals[activeModel].count}</dd>
              </div>
              <div>
                <dt>两方案是否一致</dt>
                <dd>{current.agreed ? `一致 (${current.forecasts.ensemble.pickLabel})` : '本期分歧'}</dd>
              </div>
              <div>
                <dt>当前 / 最长连错</dt>
                <dd>{streakText(activeStreak.current)} / {streakText(activeStreak.allLongest)}</dd>
              </div>
            </dl>
          </div>
          <p className="cpo-aside-note">
            严格滚动因果回测：预测第 N 期仅读取第 1～N-1 期历史数据。近 20 期最长连错 {streakText(activeStreak.recentLongest)}。
          </p>
        </aside>
      </section>

      <section className="pso-panel">
        <h2>双方案同期对比（第 61 期起严格因果回测）</h2>
        <p className="pso-muted">
          点击任意卡片可切换上方主预测与下方回测口径。融合模型内部采用 {COLOR_PARITY_VECTOR_WINDOWS.map(w => w.lookback).join('/')} 期多窗口余弦向量（Top-{COLOR_PARITY_VECTOR_CONFIG.neighbors}）与 5 期序列 Top-K 等信号。
        </p>
        <div className="cpo-models-grid">
          {MODEL_KEYS.map(key => {
            const stat = data.totals[key];
            const streak = data.streaks[key];
            const forecast = current.forecasts[key];
            const w50 = data.windows.find(w => w.window === 50)?.stats[key];
            const w100 = data.windows.find(w => w.window === 100)?.stats[key];
            return (
              <button
                key={key}
                type="button"
                className={`cpo-model-card ${activeModel === key ? 'is-selected' : ''}`}
                onClick={() => setActiveModel(key)}
              >
                <span>{COLOR_PARITY_MODELS[key].label}</span>
                <strong>{pct(stat.successRate, stat.count)}</strong>
                <em>
                  全段 {stat.successCount}/{stat.count} · 近100期 {pct(w100?.successRate ?? 0, w100?.count ?? 0)} · 近50期 {pct(w50?.successRate ?? 0, w50?.count ?? 0)} · 最长连错 {streakText(streak.allLongest)}
                </em>
                <p>
                  第 {current.targetNo} 期排除：<b>{forecast.pickLabel}</b>（预测不开 {pct(forecast.ranked[0].excludeProb)}）
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {activeForecast && (
        <section className="pso-panel">
          <h2>第 {current.targetNo} 期 · 6 类半波不开概率排序</h2>
          <p className="pso-muted">
            绿色高亮为当前方案主推排除项，靛蓝色为次选排除项，下方对比均匀随机理论基准与当前遗漏期数。
          </p>
          <div className="cpo-rank-grid">
            {activeForecast.ranked.map((item, idx) => {
              const clsDiag = diag.classes[item.classIdx];
              return (
                <article
                  key={item.label}
                  className={`cpo-rank-card ${idx === 0 ? 'is-excluded' : idx === 1 ? 'is-runner-up' : ''}`}
                >
                  <div className="cpo-rank-top">
                    <span className="cpo-class-tag">
                      <i className={`cpo-dot ${colorClass(item.color)}`} aria-hidden="true" />
                      {idx + 1}. {item.label}
                    </span>
                    <span className="cpo-rank-prob">{pct(item.excludeProb)}</span>
                  </div>
                  <div className="cpo-bar-track" aria-hidden="true">
                    <div
                      className="cpo-bar-fill"
                      style={{width: `${Math.max(4, Math.min(100, ((item.excludeProb - 0.7) / 0.3) * 100))}%`}}
                    />
                  </div>
                  <div className="cpo-rank-sub">
                    <span>理论 {pct(item.theoreticalNotRate)} ({item.ballCount}码)</span>
                    <span>当前遗漏 {clsDiag.currentOmission} 期</span>
                  </div>
                </article>
              );
            })}
          </div>
          <VectorNeighborsDetails windows={current.vectorWindows} />
        </section>
      )}

      <section className="pso-panel">
        <h2>分阶段与滚动窗口表现（当前主看：{COLOR_PARITY_MODELS[activeModel].shortLabel}）</h2>
        <div className="cpo-phase-grid">
          {data.ranges.map(range => (
            <StatSummaryBox
              key={range.label}
              label={range.label}
              activeModel={activeModel}
              stats={range.stats}
            />
          ))}
        </div>
        <div className="cpo-window-grid">
          {data.windows.map(win => (
            <StatSummaryBox
              key={win.window}
              label={`最近 ${win.window} 期已开奖`}
              activeModel={activeModel}
              stats={win.stats}
            />
          ))}
        </div>
      </section>

      <section className="pso-panel">
        <h2>2026 年第 7 码 6 类半波真实分布与独立性检验</h2>
        <div className="cpo-diag-grid">
          <article className="cpo-diag-card">
            <span>边际均匀性卡方检验 (df={diag.marginalDf})</span>
            <strong>χ² = {diag.marginalChi2.toFixed(2)}</strong>
            <small>
              5% 显著阈值 {diag.marginalCritical05} ·{' '}
              {diag.marginalSignificant ? '存在统计偏离，可继续跟踪观察' : '未见显著偏离，符合 1～49 均匀抽取特征'}
            </small>
          </article>
          <article className="cpo-diag-card">
            <span>一阶马尔可夫独立性检验 (df={diag.markovDf})</span>
            <strong>χ² = {diag.markovChi2.toFixed(2)}</strong>
            <small>
              5% 显著阈值 {diag.markovCritical05} ·{' '}
              {diag.markovSignificant ? '相邻期转移存在偏离' : '相邻两期未见显著转移依赖，历史序列近似独立'}
            </small>
          </article>
          <article className="cpo-diag-card">
            <span>理论最优不开上限（最小号池）</span>
            <strong>{pct(diag.theoreticalMaxNotRate)}</strong>
            <small>绿双仅 7 个号码（42/49 = 85.71%），为 6 类半波在独立均匀随机下的理论上限。</small>
          </article>
        </div>

        <div className="pso-table-wrap" tabIndex={0} aria-label="2026年6类半波真实统计">
          <table>
            <thead>
              <tr>
                <th>半波</th>
                <th>号码数</th>
                <th>包含号码</th>
                <th>理论不开率</th>
                <th>2026 实开 / 理论期望</th>
                <th>2026 实测不开率</th>
                <th>当前遗漏</th>
                <th>最大遗漏</th>
              </tr>
            </thead>
            <tbody>
              {diag.classes.map(cls => (
                <tr key={cls.label}>
                  <td><WaveChip label={cls.label} /></td>
                  <td>{cls.ballCount} 个</td>
                  <td>{cls.numbers.map(pad2).join(' · ')}</td>
                  <td>{pct(cls.theoreticalNotRate)}</td>
                  <td>{cls.actualCount} / {cls.expectedCount.toFixed(1)}</td>
                  <td>{pct(cls.actualNotRate)}</td>
                  <td>{cls.currentOmission} 期</td>
                  <td>{cls.maxOmission} 期</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pso-panel">
        <div className="pso-record-head">
          <div>
            <h2>逐期预测与回测明细</h2>
          </div>
          <label>
            显示范围{' '}
            <select
              aria-label="显示范围"
              value={filter}
              onChange={event => {
                setFilter(event.target.value as 'all' | 'failures' | 'diverged');
                setLimit(35);
              }}
            >
              <option value="all">全部记录</option>
              <option value="failures">仅当前模型失败</option>
              <option value="diverged">仅两方案分歧期</option>
            </select>
          </label>
        </div>
        <div className="pso-table-wrap" tabIndex={0} aria-label="波色单双逐期预测明细">
          <table>
            <thead>
              <tr>
                <th>目标期</th>
                <th>阶段</th>
                <th>多信号先验融合</th>
                <th>理论先验最小号池</th>
                <th>两方案对比</th>
                <th>实际第7码</th>
                <th>{COLOR_PARITY_MODELS[activeModel].shortLabel}结果</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.slice(0, limit).map(row => (
                <tr key={row.targetNo} className={row.results[activeModel] === false ? 'pso-failure' : ''}>
                  <td>{data.year}-{pad3(row.targetNo)}</td>
                  <td>{phaseLabel(row.targetNo)}</td>
                  <td><WaveChip label={row.forecasts.ensemble.pickLabel} /></td>
                  <td><WaveChip label={row.forecasts.prior.pickLabel} /></td>
                  <td>{row.agreed ? <span className="pso-ok">一致</span> : <span className="azo-pending">分歧</span>}</td>
                  <td>
                    {row.actual ? (
                      <>
                        <b>{pad2(row.actual.specialNumber)}</b> · <WaveChip label={row.actual.specialLabel} />
                      </>
                    ) : (
                      <span className="azo-pending">待开奖</span>
                    )}
                  </td>
                  <td>
                    <ResultBadge value={row.results[activeModel]} settled={Boolean(row.actual)} />
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7}>当前筛选条件下暂无记录。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pso-record-footer">
          <span>显示 {Math.min(limit, visibleRows.length)} / {visibleRows.length} 条</span>
          {limit < visibleRows.length && (
            <button type="button" onClick={() => setLimit(v => v + 50)}>
              再显示 50 条
            </button>
          )}
        </div>
      </section>
    </>
  );
}

export default function ColorParityObservationPage() {
  const location = useLocation();
  const [rawRecords, setRawRecords] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState('');
  const lastSnapshot = useRef<string | null>(null);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') setRefreshKey(v => v + 1);
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
        const response = await fetch(`/api/history?year=${COLOR_PARITY_YEAR}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = await response.text();
        if (!controller.signal.aborted) {
          if (snapshot !== lastSnapshot.current) {
            setRawRecords(JSON.parse(snapshot));
            lastSnapshot.current = snapshot;
          }
          setUpdatedAt(new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'}));
        }
      } catch (reason) {
        if (controller.signal.reason === 'timeout') setError('读取超时');
        else if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : '读取失败');
        }
      } finally {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refreshKey]);

  const data = useMemo(
    () => (rawRecords ? buildColorParityObservation(rawRecords) : null),
    [rawRecords],
  );

  return (
    <main className="pso-page cpo-page">
      <div className="pso-shell">
        <header className="pso-head">
          <div>
            <span className="pso-eyebrow">2026 · 第 7 码 6 类半波排除</span>
            <h1>半波预测 · 双方案下期排除</h1>
            <p>
              针对红单、红双、绿单、绿双、蓝单、蓝双六类半波，并列运行「多信号先验融合」与「理论先验最小号池」严格因果回测。
            </p>
          </div>
          <nav className="azo-history-actions" aria-label="开奖更新">
            <Link to={{pathname: '/history', search: location.search}}>去同步开奖</Link>
            <button type="button" disabled={loading} onClick={() => setRefreshKey(v => v + 1)}>
              {loading ? '检查中…' : '刷新数据'}
            </button>
          </nav>
        </header>

        {loading && !data ? (
          <div className="pso-message" role="status">
            正在读取 2026 年历史接口并逐期运行因果回测…
          </div>
        ) : null}

        {error ? (
          <div className="pso-message pso-error" role="alert">
            加载失败：{error}。请确认历史接口可用后点击刷新数据重试。
          </div>
        ) : null}

        {data && data.validCount === 0 ? (
          <div className="pso-message">暂无有效的 2026 年第 7 码波色记录。</div>
        ) : null}

        {data && data.validCount > 0 ? <ObservationBody data={data} /> : null}

        {data ? (
          <footer className="pso-footer">
            最近检查 {updatedAt} · 页面可见时每 60 秒自动检查开奖 · 有效记录 {data.validCount} 期 · 最新接口期号 {data.latestNo ?? '—'}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
