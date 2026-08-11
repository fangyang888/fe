import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./RoughCopulaRqaKill.css";

const WINDOWS = [10, 20, 50, 100, 200];

const pct = (rate, count, digits = 1) =>
  count ? `${(rate * 100).toFixed(digits)}%` : "—";

const period = (value) =>
  value?.year && value?.No
    ? `${value.year}-${String(value.No).padStart(3, "0")}`
    : "—";

function ModelCard({ model, active, onSelect }) {
  const validation = model.validation;
  return (
    <button
      type="button"
      className={`tri-model-card ${active ? "is-active" : ""}`}
      style={{ "--model-color": model.color }}
      onClick={onSelect}
    >
      <header>
        <span>0{model.rank}</span>
        <i>FROZEN @ 198</i>
      </header>
      <h2>{model.name}</h2>
      <p>{model.description}</p>
      <div className="tri-model-pick">
        <span>下一期观察号</span>
        <strong>{model.prediction.display}</strong>
      </div>
      <footer>
        <span>199期后 {validation.count} 期</span>
        <b>{pct(validation.successRate, validation.count)}</b>
      </footer>
    </button>
  );
}

function BacktestTable({ models }) {
  return (
    <div className="tri-table-wrap">
      <table className="tri-table">
        <thead>
          <tr>
            <th>冻结模型</th>
            {WINDOWS.map((window) => <th key={window}>近{window}期</th>)}
            <th>200期失败</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.key} style={{ "--model-color": model.color }}>
              <th><i />{model.name}</th>
              {WINDOWS.map((window) => {
                const report = model.backtests[`backtest${window}`];
                return (
                  <td key={window}>
                    <strong>{pct(report.successRate, report.count)}</strong>
                    <small>{report.successCount}/{report.count}</small>
                  </td>
                );
              })}
              <td className="is-failures">
                {model.backtests.backtest200.failureCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskMap({ model }) {
  const items = model?.prediction?.riskMap || [];
  return (
    <div className="tri-risk-grid" role="list" aria-label={`${model?.name || "模型"} 49码风险`}>
      {items.map((item) => (
        <div
          role="listitem"
          key={item.number}
          className={item.selected ? "is-selected" : ""}
          title={`${item.display} · 风险 ${item.risk.toFixed(6)}`}
          style={{ "--risk-fill": `${Math.max(5, (1 - item.normalizedRisk) * 100)}%` }}
        >
          <i />
          <strong>{item.display}</strong>
          <span>{item.risk.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}

function Diagnostic({ model }) {
  const entries = Object.entries(model?.prediction?.diagnostic || {});
  return (
    <div className="tri-diagnostic">
      {entries.map(([key, value]) => (
        <div key={key}>
          <span>{key.replace(/([A-Z])/g, " $1")}</span>
          <strong>{typeof value === "number" ? value.toFixed(4) : value}</strong>
        </div>
      ))}
    </div>
  );
}

function ValidationPanel({ models }) {
  const hasRows = models.some((model) => model.validation.count > 0);
  return (
    <section className="tri-panel tri-live">
      <header className="tri-section-head">
        <div>
          <span>PROSPECTIVE LEDGER</span>
          <h2>199期起重新统计</h2>
        </div>
        <b>{hasRows ? "持续追加" : "等待首期"}</b>
      </header>
      <div className="tri-live-summary">
        {models.map((model) => (
          <article key={model.key} style={{ "--model-color": model.color }}>
            <span>{model.name}</span>
            <strong>{pct(model.validation.successRate, model.validation.count)}</strong>
            <small>
              {model.validation.count
                ? `${model.validation.successCount}/${model.validation.count} 成功`
                : "0期 · 尚未开奖"}
            </small>
          </article>
        ))}
      </div>
      {hasRows ? (
        <div className="tri-live-rows">
          {models.map((model) => (
            <div key={model.key}>
              <h3>{model.name}</h3>
              {model.validation.rows.slice(0, 12).map((row) => (
                <p key={`${row.year}-${row.No}`}>
                  <span>{period(row)}</span>
                  <b>{row.predictedDisplay}</b>
                  <small>{row.actualNumbers.map((n) => String(n).padStart(2, "0")).join(" · ")}</small>
                  <i className={row.success ? "is-success" : "is-failure"}>
                    {row.success ? "成功" : "失败"}
                  </i>
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="tri-empty">
          <strong>冻结基线已就绪</strong>
          <span>2026-199期开奖后，这里才产生第1个真实观察样本。</span>
        </div>
      )}
    </section>
  );
}

export default function RoughCopulaRqaKill() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeKey, setActiveKey] = useState("pawlak");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "粗糙集 · Copula · RQA 冻结观察";
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/kill/rough-copula-rqa", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
        return payload;
      })
      .then(setData)
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message || "加载失败");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const models = data?.models || [];
  const activeModel = useMemo(
    () => models.find((model) => model.shortKey === activeKey) || models[0],
    [models, activeKey],
  );

  return (
    <main className="tri-page">
      <header className="tri-nav">
        <Link to="/kill/rough-copula-rqa">TRI·OBSERVE</Link>
        <nav>
          <Link to="/kill">返回杀码</Link>
          <Link to="/kill/linear-anchor-63-first">线性锚点对照</Link>
        </nav>
      </header>

      <div className="tri-shell">
        {error ? <div className="tri-message is-error">加载失败：{error}</div> : null}
        {!error && !data ? <div className="tri-message">正在计算三套严格走步结果…</div> : null}
        {data?.status === "insufficient-history" ? <div className="tri-message">{data.message}</div> : null}

        {models.length ? (
          <>
            <section className="tri-hero">
              <div>
                <span className="tri-eyebrow">THREE INDEPENDENT DIRECTIONS · ONE FROZEN PAGE</span>
                <h1>三方向<br />冻结观察台</h1>
                <p>
                  Pawlak 粗糙集、尾部 Copula 与递归量化分析放在同一个页面独立运行。
                  历史基线锁在2026-198，199期开始重新累计真实表现。
                </p>
              </div>
              <aside>
                <span>LOCK POINT</span>
                <strong>{period(data.frozenAt)}</strong>
                <div><i />参数、窗口、特征与并列规则已锁定</div>
                <div><i />历史五窗口不再随新开奖漂移</div>
                <div><i />第199期起只追加真实观察记录</div>
                <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
                  重新读取数据
                </button>
              </aside>
            </section>

            <section className="tri-models">
              {models.map((model) => (
                <ModelCard
                  key={model.key}
                  model={model}
                  active={activeModel?.key === model.key}
                  onSelect={() => setActiveKey(model.shortKey)}
                />
              ))}
            </section>

            <section className="tri-panel tri-history">
              <header className="tri-section-head">
                <div>
                  <span>HISTORICAL BASELINE · ENDS AT 2026-198</span>
                  <h2>冻结前严格走步统计</h2>
                </div>
                <p>每个目标期只读取其之前的数据</p>
              </header>
              <BacktestTable models={models} />
            </section>

            <section className="tri-analysis" style={{ "--model-color": activeModel.color }}>
              <article className="tri-panel">
                <header className="tri-section-head">
                  <div>
                    <span>ACTIVE MODEL · CLICK CARD TO SWITCH</span>
                    <h2>{activeModel.name} · 49码风险场</h2>
                  </div>
                  <strong className="tri-active-number">{activeModel.prediction.display}</strong>
                </header>
                <RiskMap model={activeModel} />
              </article>
              <article className="tri-panel tri-detail">
                <header className="tri-section-head">
                  <div>
                    <span>FROZEN CONFIGURATION</span>
                    <h2>固定参数与当前诊断</h2>
                  </div>
                </header>
                <Diagnostic model={activeModel} />
                <div className="tri-config">
                  {Object.entries(activeModel.frozenParameters).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <b>{Array.isArray(value) ? value.join(" / ") : String(value)}</b>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <ValidationPanel models={models} />

            <aside className="tri-warning">
              <b>观察纪律</b>
              <p>{data.lockPolicy.description} 历史命中率仅用于研究比较，不代表未来保证概率。</p>
              <span>数据截至 {period(data.historyMeta.latest)} · 下一观察期 {period(data.historyMeta.nextPeriod)}</span>
            </aside>
          </>
        ) : null}
      </div>
    </main>
  );
}
