import { useEffect, useState } from "react";

const COLORS = ["#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#fb7185"];
const pct = (value, count) =>
  count > 0 && typeof value === "number"
    ? `${(value * 100).toFixed(1)}%`
    : "--";
const period = (year, no) =>
  year && no ? `${year}-${String(no).padStart(3, "0")}` : "--";

function Metric({ label, data, accent = false }) {
  return (
    <div className={`gas-metric${accent ? " accent" : ""}`}>
      <span>{label}</span>
      <strong>{pct(data?.successRate, data?.count)}</strong>
      <small>
        {data?.count ? `${data.successCount}/${data.count} 成功` : "暂无样本"}
      </small>
    </div>
  );
}

function FormulaModule({ model, color }) {
  const prediction = model.prediction;
  const bt = model.backtests;
  return (
    <section className="gas-module" style={{ "--gas-accent": color }}>
      <header className="gas-module-head">
        <div className="gas-title-row">
          <div className="gas-code">{model.code}</div>
          <div>
            <div className="gas-kicker">FROZEN · 2026-199 起独立前瞻</div>
            <h2>{model.name}</h2>
            <p>{model.description}</p>
          </div>
        </div>
        <code>{model.formula}</code>
      </header>

      <div className="gas-hero">
        <article className="gas-prediction">
          <div className="gas-anchor-row">
            <div className="gas-anchor">
              <span>x</span>
              <strong>{prediction.xDisplay}</strong>
              <small>{prediction.primary.label}</small>
            </div>
            <div className="gas-anchor gate">
              <span>
                {prediction.gate.kind === "previous-period" ? "q" : "g"}
              </span>
              <strong>{prediction.gate.value}</strong>
              <small>
                mod {prediction.gate.modulus} = {prediction.gate.remainder}
              </small>
            </div>
            <span className="gas-arrow">→</span>
            <div className="gas-result">
              <span>单杀</span>
              <strong>{prediction.display}</strong>
            </div>
          </div>
          <p>{prediction.reason}</p>
          <div className="gas-tags">
            <span>
              x锚点：
              {period(
                prediction.primary.source.year,
                prediction.primary.source.No,
              )}
            </span>
            <span>
              门控源：
              {period(prediction.gate.source.year, prediction.gate.source.No)}
            </span>
            <span>分支偏移：+{prediction.gate.offset}</span>
            <span>{prediction.wrapFormula}</span>
          </div>
        </article>

        <div className="gas-metrics">
          <Metric label="近20期" data={bt.backtest20} />
          <Metric label="近50期" data={bt.backtest50} />
          <Metric label="近100期" data={bt.backtest100} />
          <Metric label="近200期" data={bt.backtest200} />
          <Metric label="199期起真实前瞻" data={model.validation} accent />
        </div>
      </div>

      <div className="gas-segments">
        {model.segments.map((segment) => (
          <div key={segment.index}>
            <span>
              {segment.label} · {period(segment.start?.year, segment.start?.No)}
              ～{period(segment.end?.year, segment.end?.No)}
            </span>
            <strong>{pct(segment.successRate, segment.count)}</strong>
            <small>
              {segment.successCount}/{segment.count}
            </small>
          </div>
        ))}
      </div>

      <div className="gas-detail-grid">
        <article className="gas-calculation">
          <h3>本期完整计算</h3>
          <div>
            <span>{prediction.primary.label} · x</span>
            <strong>{prediction.x}</strong>
          </div>
          <div>
            <span>{prediction.gate.label}</span>
            <strong>{prediction.gate.value}</strong>
          </div>
          <div>
            <span>门控分支</span>
            <strong>
              余数 {prediction.gate.remainder} → 偏移 {prediction.gate.offset}
            </strong>
          </div>
          <div>
            <span>固定公式</span>
            <strong>{prediction.formula}</strong>
          </div>
          <div>
            <span>循环回绕</span>
            <strong>{prediction.wrapFormula}</strong>
          </div>
        </article>

        <article className="gas-table-card">
          <h3>近20期逐期核验</h3>
          <div className="gas-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>开奖期</th>
                  <th>x锚点</th>
                  <th>门控值</th>
                  <th>分支</th>
                  <th>预测</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {bt.backtest20.rows.map((row) => (
                  <tr key={`${model.key}-${row.year}-${row.No}`}>
                    <td>{period(row.year, row.No)}</td>
                    <td>
                      {row.primary.display} ·{" "}
                      {period(row.primary.year, row.primary.No)}
                    </td>
                    <td>
                      {row.gate.value} · {period(row.gate.year, row.gate.No)}
                    </td>
                    <td>
                      余{row.gate.remainder} / +{row.gate.offset}
                    </td>
                    <td>{row.predictedDisplay}</td>
                    <td className={row.success ? "gas-ok" : "gas-bad"}>
                      {row.success ? "成功" : "失败"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}

export default function GatedAnchorSuite() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kill/gated-anchor-suite", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok)
          throw new Error(json.message || `HTTP ${response.status}`);
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
    <main className="gas-page">
      <style>{`
    .gas-page{min-height:100vh;padding:72px 18px 56px;box-sizing:border-box;color:#f8fafc;background:radial-gradient(circle at 8% 0,rgba(245,158,11,.13),transparent 29%),radial-gradient(circle at 92% 7%,rgba(56,189,248,.13),transparent 30%),#081018;font-family:Inter,system-ui,sans-serif}.gas-shell{width:min(1320px,100%);margin:0 auto}.gas-page-head{margin-bottom:28px}.gas-kicker{color:var(--gas-accent,#38bdf8);font-size:11px;font-weight:900;letter-spacing:.14em}.gas-page-head h1{margin:8px 0 12px;font-size:clamp(34px,5vw,60px);line-height:1}.gas-page-head p,.gas-module-head p{max-width:900px;margin:0;color:#94a3b8;line-height:1.7}.gas-freeze-note{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}.gas-freeze-note span{padding:7px 10px;border:1px solid #1e3a4d;border-radius:999px;color:#bae6fd;background:#0c2637;font-size:11px}.gas-message{padding:24px;border:1px solid #1e293b;border-radius:18px;background:#0f172a}.gas-error{color:#fda4af}.gas-module{--gas-accent:#38bdf8;margin-top:22px;padding:24px;border:1px solid color-mix(in srgb,var(--gas-accent) 30%,#1e293b);border-radius:24px;background:rgba(15,23,42,.88);box-shadow:0 24px 70px rgba(0,0,0,.24)}.gas-module-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:18px}.gas-title-row{display:flex;gap:14px}.gas-code{display:grid;place-items:center;flex:none;width:42px;height:42px;border-radius:13px;color:#071018;background:var(--gas-accent);font-size:20px;font-weight:950}.gas-module-head h2{margin:7px 0 9px;font-size:27px}.gas-module-head code{flex:none;max-width:48%;padding:10px 13px;border:1px solid color-mix(in srgb,var(--gas-accent) 36%,transparent);border-radius:12px;color:var(--gas-accent);background:color-mix(in srgb,var(--gas-accent) 8%,transparent);font-weight:800;line-height:1.55;white-space:normal}.gas-hero{display:grid;grid-template-columns:1.05fr .95fr;gap:14px}.gas-prediction,.gas-metric,.gas-calculation,.gas-table-card{border:1px solid #1e293b;border-radius:17px;background:rgba(2,6,23,.48)}.gas-prediction{padding:20px}.gas-anchor-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.gas-anchor,.gas-result{display:grid;place-items:center;width:82px;height:82px;border-radius:50%;background:#172033}.gas-anchor.gate{border:1px dashed color-mix(in srgb,var(--gas-accent) 55%,#334155)}.gas-anchor span,.gas-result span{color:#94a3b8;font-size:10px;font-weight:900}.gas-anchor strong,.gas-result strong{font-size:24px;line-height:1}.gas-anchor small{max-width:72px;color:#64748b;font-size:8px;text-align:center}.gas-result{color:#071018;background:var(--gas-accent);box-shadow:0 12px 34px color-mix(in srgb,var(--gas-accent) 30%,transparent)}.gas-result span{color:#071018}.gas-arrow{color:var(--gas-accent);font-size:26px;font-weight:900}.gas-prediction>p{margin:16px 0 0;color:#cbd5e1;line-height:1.65}.gas-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:13px}.gas-tags span{padding:5px 8px;border-radius:999px;color:#bae6fd;background:#0c2637;font-size:10px}.gas-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gas-metric{padding:14px}.gas-metric span,.gas-metric small{display:block;color:#64748b}.gas-metric strong{display:block;margin:5px 0 3px;font-size:25px}.gas-metric.accent{grid-column:span 2;border-color:color-mix(in srgb,var(--gas-accent) 48%,#1e293b)}.gas-metric.accent strong{color:var(--gas-accent)}.gas-segments{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.gas-segments>div{padding:12px;border:1px solid #1e293b;border-radius:14px;background:rgba(2,6,23,.4)}.gas-segments span,.gas-segments small{display:block;color:#64748b;font-size:9px}.gas-segments strong{display:block;margin:5px 0 2px;color:#e2e8f0;font-size:18px}.gas-detail-grid{display:grid;grid-template-columns:.7fr 1.3fr;gap:14px;margin-top:14px}.gas-calculation,.gas-table-card{padding:18px}.gas-calculation h3,.gas-table-card h3{margin:0 0 12px;font-size:15px}.gas-calculation div{padding:8px 0;border-bottom:1px solid #172033}.gas-calculation span{display:block;color:#64748b;font-size:10px}.gas-calculation strong{display:block;margin-top:4px;font-size:13px;line-height:1.5}.gas-table-wrap{overflow-x:auto}.gas-table-card table{width:100%;min-width:790px;border-collapse:collapse;font-size:11px}.gas-table-card th,.gas-table-card td{padding:8px 7px;border-bottom:1px solid #172033;text-align:left;white-space:nowrap}.gas-table-card th{color:#64748b}.gas-ok{color:#86efac;font-weight:900}.gas-bad{color:#fb7185;font-weight:900}@media(max-width:900px){.gas-module-head,.gas-hero,.gas-detail-grid{display:grid;grid-template-columns:1fr}.gas-module-head code{max-width:none}.gas-segments{grid-template-columns:repeat(2,minmax(0,1fr))}.gas-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.gas-metric.accent{grid-column:span 2}}@media(max-width:560px){.gas-page{padding-inline:10px}.gas-module{padding:15px}.gas-title-row{align-items:flex-start}.gas-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.gas-segments{grid-template-columns:1fr 1fr}.gas-anchor,.gas-result{width:68px;height:68px}.gas-anchor strong,.gas-result strong{font-size:20px}}
  `}</style>
      <div className="gas-shell">
        <header className="gas-page-head">
          <div className="gas-kicker">
            A～E GATED FORMULAS · 200-PERIOD RESEARCH
          </div>
          <h1>门控锚点五公式统计</h1>
          <p>
            A～E
            五个固定映射同时展示，最近200期仅作为研究样本；公式以2026年第198期为截止点冻结，第199期起只累计真实前瞻结果，不动态换公式。
          </p>
          <div className="gas-freeze-note">
            <span>冻结点 2026-198</span>
            <span>真实前瞻 2026-199 起</span>
            {data?.target && (
              <span>当前目标 {period(data.target.year, data.target.No)}</span>
            )}
          </div>
        </header>
        {error && (
          <div className="gas-message gas-error">加载失败：{error}</div>
        )}
        {!error && !data && (
          <div className="gas-message">正在计算五个固定模块的200期统计…</div>
        )}
        {data?.status === "insufficient-history" && (
          <div className="gas-message">{data.message}</div>
        )}
        {data?.models?.map((model, index) => (
          <FormulaModule
            key={model.key}
            model={model}
            color={COLORS[index % COLORS.length]}
          />
        ))}
      </div>
    </main>
  );
}
