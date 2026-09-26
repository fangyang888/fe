import { useEffect, useMemo, useState } from 'react';
import {
  evaluateRecommendations, fetchDraws, fetchRecommendations, loadCached, TEMA_SOURCE,
  validDraws, validRecommendations,
  type Draw, type Loaded, type Recommendation, type ResultState,
} from './lib/temaRecommendations';
import './TemaRecommendations.css';

const CURRENT_YEAR = new Date().getFullYear();
const LABELS: Record<ResultState, string> = { hit: '已中奖', miss: '未中奖', pending: '待开奖 / 暂无记录', unknown: '待核对' };
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });

// A keyed child prevents results from a previous year leaking into a new selection.
export default function TemaRecommendations() {
  const [year, setYear] = useState(CURRENT_YEAR);
  useEffect(() => {
    const previous = document.title;
    document.title = '什么是特码 · 推荐特肖核对';
    return () => { document.title = previous; };
  }, []);
  return <main className="tema-page">
    <div className="tema-container">
      <header className="tema-header">
        <div><p className="tema-eyebrow">推荐记录 · 开奖核对</p><h1>什么是特码</h1>
          <p>逐期记录推荐特肖，用实际开奖的第七个号码生肖核对结果。</p></div>
        <a href={TEMA_SOURCE} target="_blank" rel="noreferrer">查看来源 ↗</a>
      </header>
      <label className="tema-year">核对年份
        <select value={year} onChange={event => setYear(Number(event.target.value))}>
          {Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i).map(value => <option key={value} value={value}>{value} 年</option>)}
        </select>
      </label>
      <YearResults key={year} year={year} />
    </div>
  </main>;
}

