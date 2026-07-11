import { useEffect, useState } from 'react';

const pct = (value) => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '--';
const ball = (value) => String(value ?? '--').padStart(2, '0');

function Stat({ label, data }) {
  return (
    <div className="d7-stat">
      <strong>{pct(data?.successRate)}</strong>
      <span>{label} · {data?.successCount ?? 0}/{data?.count ?? 0}</span>
    </div>
  );
}

function NumberCard({ item }) {
  const primary = item?.sources?.[0];
  return (
    <article className={`d7-number ${item.role === 'core' ? 'is-core' : ''}`}>
      <div className="d7-number-head">
        <span>{item.role === 'core' ? '核心' : '动态'}</span>
        <span>评分 {item.score?.toFixed(3)}</span>
      </div>
      <div className="d7-ball">{ball(item.number)}</div>
      <strong>{primary?.name || '--'}</strong>
      <p>近20 {pct(primary?.rate20)} · 近50 {pct(primary?.rate50)}</p>
      <p>{item.consensusCount > 1 ? `${item.consensusCount}条通道共识` : '单通道候选'} · 近10出现 {item.frequency10} 次</p>
      <div className="d7-tags">
        {(item.sources || []).slice(0, 3).map((source) => (
          <span key={source.lane}>{source.family}</span>
        ))}
      </div>
    </article>
  );
}

