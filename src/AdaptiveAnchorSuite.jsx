import { useEffect, useState } from "react";

const COLORS = ["#f4c15d", "#61d4a8", "#79a7ff", "#d497ff"];
const WINDOWS = [10, 20, 50, 100, 200];
const pct = (data) => data?.count ? `${(data.successRate * 100).toFixed(1)}%` : "--";
const period = (value) => value?.year && value?.No
  ? `${value.year}-${String(value.No).padStart(3, "0")}`
  : "--";
const balls = (numbers) => numbers?.map((number) => String(number).padStart(2, "0")).join(" · ") || "--";

function WindowStats({ algorithm }) {
  return (
    <div className="aas-windows">
      {WINDOWS.map((window) => {
        const data = algorithm.rollingBacktests[`backtest${window}`];
        return (
          <div key={window}>
            <span>近 {window} 期</span>
            <strong>{data.successCount}<i>/{data.count}</i></strong>
            <small>{pct(data)}</small>
          </div>
        );
      })}
    </div>
  );
}

function AlgorithmCard({ algorithm, index }) {
  const color = COLORS[index];
  return (
    <section className="aas-algorithm" style={{ "--aas-accent": color }}>
      <header className="aas-algorithm-head">
        <div className="aas-algorithm-name">
          <b>{algorithm.code}</b>
          <div>
            <span>FROZEN FROM 2026-212</span>
            <h2>{algorithm.name}</h2>
            <p>{algorithm.description}</p>
          </div>
        </div>
        <div className="aas-result">
          <span>本期单杀</span>
          <strong>{algorithm.prediction.display}</strong>
          <small>采用 {algorithm.prediction.selectedBase}</small>
        </div>
      </header>

      <div className="aas-rule">
        <span>固定规则</span>
        <p>{algorithm.rule}</p>
        <small>{algorithm.prediction.reason}</small>
      </div>

      <WindowStats algorithm={algorithm} />

      <div className="aas-audit-grid">
        <article>
          <span>199～211 冻结前观察</span>
          <strong>{algorithm.observedValidation.successCount}/{algorithm.observedValidation.count}</strong>
          <small>{pct(algorithm.observedValidation)}</small>
        </article>
        <article>
          <span>212期起真实前瞻</span>
          <strong>{algorithm.forwardValidation.count ? `${algorithm.forwardValidation.successCount}/${algorithm.forwardValidation.count}` : "待开奖"}</strong>
          <small>{pct(algorithm.forwardValidation)}</small>
        </article>
        <article className="aas-base-picks">
          <span>本期三个基础锚点</span>
          <strong>K {String(algorithm.prediction.basePredictions.K).padStart(2, "0")}</strong>
          <small>Q191 {String(algorithm.prediction.basePredictions.Q191).padStart(2, "0")} · C176 {String(algorithm.prediction.basePredictions.C176).padStart(2, "0")}</small>
        </article>
      </div>

      <details className="aas-details">
        <summary>查看冻结点统计和最近20期逐期记录</summary>
        <div className="aas-frozen">
          <div><span>截至 2026-198</span><small>冻结研究样本</small></div>
          {WINDOWS.map((window) => {
            const data = algorithm.frozenBacktests[`backtest${window}`];
            return <div key={window}><span>{window}期</span><strong>{data.successCount}/{data.count}</strong><small>{pct(data)}</small></div>;
          })}
        </div>
        <div className="aas-table-wrap">
          <table>
            <thead><tr><th>期号</th><th>阶段</th><th>采用基础锚点</th><th>预测</th><th>开奖号</th><th>结果</th></tr></thead>
            <tbody>
              {algorithm.recent.rows.map((row) => {
                const phase = row.year > 2026 || (row.year === 2026 && row.No >= 212)
                  ? "真实前瞻"
                  : row.year === 2026 && row.No >= 199 ? "冻结前观察" : "研究";
                return (
                  <tr key={`${algorithm.key}-${row.year}-${row.No}`} className={row.success ? "" : "is-failure"}>
                    <td>{period(row)}</td><td>{phase}</td><td>{row.selectedBase}{row.metaChoice ? ` · ${row.metaChoice}` : ""}</td>
                    <td className="aas-highlight">{row.predictedDisplay}</td><td>{balls(row.actualNumbers)}</td>
                    <td className={row.success ? "aas-ok" : "aas-bad"}>{row.success ? "成功" : "失败"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export default function AdaptiveAnchorSuite() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kill/adaptive-anchor-suite", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`);
        return json;
      })
      .then(setData)
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message || "加载失败");
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="aas-page">
      <style>{`
        .aas-page{min-height:100vh;box-sizing:border-box;padding:78px 18px 64px;background:radial-gradient(circle at 10% 0,rgba(244,193,93,.12),transparent 34rem),radial-gradient(circle at 94% 6%,rgba(121,167,255,.1),transparent 33rem),#0a0d10;color:#edf1f5;font-family:Inter,system-ui,sans-serif}.aas-shell{width:min(1320px,100%);margin:auto}.aas-head{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;padding-bottom:24px;border-bottom:1px solid #2a3036}.aas-eyebrow{color:#f4c15d;font-size:10px;font-weight:900;letter-spacing:.18em}.aas-head h1{margin:8px 0 10px;font-size:clamp(38px,6vw,70px);line-height:.95;letter-spacing:-.055em}.aas-head p{max-width:760px;margin:0;color:#87919a;line-height:1.65}.aas-target{flex:none;min-width:150px;padding:15px 18px;border:1px solid #56482b;border-radius:14px;background:#17140e}.aas-target span,.aas-target strong{display:block}.aas-target span{color:#8f846d;font-size:9px}.aas-target strong{margin-top:4px;color:#f4c15d;font-size:22px}.aas-timeline{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 22px}.aas-timeline span{padding:7px 10px;border:1px solid #2d343a;border-radius:999px;background:#11161a;color:#8e98a1;font-size:10px}.aas-timeline span:last-child{border-color:#62502c;color:#f4c15d}.aas-message{padding:15px;border:1px solid #343d45;border-radius:13px;background:#11171c;color:#cbd2d8}.aas-error{border-color:#7f1d1d;color:#fca5a5}.aas-notice{margin-bottom:18px;padding:12px 15px;border:1px solid #755b26;border-radius:12px;background:#211a0d;color:#e8cc8d;font-size:11px}.aas-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:20px}.aas-overview article{--aas-accent:#f4c15d;padding:17px;border:1px solid color-mix(in srgb,var(--aas-accent) 27%,#292f34);border-radius:17px;background:#11161a}.aas-overview span,.aas-overview small{display:block}.aas-overview span{color:var(--aas-accent);font-size:11px;font-weight:900}.aas-overview strong{display:block;margin:10px 0 4px;font-size:34px}.aas-overview small{color:#737e87;font-size:9px}.aas-overview i{float:right;color:#cfd5da;font-size:11px;font-style:normal}.aas-algorithm{--aas-accent:#f4c15d;margin-top:16px;padding:24px;border:1px solid color-mix(in srgb,var(--aas-accent) 25%,#292f34);border-radius:22px;background:rgba(17,22,26,.96);box-shadow:0 22px 65px rgba(0,0,0,.22)}.aas-algorithm-head{display:flex;align-items:center;justify-content:space-between;gap:24px}.aas-algorithm-name{display:flex;align-items:flex-start;gap:14px}.aas-algorithm-name>b{display:grid;place-items:center;flex:none;min-width:64px;height:54px;padding:0 9px;border-radius:12px;background:var(--aas-accent);color:#0a0d10;font-size:17px}.aas-algorithm-name span{color:var(--aas-accent);font-size:9px;font-weight:900;letter-spacing:.1em}.aas-algorithm-name h2{margin:4px 0 6px;font-size:26px}.aas-algorithm-name p{margin:0;color:#7f8a93;line-height:1.5}.aas-result{flex:none;width:118px;padding:13px;border:1px solid color-mix(in srgb,var(--aas-accent) 40%,#333);border-radius:15px;text-align:center;background:color-mix(in srgb,var(--aas-accent) 8%,#0c1013)}.aas-result span,.aas-result small{display:block;color:#889198;font-size:9px}.aas-result strong{display:block;margin:3px;color:var(--aas-accent);font-size:38px}.aas-rule{margin-top:16px;padding:13px 15px;border-left:3px solid var(--aas-accent);border-radius:0 10px 10px 0;background:#0c1115}.aas-rule span{color:#65717a;font-size:9px}.aas-rule p{margin:4px 0;color:#d9dee2;font-size:12px}.aas-rule small{color:#79848c;font-size:10px}.aas-windows{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:13px}.aas-windows>div{padding:14px;border:1px solid #273038;border-radius:12px;background:#0d1216}.aas-windows span,.aas-windows small{display:block}.aas-windows span{color:#727d86;font-size:9px}.aas-windows strong{display:block;margin:6px 0;color:var(--aas-accent);font-size:26px}.aas-windows strong i{color:#75808a;font-size:12px;font-style:normal}.aas-windows small{color:#a5adb4;font-size:10px}.aas-audit-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.aas-audit-grid article{padding:13px;border:1px solid #273038;border-radius:12px;background:#0d1216}.aas-audit-grid span,.aas-audit-grid small{display:block;color:#747f87;font-size:9px}.aas-audit-grid strong{display:block;margin:5px 0;font-size:18px}.aas-base-picks strong{color:var(--aas-accent)}.aas-details{margin-top:12px;border:1px solid #273038;border-radius:12px;overflow:hidden;background:#0d1216}.aas-details summary{padding:13px 15px;color:#a8b0b7;font-size:11px;cursor:pointer}.aas-details[open] summary{border-bottom:1px solid #273038}.aas-frozen{display:grid;grid-template-columns:1.2fr repeat(5,1fr);gap:7px;padding:12px}.aas-frozen>div{padding:10px;border-radius:9px;background:#131a1f}.aas-frozen span,.aas-frozen small{display:block;color:#717c84;font-size:8px}.aas-frozen strong{display:block;margin:3px 0;color:#dfe4e8;font-size:15px}.aas-table-wrap{overflow-x:auto;padding:0 12px 12px}.aas-table-wrap table{width:100%;min-width:840px;border-collapse:collapse;font-size:10px}.aas-table-wrap th,.aas-table-wrap td{padding:9px 8px;border-bottom:1px solid #222b32;text-align:left;white-space:nowrap}.aas-table-wrap th{color:#66727b}.aas-table-wrap tr.is-failure{background:#251316}.aas-highlight{color:var(--aas-accent);font-weight:900}.aas-ok{color:#69d49f}.aas-bad{color:#fb7185}.aas-footer{margin-top:18px;color:#59646d;font-size:9px;text-align:right}@media(max-width:900px){.aas-overview{grid-template-columns:1fr 1fr}.aas-windows{grid-template-columns:repeat(3,1fr)}.aas-frozen{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.aas-page{padding:72px 10px 40px}.aas-head,.aas-algorithm-head{display:grid;align-items:start}.aas-target{min-width:0}.aas-algorithm{padding:15px}.aas-algorithm-name>b{min-width:54px}.aas-result{box-sizing:border-box;width:100%}.aas-windows{grid-template-columns:1fr 1fr}.aas-audit-grid{grid-template-columns:1fr}.aas-frozen{grid-template-columns:1fr 1fr}}
      `}</style>
      <div className="aas-shell">
        <header className="aas-head">
          <div><span className="aas-eyebrow">FOUR LOCKED ALGORITHMS</span><h1>四算法实战观察</h1><p>K、R50、R20/50、M10双层择优使用同一批历史数据逐期回测。规则统一从2026-212起冻结，不用后续结果改参数。</p></div>
          {data?.target && <div className="aas-target"><span>当前目标期</span><strong>{period(data.target)}</strong></div>}
        </header>
        <div className="aas-timeline"><span>研究截止 2026-198</span><span>冻结前观察 199～211</span><span>真实冻结 212期起</span></div>
        {error && <div className="aas-message aas-error">加载失败：{error}</div>}
        {!error && !data && <div className="aas-message">正在逐期计算四个算法…</div>}
        {data?.status === "insufficient-history" && <div className="aas-message">{data.message}</div>}
        {data?.integrity && !data.integrity.complete && <div className="aas-notice">数据提示：{data.integrity.message}</div>}
        {data?.algorithms && <div className="aas-overview">{data.algorithms.map((algorithm, index) => <article key={algorithm.key} style={{ "--aas-accent": COLORS[index] }}><span>{algorithm.name}<i>采用 {algorithm.prediction.selectedBase}</i></span><strong>{algorithm.prediction.display}</strong><small>近200期 {algorithm.rollingBacktests.backtest200.successCount}/{algorithm.rollingBacktests.backtest200.count} · {pct(algorithm.rollingBacktests.backtest200)}</small></article>)}</div>}
        {data?.algorithms?.map((algorithm, index) => <AlgorithmCard key={algorithm.key} algorithm={algorithm} index={index} />)}
        {data?.generatedAt && <div className="aas-footer">统计生成：{new Date(data.generatedAt).toLocaleString("zh-CN")}</div>}
      </div>
    </main>
  );
}
