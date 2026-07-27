import { useEffect, useState } from 'react';

const WINDOW_LABELS = {
  10: '短期表现',
  20: '近期表现',
  50: '中期表现',
  100: '长期表现',
};

export default function FocusedModelPositionStats({
  endpoint,
  title,
  eyebrow,
  description,
  accent,
  accentSoft,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(`统计加载失败：${requestError.message}`);
        }
      });
    return () => controller.abort();
  }, [endpoint]);

  return (
    <main
      className="focused-position-page"
      style={{ '--focused-accent': accent, '--focused-accent-soft': accentSoft }}
    >
      <style>{`
        .focused-position-page{min-height:100vh;padding:72px 20px 48px;color:#e2e8f0;background:radial-gradient(circle at 50% 0%,var(--focused-accent-soft) 0,#111827 44%,#030712 100%);font-family:Inter,system-ui,sans-serif}
        .focused-position-shell{width:min(980px,100%);margin:0 auto}.focused-position-eyebrow{color:var(--focused-accent);font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
        .focused-position-title{margin:12px 0 8px;color:#f8fafc;font-size:clamp(32px,6vw,56px);line-height:1.05}.focused-position-subtitle{max-width:780px;margin:0;color:#94a3b8;font-size:16px;line-height:1.7}
        .focused-position-current{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;margin-top:24px;padding:28px;border:1px solid color-mix(in srgb,var(--focused-accent) 32%,transparent);border-radius:24px;background:rgba(15,23,42,.72);box-shadow:0 24px 70px rgba(0,0,0,.28)}
        .focused-position-ball{display:grid;place-items:center;width:104px;height:104px;border-radius:50%;color:#fff;font-size:42px;font-weight:900;background:linear-gradient(145deg,var(--focused-accent),#7c3aed);box-shadow:0 14px 35px color-mix(in srgb,var(--focused-accent) 32%,transparent)}
        .focused-position-label,.focused-position-count{color:#94a3b8;font-size:13px}.focused-position-value{margin:6px 0;color:#f8fafc;font-size:26px;font-weight:900}.focused-position-meta{color:var(--focused-accent);font-size:14px}
        .focused-position-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:24px}.focused-position-card{padding:22px;border:1px solid rgba(148,163,184,.16);border-radius:20px;background:rgba(15,23,42,.62)}
        .focused-position-rate{margin:12px 0 4px;color:#f8fafc;font-size:36px;font-weight:900}.focused-position-rate.perfect{color:#4ade80}.focused-position-rate.strong{color:#a7f3d0}
        .focused-position-bar{height:7px;margin-top:18px;overflow:hidden;border-radius:999px;background:#1e293b}.focused-position-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--focused-accent),#4ade80)}
        .focused-position-note,.focused-position-status{margin-top:20px;padding:18px 20px;border-radius:16px;color:#94a3b8;font-size:14px;line-height:1.65;background:rgba(15,23,42,.6)}.focused-position-back{display:inline-block;margin-top:22px;color:var(--focused-accent);text-decoration:none}
        @media(max-width:760px){.focused-position-grid{grid-template-columns:1fr 1fr}.focused-position-current{grid-template-columns:1fr}.focused-position-ball{width:88px;height:88px}}
      `}</style>

      <div className="focused-position-shell">
        <div className="focused-position-eyebrow">{eyebrow}</div>
        <h1 className="focused-position-title">{title}</h1>
        <p className="focused-position-subtitle">{description}</p>

        {error ? (
          <div className="focused-position-status">{error}</div>
        ) : !data ? (
          <div className="focused-position-status">正在计算滚动统计…</div>
        ) : (
          <>
            <section className="focused-position-current">
              <div className="focused-position-ball">{data.prediction.n}</div>
              <div>
                <div className="focused-position-label">
                  当前{data.modelLabel}第{data.position}位预测杀码
                </div>
                <div className="focused-position-value">
                  号码 {data.prediction.n}
                </div>
                <div className="focused-position-meta">
                  模型杀码概率 {data.prediction.killProbability.toFixed(1)}% ·
                  预计出现概率 {data.prediction.appearProbability.toFixed(1)}%
                </div>
              </div>
            </section>

            <section
              className="focused-position-grid"
              aria-label={`${data.modelLabel}第${data.position}位滚动回测`}
            >
              {data.windows.map((window) => (
                <article className="focused-position-card" key={window.periods}>
                  <div className="focused-position-label">
                    {WINDOW_LABELS[window.periods]} · 近{window.periods}期
                  </div>
                  <div
                    className={`focused-position-rate ${
                      window.rate === 100
                        ? 'perfect'
                        : window.rate >= 95
                          ? 'strong'
                          : ''
                    }`}
                  >
                    {window.rate.toFixed(1)}%
                  </div>
                  <div className="focused-position-count">
                    成功 {window.successCount}/{window.samples} · 失败{' '}
                    {window.failureCount}
                  </div>
                  <div className="focused-position-bar">
                    <div
                      className="focused-position-fill"
                      style={{ width: `${window.rate}%` }}
                    />
                  </div>
                </article>
              ))}
            </section>

            <div className="focused-position-note">
              数据库共 {data.historyMeta.count} 期，最新为{' '}
              {data.historyMeta.latest.year} 年第 {data.historyMeta.latest.No}{' '}
              期。每个回测样本只使用当期开奖前已有的数据重新生成模型排序；成功表示预测号码未出现在下一期7个号码中。
            </div>
          </>
        )}

        <a className="focused-position-back" href="/fe/kill">
          ← 返回基础杀码
        </a>
      </div>
    </main>
  );
}
