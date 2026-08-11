import { memo, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./LatentFactorKill.css";

const FACTOR_COLORS = ["#6ee7c8", "#8fd332", "#56cde8", "#efb93d"];
const BACKTEST_KEYS = [20, 50, 100, 200, 500];

const pct = (value, count, digits = 2) =>
  count > 0 && Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)}%`
    : "—";

const period = (row) =>
  row?.year && row?.No ? `${row.year}-${String(row.No).padStart(3, "0")}` : "—";

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.2 8.3A7 7 0 0 1 18.8 10M17.8 15.7A7 7 0 0 1 5.2 14" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v12h14V9M9 21v-7h6v7" />
    </svg>
  );
}

const FactorWave = memo(function FactorWave({ factor }) {
  const points = useMemo(() => {
    const values = factor?.recentSeries || [];
    if (!values.length) return "";
    return values
      .map((value, index) => {
        const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 420;
        const y = 18 - Math.max(-1, Math.min(1, value)) * 13;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [factor?.recentSeries]);

  const color = FACTOR_COLORS[(factor?.index || 1) - 1];
  return (
    <div className="lf-wave-row">
      <strong style={{ color }}>F{factor?.index}</strong>
      <svg
        viewBox="0 0 420 36"
        preserveAspectRatio="none"
        aria-label={`因子${factor?.index}最近32期轨迹`}
      >
        <line x1="0" y1="18" x2="420" y2="18" />
        <polyline points={points} style={{ stroke: color }} />
      </svg>
      <span>φ {factor?.phi?.toFixed(3)}</span>
    </div>
  );
});

const FactorField = memo(function FactorField({ factors = [], items = [] }) {
  return (
    <section
      className="lf-factor-canvas"
      aria-label="四因子与49个号码的实时映射"
    >
      <header>
        <div>
          <h2>因子影响图谱</h2>
          <span>49 × 4 · 最近 32 期轨迹</span>
        </div>
        <div className="lf-factor-legend">
          {FACTOR_COLORS.map((color, index) => (
            <span key={color} style={{ "--factor-color": color }}>
              因子 {index + 1}
            </span>
          ))}
        </div>
      </header>

      <div className="lf-waves">
        {factors.map((factor) => (
          <FactorWave key={factor.index} factor={factor} />
        ))}
      </div>

      <div
        className="lf-number-field"
        role="list"
        aria-label="01至49号因子贡献"
      >
        {items.map((item) => (
          <div
            className={`lf-number-cell ${item.selected ? "is-selected" : ""}`}
            key={item.number}
            role="listitem"
            title={`号码${item.display}，重构风险${item.risk.toFixed(4)}`}
          >
            <strong>{item.display}</strong>
            <div>
              {item.contributions.map((value, index) => (
                <i
                  key={index}
                  style={{
                    "--factor-color": FACTOR_COLORS[index],
                    opacity: 0.32 + Math.abs(value) * 0.68,
                    transform: `scale(${0.72 + Math.abs(value) * 0.28})`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <footer>
        <span>低重构风险</span>
        <i />
        <span>高重构风险</span>
        <small>单位：标准化排序</small>
      </footer>
    </section>
  );
});

function EvidenceMetric({ label, value, detail }) {
  return (
    <div className="lf-evidence-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function EmptyTimeline() {
  return (
    <div className="lf-empty">
      <svg viewBox="0 0 64 76" aria-hidden="true">
        <path d="M12 2h28l12 12v60H12z" />
        <path d="M40 2v14h12M21 32h22M21 43h22M21 54h16" />
      </svg>
      <strong>从 2026-199 开始记录</strong>
      <span>不回填历史结果</span>
    </div>
  );
}

function MethodStep({ index, title, formula, children }) {
  return (
    <article className="lf-method-step">
      <span>{index}</span>
      <h3>{title}</h3>
      <strong>{formula}</strong>
      <p>{children}</p>
    </article>
  );
}

export default function LatentFactorKill() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "低秩动态因子 · 前瞻观察";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/kill/latent-factor", {
      cache: "no-store",
      signal: controller.signal,
    })
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
  }, [reloadKey]);

  const prediction = data?.prediction;
  const backtests = data?.backtests || {};
  const historicalValidation = data?.historicalValidation;
  const validation = data?.validation;
  const latest = data?.historyMeta?.latest;

  return (
    <main className="lf-page">
      <header className="lf-nav">
        <Link className="lf-brand" to="/kill/latent-factor">
          低秩动态因子
        </Link>
        <nav aria-label="页面导航">
          <Link to="/kill">
            <HomeIcon />
            返回杀码
          </Link>
          <Link to="/kill/spectral-cancellation">
            <span className="lf-nav-wave">∿</span>频谱相消
          </Link>
        </nav>
      </header>

      <div className="lf-shell">
        {error ? (
          <div className="lf-message is-error">加载失败：{error}</div>
        ) : null}
        {!error && !data ? (
          <div className="lf-message">正在重建 49 维因子状态…</div>
        ) : null}
        {data?.status === "insufficient-history" ? (
          <div className="lf-message">{data.message}</div>
        ) : null}

        {prediction ? (
          <>
            <section className="lf-hero">
              <div className="lf-intro">
                <h1>
                  把 49 条轨迹，
                  <br />
                  压缩成 4 个正在变化的因子
                </h1>
                <p>
                  固定窗口 192 · 固定因子 4 · 前瞻起点 <b>2026-199</b>
                </p>
                <button
                  type="button"
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  <RefreshIcon />
                  刷新数据
                </button>

                <div className="lf-prediction">
                  <span>下一期观察号</span>
                  <strong>{prediction.display}</strong>
                  <p>{prediction.actionLabel}</p>
                  <small>
                    最新数据 {period(latest)} · 分离度{" "}
                    {prediction.separation.toFixed(3)}
                  </small>
                </div>

                <div className="lf-evidence-rail">
                  <EvidenceMetric
                    label="时间外验证"
                    value={pct(
                      historicalValidation?.successRate,
                      historicalValidation?.count,
                    )}
                    detail={`${historicalValidation?.successCount || 0}/${historicalValidation?.count || 0}`}
                  />
                  <EvidenceMetric
                    label="最近 200 期"
                    value={pct(
                      backtests.backtest200?.successRate,
                      backtests.backtest200?.count,
                      1,
                    )}
                    detail={`${backtests.backtest200?.successCount || 0}/${backtests.backtest200?.count || 0}`}
                  />
                  <EvidenceMetric
                    label="前瞻样本"
                    value={String(validation?.count || 0)}
                    detail="冻结后真实开奖"
                  />
                </div>
              </div>

              <FactorField factors={data.factors} items={data.factorMap} />
            </section>

            <section className="lf-results">
              <article className="lf-history">
                <header>
                  <h2>历史走步表现（回测区间）</h2>
                  <p>每一期只读取目标期之前的滚动 192 期数据</p>
                </header>
                <div className="lf-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>评估窗口</th>
                        <th>成功</th>
                        <th>总数</th>
                        <th>成功率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BACKTEST_KEYS.map((size) => {
                        const report = backtests[`backtest${size}`];
                        return (
                          <tr key={size}>
                            <td>{size} 期</td>
                            <td>{report?.successCount ?? "—"}</td>
                            <td>{report?.count ?? "—"}</td>
                            <td>{pct(report?.successRate, report?.count)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <small>历史验证固定截至 2026-198；不计入后续前瞻结果。</small>
              </article>

              <article className="lf-prospective">
                <header>
                  <h2>前瞻观察时间线（冻结区间）</h2>
                  <p>从 2026-199 起，只记录真实开奖的结果</p>
                </header>
                <div className="lf-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>期号</th>
                        <th>观察号</th>
                        <th>实际号码</th>
                        <th>结果</th>
                        <th>累计</th>
                      </tr>
                    </thead>
                  </table>
                  {validation?.rows?.length ? (
                    <div className="lf-prospective-rows">
                      {validation.rows.map((row) => (
                        <div key={`${row.year}-${row.No}`}>
                          <span>{period(row)}</span>
                          <b>{row.predictedDisplay}</b>
                          <span>
                            {row.actualNumbers
                              .map((number) => String(number).padStart(2, "0"))
                              .join(" · ")}
                          </span>
                          <strong
                            className={
                              row.success ? "is-success" : "is-failure"
                            }
                          >
                            {row.success ? "成功" : "失败"}
                          </strong>
                          <span>
                            {pct(validation.successRate, validation.count, 1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyTimeline />
                  )}
                </div>
                <small>前瞻起点：2026-199（模型参数已冻结）</small>
              </article>
            </section>

            <section className="lf-methodology">
              <h2>方法论：四步构建低秩动态因子与单码选择</h2>
              <div>
                <MethodStep
                  index="1"
                  title="构建出现矩阵"
                  formula="X ∈ {0,1}¹⁹²ˣ⁴⁹"
                >
                  每期每个号码出现记为 1，否则记为 0，只读取最近 192 期。
                </MethodStep>
                <MethodStep index="2" title="协方差压缩" formula="Σ → U₄">
                  固定提取四个主协方差方向，得到四条潜在因子轨迹。
                </MethodStep>
                <MethodStep index="3" title="因子预测" formula="f̂ₜ₊₁ = φfₜ">
                  每条因子使用固定 AR(1) 一步外推，不根据结果临时换模型。
                </MethodStep>
                <MethodStep index="4" title="重构风险" formula="r = μ + U₄f̂">
                  把因子预测映射回 49 个号码，选择重构风险最低的一码。
                </MethodStep>
              </div>
            </section>

            <aside className="lf-risk">
              <span>!</span>
              <div>
                <strong>风险提示</strong>
                <p>
                  历史回测不是未来概率。该页面从 2026-199
                  起冻结模型并独立累计真实结果，不因短期输赢回改参数。
                </p>
              </div>
            </aside>

            <footer className="lf-footer">
              <span>低秩动态因子研究控制台</span>
              <i />
              <span>数据截至 {period(latest)}</span>
            </footer>
          </>
        ) : null}
      </div>
    </main>
  );
}
