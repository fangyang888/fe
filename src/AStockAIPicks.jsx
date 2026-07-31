import { useState } from "react";

function formatMetric(value, suffix = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)}${suffix}`
    : "--";
}

function formatGeneratedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatSignedPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function AStockAIPicks({ onAnalyze }) {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  const loadPicks = async (forceRefresh = false) => {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(
        `/api/stock/picks?limit=10${forceRefresh ? "&refresh=1" : ""}`,
        { headers: { Accept: "application/json" } },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || `候选池服务返回 ${response.status}`,
        );
      }
      if (!Array.isArray(payload?.picks) || !payload.picks.length) {
        throw new Error("本轮没有形成有效候选");
      }
      setResult(payload);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "候选池暂时不可用");
    }
  };

  return (
    <section className="stock-ai-picks">
      <div className="stock-ai-picks-header">
        <div className="stock-ai-title">
          <span className="stock-ai-mark">AI</span>
          <div>
            <span>MARKET LEARNING</span>
            <h2>资金与行业增强候选池</h2>
            <p>
              扫描活跃A股，执行硬性红线后，结合资金活跃度与行业热度挑选前十家公司。
            </p>
          </div>
        </div>
        <button
          type="button"
          className="stock-ai-run-button"
          onClick={() => loadPicks(Boolean(result))}
          disabled={status === "loading"}
        >
          {status === "loading"
            ? "正在学习市场…"
            : result
              ? "重新学习"
              : "开始AI选股"}
        </button>
      </div>

      <div className="stock-ai-method">
        <span>六维基本面 70%</span>
        <span>成交资金活跃度 18%</span>
        <span>候选样本行业热度 12%</span>
        <span>排除 ST / 金融</span>
      </div>

      {status === "idle" && (
        <div className="stock-ai-idle">
          <strong>点击开始后，模型会读取当前市场真实数据</strong>
          <p>首次计算需要分析多家公司财务、价格和事件；结果缓存15分钟。</p>
        </div>
      )}

      {status === "loading" && (
        <div className="stock-ai-loading" role="status">
          <i />
          <div>
            <strong>正在进行两阶段筛选</strong>
            <p>全市场初筛 → 财务与价格复评 → 资金、行业与事件复核</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="stock-ai-error" role="status">
          <strong>本轮学习未完成</strong>
          <p>{message}。真实数据不足时不会使用虚构候选补足数量。</p>
          <button type="button" onClick={() => loadPicks(true)}>
            重新尝试
          </button>
        </div>
      )}

      {status === "ready" && result && (
        <>
          <div className="stock-ai-summary">
            <div>
              <strong>{result.model}</strong>
              <span>
                初筛通过 {result.scannedCount} 家 · 深度复评{" "}
                {result.detailedCount} 家 · 生成于{" "}
                {formatGeneratedAt(result.generatedAt)}
              </span>
            </div>
            <em>{result.cached ? "15分钟缓存结果" : "本轮实时计算"}</em>
          </div>

          <div className="stock-ai-pick-grid">
            {result.picks.map((pick) => (
              <article className="stock-ai-pick-card" key={pick.code}>
                <div className="stock-ai-pick-head">
                  <span className="stock-ai-rank">
                    {String(pick.rank).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{pick.name}</h3>
                    <p>
                      {pick.code} · {pick.industry}
                    </p>
                  </div>
                  <div className="stock-ai-score">
                    <strong>{pick.score}</strong>
                    <span>{pick.rating}</span>
                  </div>
                </div>

                <div className="stock-ai-market-row">
                  <div>
                    <span>最新价</span>
                    <strong>{formatMetric(pick.price)}</strong>
                  </div>
                  <div>
                    <span>当日涨跌</span>
                    <strong
                      className={
                        pick.changePercent > 0
                          ? "is-up"
                          : pick.changePercent < 0
                            ? "is-down"
                            : ""
                      }
                    >
                      {typeof pick.changePercent === "number"
                        ? `${pick.changePercent > 0 ? "+" : ""}${pick.changePercent.toFixed(2)}%`
                        : "--"}
                    </strong>
                  </div>
                  <div>
                    <span>PE</span>
                    <strong>{formatMetric(pick.metrics?.pe)}</strong>
                  </div>
                  <div>
                    <span>ROE</span>
                    <strong>{formatMetric(pick.metrics?.roe, "%")}</strong>
                  </div>
                </div>

                <div className="stock-ai-signal-row">
                  <div>
                    <span>成交资金活跃度</span>
                    <strong>
                      {pick.capital?.label || "--"} ·{" "}
                      {pick.capital?.score ?? "--"}
                    </strong>
                    <p>
                      当日成交额 {pick.capital?.amountFormatted || "--"} ·
                      换手率 {formatMetric(pick.capital?.turnover, "%")}
                    </p>
                    <i>
                      <b style={{ width: `${pick.capital?.score ?? 0}%` }} />
                    </i>
                  </div>
                  <div>
                    <span>候选样本行业热度</span>
                    <strong>
                      {pick.industryHeat?.label || "--"} ·{" "}
                      {pick.industryHeat?.score ?? "--"}
                    </strong>
                    <p>
                      {pick.industryHeat?.industry || pick.industry} ·{" "}
                      {pick.industryHeat?.sampleCount ?? 0} 家样本 · 平均涨跌{" "}
                      {formatSignedPercent(pick.industryHeat?.averageChange)}
                    </p>
                    <i>
                      <b
                        style={{ width: `${pick.industryHeat?.score ?? 0}%` }}
                      />
                    </i>
                  </div>
                </div>

                <div className="stock-ai-reasons">
                  <span>入选理由</span>
                  <ul>
                    {pick.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div className="stock-ai-risk">
                  <span>主要关注</span>
                  <p>{pick.risk}</p>
                </div>

                <div className="stock-ai-pick-footer">
                  <span>
                    行情 {pick.dataAsOf || "--"} · 财报披露{" "}
                    {pick.reportDate || "--"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onAnalyze(pick.code);
                      window.setTimeout(() => {
                        document
                          .querySelector(".stock-analyzer-content")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }, 120);
                    }}
                  >
                    查看完整分析
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="stock-ai-disclosure">
            <p>{result.methodology}</p>
            <strong>{result.disclaimer}</strong>
            <span>{result.dataSources?.join(" · ")}</span>
          </div>
        </>
      )}
    </section>
  );
}