export default function DynamicSevenKill() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/kill/dynamic-seven', {
          cache: 'no-store', signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || `接口返回 ${response.status}`);
        setData(json);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, []);

  const recommendation = data?.currentRecommendation;
  const latest = data?.historyMeta?.latest;
  const actionText = recommendation?.action === 'output-seven'
    ? '当前可输出7码'
    : recommendation?.action === 'core-plus-observe'
      ? '核心4码 + 动态3码观察'
      : '当前建议跳过';

  return (
    <main className="d7-page">
      <style>{styles}</style>
      <div className="d7-shell">
        <header className="d7-header">
          <div>
            <span className="d7-kicker">独立严格滚动 · 数据库学习</span>
            <h1>动态学习 7 杀</h1>
            <p>从6个原始实验页面动态选择，采用4个核心码与3个动态码；不读取旧组合7杀。</p>
          </div>
          <div className="d7-meta">
            <span>数据库 {data?.historyMeta?.count || '--'} 期</span>
            <span>最新 {latest ? `${latest.year}-${String(latest.No).padStart(3, '0')}` : '--'}</span>
          </div>
        </header>

        {loading ? <div className="d7-message">首次严格回测计算量较大，正在动态学习...</div> : null}
        {error ? <div className="d7-message is-error">{error}</div> : null}
        {!loading && !error && data?.status === 'insufficient-history'
          ? <div className="d7-message">{data.message}</div> : null}

        {!loading && !error && data?.status === 'ready' ? (
          <>
            <section className="d7-summary">
              <div>
                <span className={`d7-signal is-${data.confidence}`}>{actionText}</span>
                <h2>{(recommendation?.numbers || []).map((item) => ball(item.number)).join(' · ')}</h2>
                <p>{data.method?.statement}</p>
              </div>
              <div className="d7-stats">
                <Stat label="近20期整组" data={data.backtest20} />
                <Stat label="近50期整组" data={data.backtest50} />
                <Stat label="近100期整组" data={data.backtest100} />
              </div>
            </section>

            <section className="d7-section">
              <div className="d7-section-title">
                <h2>本期动态组合</h2>
                <span>前4个为核心，后3个为动态补位</span>
              </div>
              <div className="d7-grid">
                {(recommendation?.numbers || []).map((item) => <NumberCard key={item.number} item={item} />)}
              </div>
            </section>

            <section className="d7-section">
              <div className="d7-section-title">
                <h2>近20期严格回测</h2>
                <span>每期只使用此前数据</span>
              </div>
              <div className="d7-table-wrap">
                <table className="d7-table">
                  <thead><tr><th>期号</th><th>7个杀码</th><th>结果</th><th>被开出</th></tr></thead>
                  <tbody>
                    {(data.backtest20?.rows || []).map((row) => (
                      <tr key={`${row.year}-${row.No}`}>
                        <td>{row.year}-{String(row.No).padStart(3, '0')}</td>
                        <td>{row.killNumbers.map(ball).join('、')}</td>
                        <td><span className={row.success ? 'd7-ok' : 'd7-bad'}>{row.success ? '全杀成功' : '组合失败'}</span></td>
                        <td>{row.appearedNumbers.length ? row.appearedNumbers.map(ball).join('、') : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

const styles = `
  .d7-page{min-height:100vh;background:#0b1110;color:#edf7f3;padding:68px 18px 48px;box-sizing:border-box}.d7-shell{width:min(1220px,100%);margin:auto}.d7-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;border-bottom:1px solid #263531;padding-bottom:22px}.d7-kicker{color:#5eead4;font-size:12px;font-weight:900}.d7-header h1{font-size:clamp(30px,5vw,58px);margin:8px 0;line-height:1}.d7-header p,.d7-summary p{color:#9fb3ac;margin:0;line-height:1.6}.d7-meta{display:flex;gap:8px;flex-wrap:wrap}.d7-meta span,.d7-section-title span{border:1px solid #2f5148;background:#11241f;color:#99f6e4;padding:7px 10px;border-radius:6px;font-size:12px}.d7-message{margin-top:24px;padding:20px;border:1px solid #31564c;background:#10201c}.d7-message.is-error{color:#fca5a5;border-color:#7f1d1d}.d7-summary{display:grid;grid-template-columns:1fr 1.2fr;gap:18px;margin:24px 0}.d7-summary>div{border:1px solid #293d37;background:#111b18;padding:20px}.d7-summary h2{font-size:28px;letter-spacing:2px;margin:15px 0 8px}.d7-signal{display:inline-flex;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:900;background:#3f3f46}.d7-signal.is-strong{background:#14532d;color:#bbf7d0}.d7-signal.is-watch{background:#713f12;color:#fde68a}.d7-signal.is-weak{background:#7f1d1d;color:#fecaca}.d7-stats{display:grid!important;grid-template-columns:repeat(3,1fr);gap:1px!important;padding:1px!important;background:#293d37!important}.d7-stat{background:#111b18;padding:18px}.d7-stat strong{display:block;font-size:28px}.d7-stat span{display:block;color:#91a49e;font-size:12px;margin-top:6px}.d7-section{margin-top:18px;border:1px solid #293d37;background:#0f1816;padding:18px}.d7-section-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px}.d7-section-title h2{font-size:18px;margin:0}.d7-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}.d7-number{border:1px solid #34443f;background:#151e1c;padding:12px;min-width:0}.d7-number.is-core{border-color:#2dd4bf;background:#102a24}.d7-number-head{display:flex;justify-content:space-between;color:#91a49e;font-size:10px}.d7-ball{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:#f0fdfa;color:#134e4a;font-size:23px;font-weight:950;margin:14px auto}.d7-number>strong{font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.d7-number p{font-size:11px;color:#9fb3ac;margin:6px 0}.d7-tags{display:flex;flex-wrap:wrap;gap:4px}.d7-tags span{font-size:9px;padding:3px 5px;background:#24332f;color:#b7cec7}.d7-table-wrap{overflow-x:auto}.d7-table{width:100%;min-width:760px;border-collapse:collapse;font-size:12px}.d7-table th,.d7-table td{text-align:left;padding:10px 8px;border-bottom:1px solid #263531}.d7-table th{color:#8da099}.d7-ok{color:#86efac}.d7-bad{color:#fca5a5}.d7-ok,.d7-bad{font-weight:900}@media(max-width:1000px){.d7-grid{grid-template-columns:repeat(4,1fr)}.d7-summary{grid-template-columns:1fr}}@media(max-width:650px){.d7-header{align-items:flex-start;flex-direction:column}.d7-stats{grid-template-columns:1fr}.d7-grid{grid-template-columns:repeat(2,1fr)}}
`;
