import { memo, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./ResearchObservationKill.css";

const WINDOWS = [10, 20, 50, 100, 200];

const pct = (value, count, digits = 1) =>
  count > 0 && Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)}%`
    : "—";

const period = (row) =>
  row?.year && row?.No
    ? `${row.year}-${String(row.No).padStart(3, "0")}`
    : "—";

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.2 8.3A7 7 0 0 1 18.8 10M17.8 15.7A7 7 0 0 1 5.2 14" />
    </svg>
  );
}

const Metric = memo(function Metric({ label, report }) {
  return (
    <div className="ro-metric">
      <span>{label}</span>
      <strong>{pct(report?.successRate, report?.count)}</strong>
      <small>
        {report?.count
          ? `${report.successCount}/${report.count} 成功`
          : "暂无样本"}
      </small>
    </div>
  );
});

function RollingCurve({ points = [] }) {
  const chart = useMemo(() => {
    if (!points.length) return { line: "", area: "" };
    const coords = points.map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 900;
      const y = 170 - Math.max(0.65, Math.min(1, point.rate)) * 160;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      line: coords.join(" "),
      area: `M ${coords[0]} L ${coords.join(" L ")} L 900 180 L 0 180 Z`,
    };
  }, [points]);

  return (
    <div className="ro-curve-wrap">
      <div className="ro-curve-axis">
        <span>100%</span>
        <span>90%</span>
        <span>80%</span>
        <span>70%</span>
      </div>
      <svg viewBox="0 0 900 180" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ro-curve-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ro-accent)" stopOpacity=".24" />
            <stop offset="1" stopColor="var(--ro-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g>
          {[10, 55, 100, 145].map((y) => (
            <line key={y} x1="0" y1={y} x2="900" y2={y} />
          ))}
        </g>
        {chart.area ? <path d={chart.area} fill="url(#ro-curve-area)" /> : null}
        {chart.line ? <polyline points={chart.line} /> : null}
      </svg>
      <footer>
        <span>{period(points[0])}</span>
        <span>{period(points.at(-1))}</span>
      </footer>
    </div>
  );
}

function RiskField({ items = [], selected }) {
  return (
    <div className="ro-risk-field" role="list" aria-label="01至49号后验风险">
      {items.map((item) => (
        <div
          className={`ro-risk-cell ${item.selected ? "is-selected" : ""}`}
          key={item.number}
          role="listitem"
          title={`号码${item.display}，风险${item.risk.toFixed(4)}`}
        >
          <strong>{item.display}</strong>
          <span>{item.risk.toFixed(3)}</span>
          <i style={{ height: `${Math.max(4, (1 - item.normalizedRisk) * 100)}%` }} />
        </div>
      ))}
      <div className="ro-risk-caption">
        <span>低风险</span>
        <b>当前选择 {selected}</b>
        <span>高风险</span>
      </div>
    </div>
  );
}

function StateDistribution({ items = [] }) {
  const max = Math.max(...items.map((item) => item.weight), 1e-9);
  return (
    <div className="ro-diagnostic">
      <header>
        <div>
          <h3>后验状态分布</h3>
          <p>31个固定粒子 · 横轴为隐含出现概率</p>
        </div>
        <span>概率质量</span>
      </header>
      <div className="ro-state-bars">
        {items.map((item) => (
          <i
            key={item.logit}
            style={{ height: `${Math.max(2, (item.weight / max) * 100)}%` }}
            title={`出现概率${(item.probability * 100).toFixed(1)}%，权重${(
              item.weight * 100
            ).toFixed(1)}%`}
          />
        ))}
      </div>
      <footer>
        <span>{items[0] ? pct(items[0].probability, 1) : "—"}</span>
        <span>{items.at(-1) ? pct(items.at(-1).probability, 1) : "—"}</span>
      </footer>
    </div>
  );
}

function BlockProfile({ items = [] }) {
  const max = Math.max(...items.map((item) => item.rate), 1 / 24);
  return (
    <div className="ro-diagnostic">
      <header>
        <div>
          <h3>8个时间块压力</h3>
          <p>每块固定24期 · 红色标记最坏块</p>
        </div>
        <span>出现率</span>
      </header>
      <div className="ro-block-bars">
        {items.map((item) => (
          <div key={item.block} className={item.worst ? "is-worst" : ""}>
            <span>{pct(item.rate, item.count)}</span>
            <i style={{ height: `${Math.max(4, (item.rate / max) * 100)}%` }} />
            <b>B{item.block}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyTimeline() {
  return (
    <div className="ro-empty">
      <strong>从 2026-199 开始记录</strong>
      <span>模型冻结后，只追加真实开奖，不回填历史结果</span>
    </div>
  );
}

export default function ResearchObservationKill({ config }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${config.title} · 前瞻观察`;
    return () => {
      document.title = previousTitle;
    };
  }, [config.title]);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(config.endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.message || `HTTP ${response.status}`);
        return payload;
      })
      .then(setData)
      .catch((reason) => {
        if (reason.name !== "AbortError")
          setError(reason.message || "加载失败");
      });
    return () => controller.abort();
  }, [config.endpoint, reloadKey]);

  const prediction = data?.prediction;
  const backtests = data?.backtests || {};
  const validation = data?.validation;
  const latest = data?.historyMeta?.latest;
  const diagnostic =
    config.variant === "diffusion" ? (
      <StateDistribution items={data?.stateDistribution} />
    ) : (
      <BlockProfile items={data?.blockProfile} />
    );

  return (
    <main
      className={`ro-page is-${config.variant}`}
      style={{
        "--ro-accent": config.accent,
        "--ro-accent-rgb": config.accentRgb,
        "--ro-soft": config.soft,
      }}
    >
      <header className="ro-nav">
        <Link className="ro-brand" to={config.path}>
          {config.shortTitle}
        </Link>
        <nav>
          <Link to="/kill">返回杀码</Link>
          <Link to={config.peerPath}>{config.peerLabel}</Link>
        </nav>
      </header>

      <div className="ro-shell">
        {error ? <div className="ro-message is-error">加载失败：{error}</div> : null}
        {!error && !data ? (
          <div className="ro-message">{config.loadingText}</div>
        ) : null}
        {data?.status === "insufficient-history" ? (
          <div className="ro-message">{data.message}</div>
        ) : null}

        {prediction ? (
          <>
            <section className="ro-hero">
              <article className="ro-intro">
                <span className="ro-eyebrow">{config.eyebrow}</span>
                <h1>{config.title}</h1>
                <p>{config.description}</p>
                <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
                  <RefreshIcon />重新计算
                </button>

                <div className="ro-prediction">
                  <div>
                    <span>下一期冻结观察号</span>
                    <strong>{prediction.display}</strong>
                  </div>
                  <p>{prediction.actionLabel}</p>
                  <small>
                    数据截至 {period(latest)} · 分离度 {prediction.separation.toFixed(3)}
                  </small>
                </div>

                <div className="ro-evidence">
                  <Metric label="近50期" report={backtests.backtest50} />
                  <Metric label="近100期" report={backtests.backtest100} />
                  <Metric label="近200期" report={backtests.backtest200} />
                </div>
              </article>

              <article className="ro-model-panel">
                <header>
                  <div>
                    <h2>49码风险状态</h2>
                    <p>风险越低，越接近当前冻结观察候选</p>
                  </div>
                  <span>STRICT WALK-FORWARD</span>
                </header>
                <RiskField items={data.riskMap} selected={prediction.display} />
                {diagnostic}
              </article>
            </section>

            <section className="ro-performance">
              <article className="ro-panel ro-window-panel">
                <header>
                  <div>
                    <span>BACKTEST WINDOWS</span>
                    <h2>五窗口走步统计</h2>
                  </div>
                  <p>目标期数据从不参与当期计算</p>
                </header>
                <div className="ro-window-grid">
                  {WINDOWS.map((window) => (
                    <Metric
                      key={window}
                      label={`近${window}期`}
                      report={backtests[`backtest${window}`]}
                    />
                  ))}
                </div>
                <RollingCurve points={data.walkForwardCurve} />
              </article>

              <article className="ro-panel ro-live-panel">
                <header>
                  <div>
                    <span>PROSPECTIVE ONLY</span>
                    <h2>冻结后真实观察</h2>
                  </div>
                  <strong>{validation?.count || 0}期</strong>
                </header>
                {validation?.rows?.length ? (
                  <div className="ro-live-list">
                    {validation.rows.map((row) => (
                      <div key={`${row.year}-${row.No}`}>
                        <span>{period(row)}</span>
                        <b>{row.predictedDisplay}</b>
                        <small>
                          {row.actualNumbers
                            .map((number) => String(number).padStart(2, "0"))
                            .join(" · ")}
                        </small>
                        <strong className={row.success ? "is-success" : "is-failure"}>
                          {row.success ? "成功" : "失败"}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyTimeline />
                )}
                <footer>
                  <span>冻结起点 2026-199</span>
                  <b>{pct(validation?.successRate, validation?.count)}</b>
                </footer>
              </article>
            </section>

            <section className="ro-methods">
              <header>
                <span>METHODOLOGY</span>
                <h2>固定算法流程</h2>
              </header>
              <div>
                {data.methodology.map((item, index) => (
                  <article key={item.key}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <h3>{item.title}</h3>
                    <strong>{item.formula}</strong>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
            </section>

            <aside className="ro-warning">
              <b>观察说明</b>
              <p>
                历史走步命中率不是未来保证概率。算法参数已按2026-198冻结，页面从2026-199起独立累计真实结果，不因短期输赢回改参数。
              </p>
            </aside>
          </>
        ) : null}
      </div>
    </main>
  );
}
