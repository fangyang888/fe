import { useCallback, useEffect, useMemo, useState } from 'react';
import './AStockAnalyzer.css';
import AStockAIPicks from './AStockAIPicks';

const FINANCE_KEYWORDS = ['银行', '证券', '保险', '信托', '期货', '券商', '多元金融'];
const FAVORITES_STORAGE_KEY = 'a-stock-analyzer-favorites-v1';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.8" />
      <path d="m16.2 16.2 4.1 4.1" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M14 7l5 5-5 5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 20 6v5c0 5.2-3.3 8.4-8 10-4.7-1.6-8-4.8-8-10V6l8-3Z" />
      <path d="m8.6 12 2.2 2.2 4.8-5" />
    </svg>
  );
}

function BookmarkIcon({ filled = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 4.5c0-1.1.9-2 2-2h7c1.1 0 2 .9 2 2v17l-5.5-3.4-5.5 3.4v-17Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

function MiniChart({ points }) {
  const chartPoints = useMemo(() => {
    if (!Array.isArray(points) || points.length < 2) return '';
    const width = 640;
    const height = 176;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = Math.max(max - min, 1);

    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * width;
        const y = height - ((point - min) / range) * (height - 18) - 9;
        return `${x},${y}`;
      })
      .join(' ');
  }, [points]);

  if (!chartPoints) {
    return <div className="stock-empty-state">历史价格数据暂不可用</div>;
  }

  return (
    <div className="stock-mini-chart" aria-label="近三年价格趋势图">
      <svg viewBox="0 0 640 176" preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="stockChartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1f725f" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1f725f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="stock-chart-grid" d="M0 30H640M0 88H640M0 146H640" />
        <polygon points={`0,176 ${chartPoints} 640,176`} fill="url(#stockChartFill)" />
        <polyline points={chartPoints} fill="none" stroke="#1f725f" strokeWidth="4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="stock-chart-axis">
        <span>3年前</span>
        <span>2年前</span>
        <span>1年前</span>
        <span>近期</span>
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  return (
    <div className="stock-score-ring" style={{ '--score': `${score * 3.6}deg` }}>
      <div>
        <strong>{score}</strong>
        <span>综合评分</span>
      </div>
    </div>
  );
}

function checkLocalExclusion(query) {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return null;

  if (/(^|\s)\*?ST|退市/.test(normalized)) {
    return '该股票带有 ST、*ST 或退市标识，不符合当前分析范围。';
  }

  const matchedKeyword = FINANCE_KEYWORDS.find((keyword) => normalized.includes(keyword));
  if (matchedKeyword) {
    return `该股票属于${matchedKeyword}相关金融行业，不符合当前分析范围。`;
  }

  return null;
}

function normalizeApiResult(payload) {
  if (!payload || typeof payload !== 'object' || !payload.code || !payload.name) return null;
  return {
    ...payload,
    quote: payload.quote || {},
    dimensions: Array.isArray(payload.dimensions) ? payload.dimensions : [],
    financials: Array.isArray(payload.financials) ? payload.financials : [],
    chart: Array.isArray(payload.chart) ? payload.chart : [],
    performance: Array.isArray(payload.performance) ? payload.performance : [],
    valuation: Array.isArray(payload.valuation) ? payload.valuation : [],
    signals: Array.isArray(payload.signals) ? payload.signals : [],
    events: Array.isArray(payload.events) ? payload.events : [],
    positives: Array.isArray(payload.positives) ? payload.positives : [],
    risks: Array.isArray(payload.risks) ? payload.risks : [],
    watchlist: Array.isArray(payload.watchlist) ? payload.watchlist : [],
    hardChecks: Array.isArray(payload.hardChecks) ? payload.hardChecks : [],
    dataSources: Array.isArray(payload.dataSources) ? payload.dataSources : [],
  };
}

function formatMetric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '--';
}

function hardCheckLabel(status) {
  if (status === 'passed') return '通过';
  if (status === 'failed') return '未通过';
  return '数据不足';
}

function readStoredFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (item) =>
        item &&
        /^\d{6}$/.test(item.code) &&
        typeof item.name === 'string' &&
        Number.isFinite(item.addedPrice) &&
        item.addedPrice > 0 &&
        typeof item.addedAt === 'string',
    );
  } catch {
    return [];
  }
}

function formatFavoriteTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function favoriteReturn(currentPrice, addedPrice) {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(addedPrice) || addedPrice <= 0) {
    return null;
  }
  return ((currentPrice / addedPrice) - 1) * 100;
}

export default function AStockAnalyzer() {
  const [query, setQuery] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [favorites, setFavorites] = useState(readStoredFavorites);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteQuotes, setFavoriteQuotes] = useState({});
  const [favoritesStatus, setFavoritesStatus] = useState('idle');
  const [favoritesUpdatedAt, setFavoritesUpdatedAt] = useState('');
  const favoriteCodes = useMemo(
    () => favorites.map((item) => item.code).join(','),
    [favorites],
  );
  const currentIsFavorite = Boolean(
    analysis && favorites.some((item) => item.code === analysis.code),
  );

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // 浏览器禁用本地存储时不阻断股票分析主流程。
    }
  }, [favorites]);

  const refreshFavorites = useCallback(async () => {
    if (!favoriteCodes) {
      setFavoritesStatus('idle');
      setFavoriteQuotes({});
      return;
    }

    setFavoritesStatus('refreshing');
    try {
      const response = await fetch(
        `/api/stock/quotes?codes=${encodeURIComponent(favoriteCodes)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error(`行情服务返回 ${response.status}`);
      const payload = await response.json();
      const nextQuotes = {};
      for (const quote of Array.isArray(payload.quotes) ? payload.quotes : []) {
        nextQuotes[quote.code] = quote;
      }
      setFavoriteQuotes(nextQuotes);
      setFavoritesUpdatedAt(payload.fetchedAt || new Date().toISOString());
      setFavoritesStatus('ready');
    } catch {
      setFavoritesStatus('error');
    }
  }, [favoriteCodes]);

  useEffect(() => {
    if (!favoritesOpen) return undefined;
    if (!favoriteCodes) {
      setFavoriteQuotes({});
      setFavoritesUpdatedAt('');
      setFavoritesStatus('idle');
      return undefined;
    }
    refreshFavorites();
    const timer = window.setInterval(refreshFavorites, 30_000);
    return () => window.clearInterval(timer);
  }, [favoriteCodes, favoritesOpen, refreshFavorites]);

  const toggleFavorite = () => {
    if (!analysis) return;
    if (currentIsFavorite) {
      setFavorites((items) => items.filter((item) => item.code !== analysis.code));
      setFavoriteQuotes((quotes) => {
        const next = { ...quotes };
        delete next[analysis.code];
        return next;
      });
      return;
    }

    const addedPrice = Number(analysis.quote.price);
    if (!Number.isFinite(addedPrice) || addedPrice <= 0) return;
    setFavorites((items) => [
      ...items,
      {
        code: analysis.code,
        name: analysis.name,
        addedPrice,
        addedAt: new Date().toISOString(),
      },
    ]);
    setFavoriteQuotes((quotes) => ({
      ...quotes,
      [analysis.code]: {
        code: analysis.code,
        name: analysis.name,
        status: 'ready',
        price: addedPrice,
      },
    }));
  };

  const removeFavorite = (code) => {
    setFavorites((items) => items.filter((item) => item.code !== code));
    setFavoriteQuotes((quotes) => {
      const next = { ...quotes };
      delete next[code];
      return next;
    });
  };

  const runAnalysis = async (requestedQuery = query) => {
    const trimmed = requestedQuery.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('请输入股票代码或名称。');
      return;
    }

    setQuery(trimmed);
    const localExclusion = checkLocalExclusion(trimmed);
    if (localExclusion) {
      setAnalysis(null);
      setStatus('excluded');
      setMessage(localExclusion);
      return;
    }

    setAnalysis(null);
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch(`/api/stock/analyze?query=${encodeURIComponent(trimmed)}`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.message || `分析服务返回 ${response.status}`);
      }

      const payload = await response.json();
      if (payload.excluded) {
        setStatus('excluded');
        setMessage(payload.reason || '该股票不符合当前分析范围。');
        return;
      }

      const normalized = normalizeApiResult(payload);
      if (!normalized) throw new Error('分析数据格式无效');
      setAnalysis(normalized);
      setStatus('ready');
    } catch (error) {
      setStatus('unavailable');
      setMessage(
        `${error instanceof Error ? error.message : '暂时无法获取真实数据'}。为避免误导，本次不会显示任何演示或缓存占位数据。`,
      );
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    runAnalysis();
  };

  const tabs = [
    { key: 'overview', label: '综合研判' },
    { key: 'finance', label: '财务趋势' },
    { key: 'price', label: '价格与估值' },
    { key: 'events', label: '事件与风险' },
  ];

  return (
    <main className="stock-analyzer-page">
      <section className="stock-analyzer-hero">
        <div className="stock-hero-toolbar">
          <div className="stock-analyzer-kicker">
            <span />
            A-SHARE RESEARCH
          </div>
          <button
            className="stock-favorites-trigger"
            type="button"
            onClick={() => setFavoritesOpen(true)}
            aria-label={`打开收藏，共 ${favorites.length} 只股票`}
          >
            <BookmarkIcon filled={favorites.length > 0} />
            收藏
            <b>{favorites.length}</b>
          </button>
        </div>
        <h1>看清一家公司，再判断它的位置</h1>
        <p>输入 A 股代码或名称，从公司质量、成长、估值、催化、价格与财务安全六个维度形成统一判断。</p>

        <form className="stock-search" onSubmit={handleSubmit}>
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入股票代码或名称，例如 600519 / 贵州茅台"
            aria-label="股票代码或名称"
          />
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? '分析中…' : '开始分析'}
            {status !== 'loading' && <ArrowIcon />}
          </button>
        </form>

        <div className="stock-search-meta">
          <div className="stock-search-examples">
            <span>快速体验</span>
            <button type="button" onClick={() => runAnalysis('600519')}>
              600519 贵州茅台
            </button>
            <button type="button" onClick={() => runAnalysis('601318')}>
              601318 排除示例
            </button>
          </div>
          <div className="stock-rule-badge">
            <ShieldIcon />
            自动排除 ST 与金融行业
          </div>
        </div>
      </section>

      {(status === 'excluded' || status === 'error' || status === 'unavailable') && (
        <section className={`stock-notice stock-notice-${status}`} role="status">
          <div className="stock-notice-icon">{status === 'excluded' ? '×' : '!'}</div>
          <div>
            <strong>{status === 'excluded' ? '不纳入当前分析' : status === 'error' ? '请检查输入' : '真实数据获取失败'}</strong>
            <p>{message}</p>
          </div>
        </section>
      )}

      {status === 'idle' && (
        <section className="stock-idle-card">
          <strong>所有结果均在查询时获取</strong>
          <p>行情、历史日线、财务指标、公司公告和财经新闻均来自公开市场数据源，不使用页面内置示例值。</p>
        </section>
      )}

      <AStockAIPicks onAnalyze={runAnalysis} />

      {status === 'ready' && analysis && (
        <div className="stock-analyzer-content">
          <section className="stock-company-header">
            <div>
              <div className="stock-company-title">
                <h2>{analysis.name}</h2>
                <span>{analysis.code}</span>
                <span>{analysis.exchange}</span>
                <button
                  type="button"
                  className={`stock-bookmark-button${currentIsFavorite ? ' is-favorite' : ''}`}
                  onClick={toggleFavorite}
                  aria-pressed={currentIsFavorite}
                >
                  <BookmarkIcon filled={currentIsFavorite} />
                  {currentIsFavorite ? '已收藏' : '加入收藏'}
                </button>
              </div>
              <div className="stock-company-meta">
                <span>{analysis.industry}</span>
                <i />
                <span>{analysis.updatedAt}</span>
              </div>
            </div>
            <div className="stock-quote-row">
              <div>
                <span>最新价</span>
                <strong>{analysis.quote.price}</strong>
              </div>
              <div>
                <span>涨跌幅</span>
                <strong>{analysis.quote.change}</strong>
              </div>
              <div>
                <span>换手率</span>
                <strong>{analysis.quote.turnover}</strong>
              </div>
              <div>
                <span>总市值</span>
                <strong>{analysis.quote.marketCap}</strong>
              </div>
            </div>
          </section>

          <nav className="stock-tabs" aria-label="分析栏目">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? 'is-active' : ''}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'overview' && (
            <>
              <section className="stock-overview-grid">
                <article className="stock-card stock-score-card">
                  <div className="stock-card-heading">
                    <div>
                      <span className="stock-card-eyebrow">综合结论</span>
                      <h3>中期形势判断</h3>
                    </div>
                    <span className={`stock-rating stock-rating-${analysis.ratingTone}`}>{analysis.rating}</span>
                  </div>
                  <div className="stock-score-main">
                    <ScoreRing score={analysis.score} />
                    <div className="stock-score-copy">
                      <p>{analysis.summary}</p>
                      <span>判断周期：未来 3—12 个月</span>
                      {analysis.decisionRule && (
                        <div className="stock-decision-rule">{analysis.decisionRule}</div>
                      )}
                    </div>
                  </div>
                </article>

                <article className="stock-card stock-dimensions-card">
                  <div className="stock-card-heading">
                    <div>
                      <span className="stock-card-eyebrow">评分拆解</span>
                      <h3>六维表现</h3>
                    </div>
                  </div>
                  <div className="stock-dimension-list">
                    {analysis.dimensions.map((item) => (
                      <div className="stock-dimension" key={item.label}>
                        <div>
                          <strong>{item.label}</strong>
                          <span>{item.note}</span>
                        </div>
                        <div className="stock-dimension-bar">
                          <i style={{ width: `${item.score}%` }} />
                        </div>
                        <b>{item.score}</b>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="stock-card stock-gate-card">
                <div className="stock-card-heading">
                  <div>
                    <span className="stock-card-eyebrow">硬性准入</span>
                    <h3>先看红线，再看分数</h3>
                  </div>
                  <span className="stock-gate-tip">任何一项未通过，结论直接归为“回避”</span>
                </div>
                <div className="stock-gate-grid">
                  {analysis.hardChecks.map((item) => (
                    <div className="stock-gate-item" key={item.label}>
                      <div>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </div>
                      <span className={`stock-gate-status stock-gate-status-${item.status}`}>
                        {hardCheckLabel(item.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="stock-card stock-watch-card">
                <div className="stock-card-heading">
                  <div>
                    <span className="stock-card-eyebrow">核心观察</span>
                    <h3>接下来真正需要盯住什么</h3>
                  </div>
                </div>
                <div className="stock-watch-grid">
                  {analysis.watchlist.map((item, index) => (
                    <div key={item}>
                      <span>0{index + 1}</span>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeTab === 'finance' && (
            <section className="stock-card">
              <div className="stock-card-heading">
                <div>
                  <span className="stock-card-eyebrow">历史表现</span>
                  <h3>收入、利润与现金流质量</h3>
                </div>
                <span className="stock-table-unit">增速 / ROE：%</span>
              </div>
              <div className="stock-table-wrap">
                <table className="stock-financial-table">
                  <thead>
                    <tr>
                      <th>报告期</th>
                      <th>营收增速</th>
                      <th>扣非利润增速</th>
                      <th>ROE</th>
                      <th>现金流质量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.financials.map((row) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        <td>{formatMetric(row.revenue)}</td>
                        <td>{formatMetric(row.profit)}</td>
                        <td>{formatMetric(row.roe)}</td>
                        <td>
                          <span className="stock-cash-tag">{row.cash}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="stock-data-note">财务指标按最新公开披露口径展示，并在页首标明报告披露日期。</p>
            </section>
          )}

          {activeTab === 'price' && (
            <section className="stock-price-grid">
              <article className="stock-card">
                <div className="stock-card-heading">
                  <div>
                    <span className="stock-card-eyebrow">价格历史</span>
                    <h3>三年趋势与相对位置</h3>
                  </div>
                </div>
                <div className="stock-period-performance">
                  <div className="stock-period-performance-head">
                    <strong>阶段涨跌幅</strong>
                    <span>按 5 / 10 / 20 / 60 / 120 个交易日计算</span>
                  </div>
                  <div className="stock-period-grid">
                    {analysis.performance.map((period) => (
                      <div key={period.label}>
                        <span>{period.label}</span>
                        <strong className={`stock-return-${period.tone}`}>
                          {period.formatted}
                        </strong>
                        <small>
                          {period.startDate && period.endDate
                            ? `${period.startDate.slice(5)} → ${period.endDate.slice(5)}`
                            : '数据不足'}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
                <MiniChart points={analysis.chart} />
              </article>
              <article className="stock-card">
                <div className="stock-card-heading">
                  <div>
                    <span className="stock-card-eyebrow">实时快照</span>
                    <h3>估值位置</h3>
                  </div>
                </div>
                <div className="stock-valuation-list">
                  {analysis.valuation.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.status}</small>
                    </div>
                  ))}
                </div>
                <div className="stock-signal-grid">
                  {analysis.signals.map((signal) => (
                    <div key={signal.label}>
                      <span>{signal.label}</span>
                      <strong className={`stock-signal-${signal.tone}`}>{signal.value}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeTab === 'events' && (
            <section className="stock-events-grid">
              <article className="stock-card">
                <div className="stock-card-heading">
                  <div>
                    <span className="stock-card-eyebrow">信息时间线</span>
                    <h3>公告与新闻事件</h3>
                  </div>
                </div>
                <div className="stock-event-list">
                  {analysis.events.map((event, index) => (
                    <div className="stock-event" key={`${event.title}-${index}`}>
                      <div className={`stock-event-dot stock-event-dot-${event.tone}`} />
                      <div>
                        <div className="stock-event-meta">
                          <span>{event.date}</span>
                          <b>{event.type}</b>
                          <em>{event.source}</em>
                        </div>
                        <h4>
                          {event.url ? (
                            <a href={event.url} target="_blank" rel="noreferrer">
                              {event.title}
                            </a>
                          ) : (
                            event.title
                          )}
                        </h4>
                        <p>{event.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
              <div className="stock-event-side">
                <article className="stock-card stock-list-card stock-positive-card">
                  <span className="stock-card-eyebrow">积极因素</span>
                  <h3>支持当前判断</h3>
                  <ul>
                    {analysis.positives.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
                <article className="stock-card stock-list-card stock-risk-card">
                  <span className="stock-card-eyebrow">风险清单</span>
                  <h3>可能推翻结论</h3>
                  <ul>
                    {analysis.risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </section>
          )}

          <section className="stock-source-panel">
            <div>
              <span className="stock-card-eyebrow">数据透明</span>
              <h3>本次数据来源</h3>
              <p>
                综合评分权重：公司质量 {analysis.scoring?.weights?.quality || '30%'}、成长预期{' '}
                {analysis.scoring?.weights?.growth || '20%'}、估值空间{' '}
                {analysis.scoring?.weights?.valuation || '20%'}、催化剂{' '}
                {analysis.scoring?.weights?.catalysts || '15%'}、价格位置{' '}
                {analysis.scoring?.weights?.trend || '10%'}、财务安全{' '}
                {analysis.scoring?.weights?.safety || '5%'}；风险额外扣除{' '}
                {analysis.scoring?.riskPenalty ?? 0} 分。
              </p>
            </div>
            <div className="stock-source-links">
              {analysis.dataSources.map((source) => (
                <a href={source.url} target="_blank" rel="noreferrer" key={source.label}>
                  <span>{source.label}</span>
                  <strong>{source.provider}</strong>
                </a>
              ))}
            </div>
          </section>

          <footer className="stock-disclaimer">
            {analysis.disclaimer || '本页面用于研究信息整理，不构成投资建议。市场有风险，历史表现不代表未来结果。'}
          </footer>
        </div>
      )}

      {favoritesOpen && (
        <>
          <button
            className="stock-drawer-backdrop"
            type="button"
            aria-label="关闭收藏抽屉"
            onClick={() => setFavoritesOpen(false)}
          />
          <aside className="stock-favorites-drawer" role="dialog" aria-modal="true" aria-label="我的收藏">
            <header className="stock-drawer-header">
              <div>
                <span>WATCHLIST</span>
                <h2>我的收藏</h2>
                <p>收藏后累计涨跌按加入时价格计算</p>
              </div>
              <button type="button" onClick={() => setFavoritesOpen(false)} aria-label="关闭收藏抽屉">
                ×
              </button>
            </header>

            <div className="stock-drawer-toolbar">
              <span>
                {favoritesUpdatedAt
                  ? `更新于 ${formatFavoriteTime(favoritesUpdatedAt)}`
                  : '打开抽屉后获取最新行情'}
              </span>
              <button
                type="button"
                onClick={refreshFavorites}
                disabled={!favorites.length || favoritesStatus === 'refreshing'}
              >
                {favoritesStatus === 'refreshing' ? '刷新中…' : '刷新行情'}
              </button>
            </div>

            <div className="stock-favorite-list">
              {!favorites.length && (
                <div className="stock-favorite-empty">
                  <BookmarkIcon />
                  <strong>还没有收藏股票</strong>
                  <p>分析一家公司后，点击“加入收藏”即可在这里持续跟踪。</p>
                </div>
              )}

              {favorites.map((item) => {
                const liveQuote = favoriteQuotes[item.code];
                const currentPrice =
                  liveQuote?.status === 'ready' && Number.isFinite(liveQuote.price)
                    ? liveQuote.price
                    : null;
                const cumulativeReturn = favoriteReturn(currentPrice, item.addedPrice);
                const returnTone =
                  cumulativeReturn === null || Math.abs(cumulativeReturn) < 0.005
                    ? 'neutral'
                    : cumulativeReturn > 0
                      ? 'positive'
                      : 'negative';

                return (
                  <article className="stock-favorite-item" key={item.code}>
                    <div className="stock-favorite-item-head">
                      <button
                        type="button"
                        className="stock-favorite-name"
                        onClick={() => {
                          setFavoritesOpen(false);
                          runAnalysis(item.code);
                        }}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.code}</span>
                      </button>
                      <button
                        className="stock-favorite-remove"
                        type="button"
                        onClick={() => removeFavorite(item.code)}
                        aria-label={`移除 ${item.name}`}
                      >
                        移除
                      </button>
                    </div>
                    <div className="stock-favorite-prices">
                      <div>
                        <span>加入价格</span>
                        <strong>{item.addedPrice.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span>最新价格</span>
                        <strong>{currentPrice === null ? '--' : currentPrice.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span>收藏至今</span>
                        <strong className={`stock-favorite-return-${returnTone}`}>
                          {cumulativeReturn === null
                            ? '--'
                            : `${cumulativeReturn > 0 ? '+' : ''}${cumulativeReturn.toFixed(2)}%`}
                        </strong>
                      </div>
                    </div>
                    <div className="stock-favorite-meta">
                      <span>加入于 {formatFavoriteTime(item.addedAt)}</span>
                      {liveQuote?.status === 'unavailable' && <em>最新行情暂不可用</em>}
                    </div>
                  </article>
                );
              })}
            </div>

            <footer className="stock-drawer-footer">
              抽屉打开时每30秒自动刷新；非交易时段显示最近成交价。
              {favoritesStatus === 'error' && <strong> 本次行情刷新失败，请稍后重试。</strong>}
            </footer>
          </aside>
        </>
      )}
    </main>
  );
}
