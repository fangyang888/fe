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

function regimeTone(value) {
  if (value === "进攻") return "is-positive";
  if (value === "防守") return "is-warning";
  return "is-neutral";
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
            <h2>市场自适应学习排序候选池</h2>
            <p>
              从历史行业超额收益中学习有效特征，并结合资金热点、蓄势结构与可持续现金分红。
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
        <span>历史学习排序 24%</span>
        <span>六维基本面 10%</span>
        <span>行业相对排名 10%</span>
        <span>真实主力净流入 18%</span>
        <span>全市场行业热度 12%</span>
        <span>蓄势结构 6%—14%</span>
        <span>红利质量 12%—20%</span>
        <span>进攻 / 均衡 / 防守</span>
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
            <p>
              全市场初筛 → 财务红线复评 → 市场状态、行业排名与滚动历史验证
            </p>
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
                {result.detailedCount} 家 · 资金覆盖{" "}
                {result.capitalCoverageCount ?? "--"} 家 · 红利覆盖{" "}
                {result.dividendCoverageCount ?? "--"} 家 · 生成于{" "}
                {formatGeneratedAt(result.generatedAt)}
              </span>
            </div>
            <em>{result.cached ? "15分钟缓存结果" : "本轮实时计算"}</em>
          </div>

          <div className="stock-ai-context-grid">
            <section
              className={`stock-ai-context-card ${regimeTone(result.marketRegime?.label)}`}
            >
              <div className="stock-ai-context-head">
                <span>当前市场状态</span>
                <strong>{result.marketRegime?.label || "--"}</strong>
              </div>
              <div className="stock-ai-context-metrics">
                <div>
                  <span>状态分</span>
                  <b>{result.marketRegime?.score ?? "--"}</b>
                </div>
                <div>
                  <span>候选数量</span>
                  <b>{result.targetPickCount ?? result.picks.length} 家</b>
                </div>
                <div>
                  <span>沪深300近20日</span>
                  <b>{formatSignedPercent(result.marketRegime?.indexReturn20)}</b>
                </div>
                <div>
                  <span>全市场上涨占比</span>
                  <b>{formatMetric(result.marketRegime?.breadth, "%")}</b>
                </div>
              </div>
              <p>{result.marketRegime?.reason || "市场状态数据不足"}</p>
            </section>

            <section className="stock-ai-context-card is-backtest">
              <div className="stock-ai-context-head">
                <span>20交易日滚动验证</span>
                <strong>{result.backtest?.label || "--"}</strong>
              </div>
              <div className="stock-ai-context-metrics">
                <div>
                  <span>检查点</span>
                  <b>{result.backtest?.checkpoints ?? 0} 个</b>
                </div>
                <div>
                  <span>平均收益</span>
                  <b>{formatSignedPercent(result.backtest?.averageReturn)}</b>
                </div>
                <div>
                  <span>相对样本超额</span>
                  <b>{formatSignedPercent(result.backtest?.excessReturn)}</b>
                </div>
                <div>
                  <span>正收益率</span>
                  <b>{formatMetric(result.backtest?.positiveRate, "%")}</b>
                </div>
              </div>
              <p>{result.backtest?.limitation || "暂未形成可用历史样本"}</p>
            </section>

            <section className="stock-ai-context-card is-learning">
              <div className="stock-ai-context-head">
                <span>20日行业超额学习排序</span>
                <strong>{result.learnedModel?.label || "--"}</strong>
              </div>
              <div className="stock-ai-context-metrics">
                <div>
                  <span>可信度</span>
                  <b>{result.learnedModel?.confidence || "--"}</b>
                </div>
                <div>
                  <span>训练窗口</span>
                  <b>{result.learnedModel?.trainingWindows ?? 0} 个</b>
                </div>
                <div>
                  <span>训练观测</span>
                  <b>{result.learnedModel?.observations ?? 0} 条</b>
                </div>
                <div>
                  <span>样本外超额</span>
                  <b>
                    {formatSignedPercent(
                      result.learnedModel?.validationExcessReturn,
                    )}
                  </b>
                </div>
              </div>
              <p>
                {(result.learnedModel?.features || [])
                  .slice(0, 3)
                  .map(
                    (feature) =>
                      `${feature.label} ${feature.weight > 0 ? "+" : ""}${feature.weight}%`,
                  )
                  .join(" · ") || result.learnedModel?.limitation || "学习样本不足"}
              </p>
            </section>
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
                    <span>
                      {pick.rating} · {pick.signalCount ?? 0}项共振
                    </span>
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
                    <span>历史学习排序</span>
                    <strong>
                      {formatMetric(pick.learnedRank)} ·{" "}
                      {result.learnedModel?.confidence || "--"}可信度
                    </strong>
                    <p>
                      目标为未来20日行业相对收益 · 样本外{" "}
                      {formatSignedPercent(
                        result.learnedModel?.validationExcessReturn,
                      )}
                    </p>
                    <i>
                      <b style={{ width: `${pick.learnedRank ?? 0}%` }} />
                    </i>
                  </div>
                  <div>
                    <span>近{pick.capital?.flowDays || 5}日主力资金</span>
                    <strong>
                      {pick.capital?.label || "--"} ·{" "}
                      {pick.capital?.score ?? "--"}
                    </strong>
                    <p>
                      净流入 {pick.capital?.mainNetInflowFormatted || "--"} ·
                      {pick.capital?.positiveDays ?? 0}日流入 · 日均占比{" "}
                      {formatSignedPercent(pick.capital?.mainNetRatio)}
                    </p>
                    <i>
                      <b style={{ width: `${pick.capital?.score ?? 0}%` }} />
                    </i>
                  </div>
                  <div>
                    <span>
                      {pick.industryHeat?.source === "market-board"
                        ? "全市场热点行业"
                        : "行业资金热度"}
                    </span>
                    <strong>
                      {pick.industryHeat?.label || "--"} ·{" "}
                      {pick.industryHeat?.score ?? "--"}
                    </strong>
                    <p>
                      {pick.industryHeat?.industry || pick.industry} · 主力{" "}
                      {pick.industryHeat?.mainNetInflowFormatted || "--"} · 涨跌{" "}
                      {formatSignedPercent(pick.industryHeat?.averageChange)}
                    </p>
                    <i>
                      <b
                        style={{ width: `${pick.industryHeat?.score ?? 0}%` }}
                      />
                    </i>
                  </div>
                  <div>
                    <span>现金红利质量</span>
                    <strong>
                      {pick.dividend?.label || "--"} ·{" "}
                      {pick.dividend?.score ?? "--"}
                    </strong>
                    <p>
                      近12月股息率{" "}
                      {formatMetric(pick.dividend?.trailingYield, "%")} · 近5年{" "}
                      {pick.dividend?.yearsPaid ?? 0}年分红 · 派息率{" "}
                      {formatMetric(pick.dividend?.payoutRatio, "%")}
                    </p>
                    <i>
                      <b style={{ width: `${pick.dividend?.score ?? 0}%` }} />
                    </i>
                  </div>
                  <div>
                    <span>蓄势待发结构</span>
                    <strong>
                      {pick.setup?.label || "--"} · {pick.setup?.score ?? "--"}
                    </strong>
                    <p>
                      近20日 {formatSignedPercent(pick.setup?.return20)} · 距60日高点{" "}
                      {formatSignedPercent(pick.setup?.distanceToHigh60)}
                    </p>
                    <i>
                      <b style={{ width: `${pick.setup?.score ?? 0}%` }} />
                    </i>
                  </div>
                  <div>
                    <span>
                      {pick.industryRelative?.peerScope === "industry"
                        ? "行业内相对排名"
                        : "复评样本相对排名"}
                    </span>
                    <strong>
                      {pick.industryRelative?.label || "--"} ·{" "}
                      {pick.industryRelative?.score ?? "--"}
                    </strong>
                    <p>
                      {pick.industryRelative?.peerScope === "industry"
                        ? pick.industryRelative?.industry || pick.industry
                        : "同行不足，改用全样本"} · 前{" "}
                      {typeof pick.industryRelative?.percentile === "number"
                        ? Math.max(
                            1,
                            Math.round(100 - pick.industryRelative.percentile),
                          )
                        : "--"}
                      % · {pick.industryRelative?.sampleCount ?? 0} 家比较
                    </p>
                    <i>
                      <b
                        style={{
                          width: `${pick.industryRelative?.score ?? 0}%`,
                        }}
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
