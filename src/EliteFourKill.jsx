import { useEffect, useState } from "react";

const COLORS = ["#f59e0b", "#a78bfa", "#34d399", "#38bdf8"];
const pct = (value, count) =>
  count > 0 && typeof value === "number"
    ? `${(value * 100).toFixed(1)}%`
    : "--";
const period = (value) =>
  value?.year && value?.No
    ? `${value.year}-${String(value.No).padStart(3, "0")}`
    : "--";

function Metric({ label, value, accent = false }) {
  return (
    <div className={`ef-metric${accent ? " is-accent" : ""}`}>
      <span>{label}</span>
      <strong>{pct(value?.successRate, value?.count)}</strong>
      <small>
        {value?.count
          ? `${value.successCount}/${value.count} 成功`
          : "暂无样本"}
      </small>
    </div>
  );
}

function ComparisonStrip({ models }) {
  return (
    <section className="ef-comparison">
      {models.map((model, index) => (
        <article
          key={model.key}
          style={{ "--ef-accent": COLORS[index % COLORS.length] }}
        >
          <div className="ef-compare-head">
            <span>{model.shortName}</span>
            <b>{model.prediction.display}</b>
          </div>
          <div className="ef-compare-stats">
            <div>
              <small>冻结500期</small>
              <strong>
                {pct(
                  model.frozenBacktests.backtest500.successRate,
                  model.frozenBacktests.backtest500.count,
                )}
              </strong>
            </div>
            <div>
              <small>199期后</small>
              <strong>
                {pct(model.validation.successRate, model.validation.count)}
              </strong>
            </div>
          </div>
          <div className="ef-mini-segments">
            {model.segments.map((segment) => (
              <i key={segment.index} title={`${segment.successCount}/100`}>
                {segment.successCount}
              </i>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function ModelSection({ model, index }) {
  const color = COLORS[index % COLORS.length];
  return (
    <section className="ef-module" style={{ "--ef-accent": color }}>
      <header className="ef-module-head">
        <div className="ef-title-group">
          <div className="ef-code">{model.code}</div>
          <div>
            <span className="ef-kicker">FIXED FORMULA · WALK-FORWARD</span>
            <h2>{model.name}</h2>
            <p>{model.description}</p>
          </div>
        </div>
        <code>{model.formula}</code>
      </header>

      <div className="ef-hero-grid">
        <article className="ef-prediction-card">
          <span className="ef-card-label">当前目标单杀</span>
          <div className="ef-anchor-flow">
            {model.prediction.anchors.map((anchor) => (
              <div className="ef-anchor" key={anchor.label}>
                <small>{anchor.label}</small>
                <strong>{anchor.display}</strong>
                <em>{period(anchor.source)}</em>
              </div>
            ))}
            <span className="ef-arrow">→</span>
            <div className="ef-result-ball">
              <small>单杀</small>
              <strong>{model.prediction.display}</strong>
            </div>
          </div>
          <p>{model.prediction.reason}</p>
          <div className="ef-formula-line">{model.prediction.formula}</div>
          <div className="ef-wrap-line">{model.prediction.wrapFormula}</div>
        </article>

        <div className="ef-metrics">
          <Metric
            label="冻结500期"
            value={model.frozenBacktests.backtest500}
          />
          <Metric
            label="冻结200期"
            value={model.frozenBacktests.backtest200}
          />
          <Metric label="冻结100期" value={model.frozenBacktests.backtest100} />
          <Metric label="199期起实战" value={model.validation} accent />
        </div>
      </div>

      <div className="ef-segment-card">
        <div className="ef-segment-title">
          <div>
            <span className="ef-card-label">五段100期稳定性</span>
            <h3>每个数字代表该100期内成功次数</h3>
          </div>
          <small>随机单杀理论基准 85.7%</small>
        </div>
        <div className="ef-segments">
          {model.segments.map((segment) => (
            <div key={segment.index}>
              <span>{segment.label}</span>
              <strong>{segment.successCount}</strong>
              <small>
                {period(segment.start)} ～ {period(segment.end)}
              </small>
              <i>{pct(segment.successRate, segment.count)}</i>
            </div>
          ))}
        </div>
      </div>

      <article className="ef-table-card">
        <div className="ef-table-head">
          <div>
            <span className="ef-card-label">逐期审计</span>
            <h3>最近20条历史记录</h3>
          </div>
          <small>
            原始冻结点 {period(model.originalFrozenAt)} · 统一比较截止点 {period(model.comparisonFrozenAt)}
          </small>
        </div>
        <div className="ef-table-wrap">
          <table>
            <thead>
              <tr>
                <th>开奖期</th>
                <th>锚点来源</th>
                <th>公式结果</th>
                <th>实际开奖号</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {model.recent.rows.map((row) => (
                <tr
                  key={`${model.key}-${row.year}-${row.No}`}
                  className={row.success ? "" : "is-failure"}
                >
                  <td>{period(row)}</td>
                  <td>
                    {row.anchors
                      .map(
                        (anchor) =>
                          `${anchor.display} · ${period(anchor)}`,
                      )
                      .join(" / ")}
                  </td>
                  <td className="ef-predicted">{row.predictedDisplay}</td>
                  <td>{row.actualNumbers.map((n) => String(n).padStart(2, "0")).join(" · ")}</td>
                  <td className={row.success ? "ef-ok" : "ef-bad"}>
                    {row.success ? "成功" : "失败"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default function EliteFourKill() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kill/elite-four", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.message || `HTTP ${response.status}`);
        }
        return json;
      })
      .then(setData)
      .catch(
        (reason) =>
          reason.name !== "AbortError" &&
          setError(reason.message || "加载失败"),
      );
    return () => controller.abort();
  }, []);

  return (
    <main className="ef-page">
      <style>{`
        .ef-page{min-height:100vh;box-sizing:border-box;padding:76px 18px 60px;color:#e5edf7;background:radial-gradient(circle at 12% 0,rgba(245,158,11,.12),transparent 30rem),radial-gradient(circle at 91% 5%,rgba(56,189,248,.13),transparent 34rem),#07111b;font-family:Inter,system-ui,sans-serif}.ef-shell{width:min(1340px,100%);margin:0 auto}.ef-page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;margin-bottom:20px}.ef-kicker{color:var(--ef-accent,#38bdf8);font-size:10px;font-weight:950;letter-spacing:.14em}.ef-page-head h1{margin:7px 0 10px;font-size:clamp(38px,6vw,70px);line-height:.95;letter-spacing:-.045em}.ef-page-head p{max-width:850px;margin:0;color:#91a4b8;line-height:1.7}.ef-target{flex:none;padding:13px 16px;border:1px solid #28516c;border-radius:14px;background:#0b2232;text-align:right}.ef-target span,.ef-target strong{display:block}.ef-target span{color:#7dd3fc;font-size:10px}.ef-target strong{margin-top:3px;font-size:20px}.ef-notice,.ef-message{margin:14px 0;padding:14px 16px;border:1px solid #92400e;border-radius:13px;background:rgba(120,53,15,.2);color:#fed7aa}.ef-message{border-color:#24384a;background:#0d1b29;color:#cbd5e1}.ef-error{color:#fda4af}.ef-comparison{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin:18px 0 26px}.ef-comparison>article{padding:16px;border:1px solid color-mix(in srgb,var(--ef-accent) 32%,#23384b);border-radius:17px;background:rgba(12,27,41,.9)}.ef-compare-head{display:flex;align-items:center;justify-content:space-between}.ef-compare-head span{color:var(--ef-accent);font-size:12px;font-weight:950}.ef-compare-head b{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--ef-accent);color:#07111b;font-size:20px}.ef-compare-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.ef-compare-stats small,.ef-compare-stats strong{display:block}.ef-compare-stats small{color:#61778c;font-size:9px}.ef-compare-stats strong{margin-top:4px;font-size:17px}.ef-mini-segments{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:12px}.ef-mini-segments i{padding:5px 0;border-radius:6px;background:color-mix(in srgb,var(--ef-accent) 12%,#0a1825);color:var(--ef-accent);font-size:10px;font-style:normal;font-weight:900;text-align:center}.ef-module{--ef-accent:#38bdf8;margin-top:24px;padding:24px;border:1px solid color-mix(in srgb,var(--ef-accent) 30%,#203547);border-radius:24px;background:rgba(11,24,37,.92);box-shadow:0 25px 70px rgba(0,0,0,.22)}.ef-module-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:18px}.ef-title-group{display:flex;gap:14px}.ef-code{display:grid;place-items:center;flex:none;min-width:48px;height:48px;padding:0 6px;border-radius:14px;background:var(--ef-accent);color:#07111b;font-size:17px;font-weight:950}.ef-module-head h2{margin:6px 0 8px;font-size:27px}.ef-module-head p{margin:0;color:#8499ad;line-height:1.6}.ef-module-head code{flex:none;max-width:42%;padding:10px 13px;border:1px solid color-mix(in srgb,var(--ef-accent) 34%,transparent);border-radius:11px;background:color-mix(in srgb,var(--ef-accent) 8%,transparent);color:var(--ef-accent);font-size:13px;font-weight:850}.ef-hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:13px}.ef-prediction-card,.ef-metric,.ef-segment-card,.ef-table-card{border:1px solid #1e3345;border-radius:17px;background:rgba(3,12,21,.52)}.ef-prediction-card{padding:19px}.ef-card-label{color:#637b90;font-size:10px;font-weight:900;letter-spacing:.06em}.ef-anchor-flow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:15px 0}.ef-anchor{display:grid;place-items:center;min-width:93px;min-height:82px;padding:7px;border:1px dashed color-mix(in srgb,var(--ef-accent) 45%,#31465a);border-radius:14px;background:#102131}.ef-anchor small{color:#8499ad;font-size:8px}.ef-anchor strong{margin:4px 0;color:var(--ef-accent);font-size:25px}.ef-anchor em{color:#526b80;font-size:8px;font-style:normal}.ef-arrow{color:var(--ef-accent);font-size:25px;font-weight:950}.ef-result-ball{display:grid;place-items:center;width:92px;height:92px;border-radius:50%;background:var(--ef-accent);color:#07111b;box-shadow:0 16px 35px color-mix(in srgb,var(--ef-accent) 22%,transparent)}.ef-result-ball small{font-size:9px;font-weight:900}.ef-result-ball strong{font-size:34px}.ef-prediction-card>p{margin:0;color:#b8c6d4;line-height:1.65}.ef-formula-line,.ef-wrap-line{margin-top:10px;padding:8px 10px;border-radius:9px;background:#0b1a28;color:#d8e5f1;font-size:11px}.ef-wrap-line{color:#6f879c}.ef-metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ef-metric{padding:15px}.ef-metric span,.ef-metric small{display:block;color:#61778c}.ef-metric strong{display:block;margin:5px 0;color:#dce8f3;font-size:27px}.ef-metric.is-accent{border-color:color-mix(in srgb,var(--ef-accent) 52%,#1e3345)}.ef-metric.is-accent strong{color:var(--ef-accent)}.ef-segment-card{margin-top:13px;padding:18px}.ef-segment-title,.ef-table-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.ef-segment-title h3,.ef-table-head h3{margin:4px 0 0;font-size:15px}.ef-segment-title>small,.ef-table-head>small{color:#60788d;font-size:10px}.ef-segments{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:13px}.ef-segments>div{padding:13px;border:1px solid #1d3447;border-radius:12px;background:#0a1825}.ef-segments span,.ef-segments small,.ef-segments i{display:block}.ef-segments span{color:#6d8498;font-size:9px}.ef-segments strong{display:block;margin:4px 0;color:var(--ef-accent);font-size:29px}.ef-segments small{color:#526a7f;font-size:8px;line-height:1.45}.ef-segments i{margin-top:6px;color:#a9bac9;font-size:10px;font-style:normal;font-weight:900}.ef-table-card{margin-top:13px;padding:18px}.ef-table-wrap{margin-top:12px;overflow-x:auto}.ef-table-card table{width:100%;min-width:940px;border-collapse:collapse;font-size:10px}.ef-table-card th,.ef-table-card td{padding:9px 8px;border-bottom:1px solid #172b3c;text-align:left;white-space:nowrap}.ef-table-card th{color:#60788d}.ef-table-card tr.is-failure{background:rgba(127,29,29,.2)}.ef-predicted{color:var(--ef-accent);font-weight:950}.ef-ok{color:#86efac;font-weight:900}.ef-bad{color:#fb7185;font-weight:900}@media(max-width:980px){.ef-page-head,.ef-module-head{display:grid;align-items:start}.ef-module-head code{max-width:none}.ef-comparison{grid-template-columns:1fr 1fr}.ef-hero-grid{grid-template-columns:1fr}.ef-segments{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.ef-page{padding:70px 10px 36px}.ef-comparison,.ef-metrics{grid-template-columns:1fr 1fr}.ef-module{padding:15px}.ef-segments{grid-template-columns:1fr 1fr}.ef-segment-title,.ef-table-head{display:grid;align-items:start}.ef-target{text-align:left}.ef-result-ball{width:76px;height:76px}.ef-result-ball strong{font-size:28px}}
      `}</style>
      <div className="ef-shell">
        <header className="ef-page-head">
          <div>
            <span className="ef-kicker">ELITE FOUR · FROZEN COMPARISON</span>
            <h1>四算法实战对照</h1>
            <p>
              新F、17期首位二次、双时间尺度、63期首位线性统一比较。冻结500期固定拆成五个100期分段，第199期以后单独累计实战成绩。
            </p>
          </div>
          {data?.target && (
            <div className="ef-target">
              <span>当前目标</span>
              <strong>{period(data.target)}</strong>
            </div>
          )}
        </header>

        {error && <div className="ef-message ef-error">加载失败：{error}</div>}
        {!error && !data && <div className="ef-message">正在计算四算法冻结统计…</div>}
        {data?.status === "insufficient-history" && (
          <div className="ef-message">{data.message}</div>
        )}
        {data?.integrity && !data.integrity.complete && (
          <div className="ef-notice">
            <strong>数据完整性提示：</strong> {data.integrity.message}
            {data.integrity.gaps.map((gap) => (
              <span key={`${gap.year}-${gap.from}`}> 缺少 {gap.year}-{String(gap.from).padStart(3, "0")}{gap.to > gap.from ? `～${String(gap.to).padStart(3, "0")}` : ""}。</span>
            ))}
          </div>
        )}
        {data?.models && <ComparisonStrip models={data.models} />}
        {data?.models?.map((model, index) => (
          <ModelSection key={model.key} model={model} index={index} />
        ))}
      </div>
    </main>
  );
}