function YearResults({ year }: { year: number }) {
  const [recommendations, setRecommendations] = useState<Loaded<Recommendation[]> | null>(null);
  const [history, setHistory] = useState<Loaded<Draw[]> | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState<'all' | ResultState>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    const run = async () => {
      const results = await Promise.allSettled([
        loadCached(`tema:v1:recommendations:${encodeURIComponent(TEMA_SOURCE)}:${year}`, () => fetchRecommendations(year), validRecommendations, refresh > 0),
        loadCached(`tema:v1:history:${year}`, () => fetchDraws(year), validDraws, refresh > 0),
      ]);
      if (!active) return;
      const [recs, draws] = results;
      if (recs.status === 'fulfilled') setRecommendations(recs.value);
      if (draws.status === 'fulfilled') setHistory(draws.value);
      setErrors(results.flatMap((result, index) => result.status === 'rejected'
        ? [`${index === 0 ? '推荐特肖' : '开奖数据'}：${result.reason instanceof Error ? result.reason.message : '请求失败'}`] : []));
      setLoading(false);
    };
    void run();
    return () => { active = false; };
  }, [year, refresh]);

  const rows = useMemo(() => evaluateRecommendations(
    recommendations?.data.filter(row => row.year === year) ?? [], history?.data ?? null,
  ), [recommendations, history, year]);
  const hits = rows.filter(row => row.state === 'hit').length;
  const misses = rows.filter(row => row.state === 'miss').length;
  const settled = hits + misses;
  const visibleRows = rows.filter(row => (filter === 'all' || row.state === filter)
    && String(row.period).padStart(3, '0').includes(search.trim()));
  const hasCache = recommendations?.cached || history?.cached;
  const doRefresh = () => { setLoading(true); setErrors([]); setRefresh(value => value + 1); };

  return <>
    <section className="tema-toolbar" aria-label="数据状态">
      <div><strong>{loading ? '正在读取数据…' : errors.length ? '部分数据未更新' : hasCache ? '已读取本地缓存' : '数据已更新'}</strong>
        <p>有缓存时不自动请求。查看新一期或最新开奖，请点击手动更新。</p></div>
      <button type="button" className="tema-refresh" disabled={loading} onClick={doRefresh}>
        {loading ? '读取中…' : '手动更新'}
      </button>
    </section>
    {errors.length > 0 && <div className="tema-error" role="alert">
      {errors.map(error => <p key={error}>{error}</p>)}
      {(recommendations || history) && <p>已保留上次成功读取的数据，失败请求不会覆盖缓存。</p>}
    </div>}
    <section className="tema-stats" aria-label="中奖统计">
      <article><span>推荐期数</span><strong>{rows.length}</strong><small>{year} 年记录</small></article>
      <article><span>已中奖</span><strong className="tema-positive">{hits}</strong><small>特别号生肖在推荐内</small></article>
      <article><span>未中奖</span><strong>{misses}</strong><small>特别号生肖不在推荐内</small></article>
      <article><span>已核对命中率</span><strong>{settled ? `${(hits / settled * 100).toFixed(1)}%` : '—'}</strong><small>{settled} 期已核对 · {rows.length - settled} 期待核对</small></article>
    </section>
    <section className="tema-records" aria-labelledby="tema-record-title" aria-busy={loading}>
      <div className="tema-list-head"><div><h2 id="tema-record-title">每期推荐</h2><span>按期号倒序排列</span></div>
        <div className="tema-filters">
          <label><span className="tema-sr-only">搜索期号</span><input type="search" inputMode="numeric" placeholder="搜索期号" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label><span className="tema-sr-only">筛选中奖状态</span><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
            <option value="all">全部状态</option>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
      </div>
      {!visibleRows.length ? <div className="tema-empty" role="status">
        <strong>{loading ? '正在读取推荐和开奖数据' : rows.length ? '没有符合筛选条件的记录' : '暂无可展示的推荐'}</strong>
        <p>{loading ? '首次进入需要连接来源网站，请稍候。' : rows.length ? '试试其他期号或中奖状态。' : '请确认来源可访问后手动更新；不会用示例数据代替真实记录。'}</p>
      </div> : <div className="tema-list">{visibleRows.map(row => <article className="tema-record" key={`${row.year}-${row.period}`}>
        <div className="tema-period"><span>{row.year} 年</span><h3>{String(row.period).padStart(3, '0')}<small>期</small></h3></div>
        <div className="tema-recommendation"><p className="tema-hint">{row.hint || '什么是特码'}</p>
          <div className="tema-zodiacs" aria-label="推荐特肖">{row.zodiacs.map(zodiac => <span key={zodiac} className={row.draw?.zodiac === zodiac ? 'tema-zodiac-hit' : ''}>{zodiac}</span>)}</div>
          <small>推荐特肖 · {row.zodiacs.length} 肖</small>
        </div>
        <div className="tema-outcome"><span className={`tema-badge tema-${row.state}`}>{LABELS[row.state]}</span>
          <p>特别号 <strong>{row.draw?.number != null ? String(row.draw.number).padStart(2, '0') : '—'}</strong><b>{row.draw?.zodiac ?? '—'}</b></p>
          {row.state === 'unknown' && <small>{!history ? '开奖数据未读取' : '第七位生肖缺失或数据冲突'}</small>}
        </div>
      </article>)}</div>}
    </section>
    <footer className="tema-footnote">
      <p>核对规则：按年份和期号匹配 /history，第 7 个号码的生肖出现在推荐特肖中即标记中奖。</p>
      <p>来源未注明年份的记录按所选 {year} 年核对；原页的黄色标记不参与判断。</p>
      {recommendations && <p>推荐数据：{recommendations.cached ? '缓存' : '本次请求'} · {time(recommendations.savedAt)}</p>}
      {history && <p>开奖数据：{history.cached ? '缓存' : '本次请求'} · {time(history.savedAt)}</p>}
      {(recommendations?.persistent === false || history?.persistent === false) && <p>浏览器本地存储不可用，缓存仅在当前页面会话内有效。</p>}
    </footer>
  </>;
}
