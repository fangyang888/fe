import { useEffect, useState } from "react";

const COLORS = ["#f59e0b", "#22c55e", "#a78bfa", "#38bdf8"];
const pct = (data) =>
  data?.count ? `${(data.successRate * 100).toFixed(1)}%` : "--";
const specialPct = (data) =>
  data?.count && typeof data.specialCodeMissRate === "number" ? `${(data.specialCodeMissRate * 100).toFixed(1)}%` : "--";
const period = (value) =>
  value?.year && value?.No
    ? `${value.year}-${String(value.No).padStart(3, "0")}`
    : "--";

function Stat({ label, data, accent = false }) {
  return (
    <div className={`sas-stat${accent ? " is-accent" : ""}`}>
      <span>{label}</span>
      <strong>{pct(data)}</strong>
      <small>
        {data?.count ? `${data.successCount}/${data.count} 期未在7码中出现` : "等待开奖"}
      </small>
      <em>特别码未出现 {specialPct(data)}{data?.count ? ` · ${data.specialCodeMissCount ?? "--"}/${data.count}` : ""}</em>
    </div>
  );
}

function Model({ model, index }) {
  const color = COLORS[index % COLORS.length];
  return (
    <section className="sas-model" style={{ "--sas-accent": color }}>
      <header className="sas-model-head">
        <div className="sas-title">
          <b>{model.code}</b>
          <div>
            <span className="sas-kicker">SELECTED ANCHOR · LOCKED AT 211</span>
            <h2>{model.name}</h2>
            <p>{model.description}</p>
          </div>
        </div>
        <code>{model.formula}</code>
      </header>

      <div className="sas-main-grid">
        <article className="sas-pick-card">
          <span className="sas-label">当前完整计算</span>
          <div className="sas-pick-flow">
            <div className="sas-anchor-ball">
              <small>{model.lag}期前第{model.position}位</small>
              <strong>{model.prediction.anchorDisplay}</strong>
              <em>{period(model.prediction.source)}</em>
            </div>
            <span>→</span>
            <div className="sas-result-ball">
              <small>单杀</small>
              <strong>{model.prediction.display}</strong>
            </div>
          </div>
          <p>{model.prediction.reason}</p>
          <div className="sas-formula">{model.prediction.formula}</div>
          <div className="sas-wrap">{model.prediction.wrapFormula}</div>
        </article>

        <div className="sas-stats">
          <Stat label="冻结500期" data={model.frozenBacktests.backtest500} />
          <Stat label="冻结200期" data={model.frozenBacktests.backtest200} />
          <Stat label="199～211观察" data={model.observedValidation} accent />
          <Stat label="212期起新前瞻" data={model.forwardValidation} accent />
        </div>
      </div>

      <article className="sas-segment-card">
        <div className="sas-section-head">
          <div>
            <span className="sas-label">FIVE × 100 PERIODS</span>
            <h3>五段100期稳定性</h3>
          </div>
          <small>数字表示每100期成功次数 · 随机基准85.7</small>
        </div>
        <div className="sas-segments">
          {model.segments.map((segment) => (
            <div key={segment.index}>
              <span>{segment.label}</span>
              <strong>{segment.successCount}</strong>
              <small>{period(segment.start)} ～ {period(segment.end)}</small>
              <i>{pct(segment)}</i>
            </div>
          ))}
        </div>
      </article>

      <article className="sas-table-card">
        <div className="sas-section-head">
          <div>
            <span className="sas-label">LATEST AUDIT</span>
            <h3>最近20期逐期核验</h3>
          </div>
          <small>199～211为选定前观察；212起才是选定后的新前瞻</small>
        </div>
        <div className="sas-table-wrap">
          <table>
            <thead>
              <tr>
                <th>开奖期</th>
                <th>阶段</th>
                <th>锚点</th>
                <th>锚点来源</th>
                <th>预测</th>
                <th>实际开奖号</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {model.recent.rows.map((row) => {
                const phase =
                  row.year > 2026 || (row.year === 2026 && row.No >= 212)
                    ? "新前瞻"
                    : row.year === 2026 && row.No >= 199
                      ? "观察"
                      : "研究";
                return (
                  <tr
                    key={`${model.key}-${row.year}-${row.No}`}
                    className={row.success ? "" : "is-failure"}
                  >
                    <td>{period(row)}</td>
                    <td><span className={`sas-phase is-${phase}`}>{phase}</span></td>
                    <td>{row.anchorDisplay}</td>
                    <td>{period({ year: row.anchorYear, No: row.anchorNo })}</td>
                    <td className="sas-predicted">{row.predictedDisplay}</td>
                    <td>{row.actualNumbers.map((n) => String(n).padStart(2, "0")).join(" · ")}</td>
                    <td className={row.success ? "sas-ok" : "sas-bad"}>
                      {row.success ? "成功" : "失败"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default function SelectedAnchorSuite() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kill/selected-anchor-suite", {
      cache: "no-store",
      signal: controller.signal,
    })
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
    <main className="sas-page">
      <style>{`
        .sas-page{min-height:100vh;box-sizing:border-box;padding:76px 18px 60px;color:#edf4fb;background:radial-gradient(circle at 9% 0,rgba(245,158,11,.13),transparent 30rem),radial-gradient(circle at 92% 4%,rgba(167,139,250,.13),transparent 34rem),#071018;font-family:Inter,system-ui,sans-serif}.sas-shell{width:min(1340px,100%);margin:0 auto}.sas-page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:28px}.sas-kicker{color:var(--sas-accent,#f59e0b);font-size:10px;font-weight:950;letter-spacing:.15em}.sas-page-head h1{margin:8px 0 11px;font-size:clamp(40px,6vw,72px);line-height:.94;letter-spacing:-.05em}.sas-page-head p{max-width:870px;margin:0;color:#8da1b4;line-height:1.7}.sas-target{flex:none;padding:13px 17px;border:1px solid #6b4d16;border-radius:14px;background:#211707}.sas-target span,.sas-target strong{display:block}.sas-target span{color:#fbbf24;font-size:10px}.sas-target strong{margin-top:3px;font-size:21px}.sas-timeline{display:flex;gap:7px;flex-wrap:wrap;margin:17px 0}.sas-timeline span{padding:7px 10px;border:1px solid #263a4c;border-radius:999px;background:#0c1b28;color:#9fb2c4;font-size:10px}.sas-timeline span:last-child{border-color:#6b4d16;color:#fbbf24}.sas-notice,.sas-message{margin:13px 0;padding:14px 16px;border:1px solid #92400e;border-radius:13px;background:rgba(120,53,15,.2);color:#fed7aa}.sas-message{border-color:#263a4c;background:#0d1b29;color:#cbd5e1}.sas-error{color:#fda4af}.sas-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:19px 0 26px}.sas-overview>article{--sas-accent:#f59e0b;padding:15px;border:1px solid color-mix(in srgb,var(--sas-accent) 35%,#263a4c);border-radius:16px;background:#0c1b28}.sas-overview-head{display:flex;align-items:center;justify-content:space-between}.sas-overview-head span{color:var(--sas-accent);font-size:12px;font-weight:950}.sas-overview-head b{display:grid;place-items:center;width:47px;height:47px;border-radius:50%;background:var(--sas-accent);color:#071018;font-size:19px}.sas-overview-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.sas-overview-stats small,.sas-overview-stats strong{display:block}.sas-overview-stats small{color:#61768a;font-size:8px}.sas-overview-stats strong{margin-top:3px;font-size:17px}.sas-overview-segments{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:11px}.sas-overview-segments i{padding:5px 0;border-radius:6px;background:color-mix(in srgb,var(--sas-accent) 12%,#07131e);color:var(--sas-accent);font-size:10px;font-style:normal;font-weight:900;text-align:center}.sas-model{--sas-accent:#f59e0b;margin-top:23px;padding:24px;border:1px solid color-mix(in srgb,var(--sas-accent) 30%,#213648);border-radius:24px;background:rgba(10,23,35,.93);box-shadow:0 24px 70px rgba(0,0,0,.22)}.sas-model-head{display:flex;align-items:flex-start;justify-content:space-between;gap:25px}.sas-title{display:flex;gap:14px}.sas-title>b{display:grid;place-items:center;flex:none;width:47px;height:47px;border-radius:13px;background:var(--sas-accent);color:#071018;font-size:20px}.sas-model-head h2{margin:6px 0 8px;font-size:27px}.sas-model-head p{margin:0;color:#8298aa;line-height:1.6}.sas-model-head code{flex:none;max-width:42%;padding:10px 13px;border:1px solid color-mix(in srgb,var(--sas-accent) 35%,transparent);border-radius:11px;background:color-mix(in srgb,var(--sas-accent) 8%,transparent);color:var(--sas-accent);font-weight:850}.sas-main-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-top:17px}.sas-pick-card,.sas-stat,.sas-segment-card,.sas-table-card{border:1px solid #1d3345;border-radius:17px;background:rgba(2,10,18,.52)}.sas-pick-card{padding:18px}.sas-label{color:#60778a;font-size:9px;font-weight:900;letter-spacing:.08em}.sas-pick-flow{display:flex;align-items:center;gap:13px;margin:14px 0}.sas-anchor-ball,.sas-result-ball{display:grid;place-items:center;width:105px;height:105px;border-radius:50%;background:#112434}.sas-anchor-ball small,.sas-result-ball small{font-size:8px}.sas-anchor-ball strong,.sas-result-ball strong{font-size:31px}.sas-anchor-ball strong{color:var(--sas-accent)}.sas-anchor-ball em{color:#5b7286;font-size:8px;font-style:normal}.sas-pick-flow>span{color:var(--sas-accent);font-size:28px;font-weight:950}.sas-result-ball{background:var(--sas-accent);color:#071018;box-shadow:0 15px 36px color-mix(in srgb,var(--sas-accent) 24%,transparent)}.sas-pick-card>p{margin:0;color:#b8c7d4;line-height:1.65}.sas-formula,.sas-wrap{margin-top:9px;padding:8px 10px;border-radius:8px;background:#0a1926;color:#dbe7f2;font-size:11px}.sas-wrap{color:#6e8497}.sas-stats{display:grid;grid-template-columns:1fr 1fr;gap:9px}.sas-stat{padding:15px}.sas-stat span,.sas-stat small{display:block;color:#60778a}.sas-stat strong{display:block;margin:5px 0;font-size:26px}.sas-stat em{display:block;margin-top:8px;padding-top:7px;border-top:1px solid #1d3345;color:#fbbf24;font-size:10px;font-style:normal;font-weight:850}.sas-stat.is-accent{border-color:color-mix(in srgb,var(--sas-accent) 50%,#1d3345)}.sas-stat.is-accent strong{color:var(--sas-accent)}.sas-segment-card,.sas-table-card{margin-top:12px;padding:18px}.sas-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.sas-section-head h3{margin:4px 0 0;font-size:15px}.sas-section-head>small{color:#60778a;font-size:9px}.sas-segments{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:13px}.sas-segments>div{padding:13px;border:1px solid #1d3345;border-radius:12px;background:#091824}.sas-segments span,.sas-segments small,.sas-segments i{display:block}.sas-segments span{color:#6c8295;font-size:9px}.sas-segments strong{display:block;margin:4px 0;color:var(--sas-accent);font-size:28px}.sas-segments small{color:#51697d;font-size:8px;line-height:1.45}.sas-segments i{margin-top:6px;color:#aebdca;font-size:10px;font-style:normal;font-weight:900}.sas-table-wrap{margin-top:12px;overflow-x:auto}.sas-table-card table{width:100%;min-width:980px;border-collapse:collapse;font-size:10px}.sas-table-card th,.sas-table-card td{padding:9px 8px;border-bottom:1px solid #172b3b;text-align:left;white-space:nowrap}.sas-table-card th{color:#60778a}.sas-table-card tr.is-failure{background:rgba(127,29,29,.2)}.sas-phase{padding:3px 6px;border-radius:999px;background:#172b3b;color:#8da1b4;font-size:8px}.sas-phase.is-新前瞻{background:#3f2c08;color:#fbbf24}.sas-predicted{color:var(--sas-accent);font-weight:950}.sas-ok{color:#86efac;font-weight:900}.sas-bad{color:#fb7185;font-weight:900}@media(max-width:980px){.sas-page-head,.sas-model-head{display:grid;align-items:start}.sas-model-head code{max-width:none}.sas-overview{grid-template-columns:1fr 1fr}.sas-main-grid{grid-template-columns:1fr}.sas-segments{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.sas-page{padding:70px 10px 36px}.sas-overview,.sas-stats{grid-template-columns:1fr 1fr}.sas-model{padding:15px}.sas-segments{grid-template-columns:1fr 1fr}.sas-section-head{display:grid;align-items:start}.sas-target{text-align:left}.sas-anchor-ball,.sas-result-ball{width:86px;height:86px}.sas-anchor-ball strong,.sas-result-ball strong{font-size:26px}}
      `}</style>
      <div className="sas-shell">
        <header className="sas-page-head">
          <div>
            <span className="sas-kicker">G · H · I · J ANCHOR LAB</span>
            <h1>新锚点四公式观察</h1>
            <p>只展示你选定的G、H、I、J。冻结研究、选定前观察和选定后新前瞻三段严格分开，公式不根据后续成绩切换。</p>
          </div>
          {data?.target && <div className="sas-target"><span>当前目标</span><strong>{period(data.target)}</strong></div>}
        </header>

        <div className="sas-timeline">
          <span>研究截止 2026-198</span>
          <span>选定前观察 199～211</span>
          <span>选定后新前瞻 212期起</span>
        </div>

        {error && <div className="sas-message sas-error">加载失败：{error}</div>}
        {!error && !data && <div className="sas-message">正在计算G～J锚点统计…</div>}
        {data?.status === "insufficient-history" && <div className="sas-message">{data.message}</div>}
        {data?.integrity && !data.integrity.complete && (
          <div className="sas-notice"><strong>数据完整性提示：</strong> {data.integrity.message}{data.integrity.gaps.map((gap) => <span key={`${gap.year}-${gap.from}`}> 缺少 {gap.year}-{String(gap.from).padStart(3, "0")}。</span>)}</div>
        )}

        {data?.models && (
          <section className="sas-overview">
            {data.models.map((model, index) => (
              <article key={model.key} style={{ "--sas-accent": COLORS[index] }}>
                <div className="sas-overview-head"><span>{model.code}</span><b>{model.prediction.display}</b></div>
                <div className="sas-overview-stats"><div><small>冻结500期</small><strong>{pct(model.frozenBacktests.backtest500)}</strong></div><div><small>199～211</small><strong>{pct(model.observedValidation)}</strong></div></div>
                <div className="sas-overview-segments">{model.segments.map((segment) => <i key={segment.index}>{segment.successCount}</i>)}</div>
              </article>
            ))}
          </section>
        )}

        {data?.models?.map((model, index) => <Model key={model.key} model={model} index={index} />)}
      </div>
    </main>
  );
}
