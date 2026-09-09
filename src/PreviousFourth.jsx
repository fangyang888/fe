import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./OnlineRiskRanking.css";
import "./PreviousFourth.css";

const ball = (n) => String(n).padStart(2, "0");
const period = (r) => (r ? `${r.year}-${String(r.No).padStart(3, "0")}` : "—");
const rate = (s) => (s.count ? `${(s.successRate * 100).toFixed(1)}%` : "—");
const colorClass = (color) =>
  ({ 红: "pf-red", 蓝: "pf-blue", 绿: "pf-green" })[color] || "pf-neutral";

function DrawBalls({ draw, highlight = false }) {
  return (
    <ol className="pf-balls" aria-label="接口原始顺序的7个号码">
      {draw.numbers.map((n, i) => (
        <li
          key={`${i}-${n}`}
          className={highlight && i === 3 ? "pf-selected" : ""}
        >
          <span>第{i + 1}位</span>
          <b className={colorClass(draw.colors[i])}>{ball(n)}</b>
          <small>{draw.colors[i] ? `${draw.colors[i]}波` : "颜色未提供"}</small>
          {highlight && i === 3 && <em>选作排除</em>}
        </li>
      ))}
    </ol>
  );
}

export default function PreviousFourth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [limit, setLimit] = useState(20);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kill/previous-fourth", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok)
          throw new Error(json.message || `HTTP ${response.status}`);
        return json;
      })
      .then((json) => {
        if (!controller.signal.aborted) {
          setData(json);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message || "加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => !onlyFailures || !r.success),
    [data, onlyFailures],
  );
  const ready = data?.status === "ready";
  const reload = () => {
    setLoading(true);
    setError("");
    setRefresh((r) => r + 1);
  };

  return (
    <main className="orr-page pf-page">
      <div className="orr-shell">
        <header className="orr-header">
          <div>
            <Link className="orr-back" to="/kill/adaptive-anchor-suite">
              ← 五算法实战观察
            </Link>
            <span className="orr-eyebrow">PREVIOUS DRAW · POSITION 04</span>
            <h1>上期第4位排除</h1>
            <p>从上期7球中固定选原始第4位，检查它是否未出现在下一期7球中。</p>
          </div>
          <div className="orr-actions">
            <div>
              <span>当前目标期</span>
              <strong>{period(data?.target)}</strong>
            </div>
            <button type="button" disabled={loading} onClick={reload}>
              {loading ? "计算中…" : "刷新数据"}
            </button>
          </div>
        </header>
        <div className="orr-timeline">
          <span>仅2026年数据</span>
          <span>固定原始第4位</span>
          <span>候选必在上期7球中</span>
          <span>颜色仅展示，不参与选号</span>
        </div>
        {error && (
          <div role="alert" className="orr-message orr-error">
            加载失败：{error}。请点击刷新重试。
            {data && "下方保留上次结果，请留意截止期。"}
          </div>
        )}
        {loading && (
          <div role="status" className="orr-message">
            正在读取历史数据并核对相邻期结果…
          </div>
        )}
        {data && !ready && (
          <section className="orr-message" role="status">
            <h2>暂时无法计算</h2>
            <p>{data.message}</p>
            {data.integrity?.missing?.length > 0 && (
              <p>缺少期号：{data.integrity.missing.join("、")}</p>
            )}
            {data.integrity?.invalidPeriods?.length > 0 && (
              <p>异常期号：{data.integrity.invalidPeriods.join("、")}</p>
            )}
            <Link to="/history">前往历史数据管理 →</Link>
          </section>
        )}
        {ready && (
          <>
            <section className="orr-card pf-hero">
              <div className="pf-source">
                <span className="orr-eyebrow">
                  SOURCE · {period(data.latest)}
                </span>
                <h2>上期7球，原始顺序</h2>
                <DrawBalls draw={data.latest} highlight />
                <p className="orr-description">{data.model.rule}</p>
              </div>
              <div className="pf-arrow" aria-hidden="true">
                →
              </div>
              <div className="orr-pick">
                <span>下一期 · 实验排除号</span>
                <strong className={colorClass(data.prediction?.color)}>
                  {data.prediction ? ball(data.prediction.number) : "—"}
                </strong>
                <p>
                  {data.prediction
                    ? `${period(data.target)} · ${data.prediction.color ? `${data.prediction.color}波` : "颜色未提供"}`
                    : "2026年数据已结束"}
                </p>
                <small>固定取上期第4位，不代表确定不会出现</small>
              </div>
            </section>
            <section className="orr-rolling" aria-label="滚动回测统计">
              {data.rolling.map((s) => (
                <article key={s.window}>
                  <span>近 {s.window} 期</span>
                  <strong>
                    {s.successCount}
                    <small>/{s.count}</small>
                  </strong>
                  <b>7码未出现 {rate(s)}</b>
                  <p>
                    特别号未出现{" "}
                    {s.count
                      ? `${(s.specialCodeMissRate * 100).toFixed(1)}%`
                      : "—"}
                  </p>
                  {s.count < s.window && (
                    <small>当前仅有 {s.count} 期可回测</small>
                  )}
                </article>
              ))}
            </section>
            <section className="orr-card">
              <div className="orr-section-head">
                <div>
                  <span className="orr-eyebrow">AUDIT</span>
                  <h2>分阶段看实际表现</h2>
                </div>
                <span className="orr-badge">目标：100期成功95期</span>
              </div>
              <div className="orr-stats">
                {[
                  [
                    "101～150期 · 选参段",
                    data.stages.selection,
                    "该区间用于比较规则，不是独立验收",
                  ],
                  [
                    "151～250期 · 回溯比较",
                    data.stages.audit,
                    !data.stages.audit.complete
                      ? "尚不足完整100期"
                      : data.stages.audit.targetPassed
                        ? "本段达到目标，仍需后续独立验证"
                        : "本段未达到95/100",
                  ],
                  [
                    "251期起 · 后续回算",
                    data.stages.after250,
                    "按现有历史重新核对，非提前登记成绩",
                  ],
                ].map(([title, stat, detail]) => (
                  <article className="orr-stat" key={title}>
                    <span>{title}</span>
                    <strong>
                      {stat.successCount}
                      <small> / {stat.count}</small>
                    </strong>
                    <b>{rate(stat)}</b>
                    <p>{detail}</p>
                  </article>
                ))}
              </div>
              <p className="orr-note">{data.notice}</p>
            </section>
            {data.rows[0] && (
              <section className="orr-card">
                <span className="orr-eyebrow">LATEST CHECK</span>
                <h2>最近一期怎样核对</h2>
                <div className="pf-check">
                  <p>
                    <span>{period(data.rows[0].source)} 第4位</span>
                    <b className={colorClass(data.rows[0].predictedColor)}>
                      {ball(data.rows[0].predictedNumber)}
                    </b>
                  </p>
                  <span aria-hidden="true">→</span>
                  <p>
                    <span>{period(data.rows[0])} 实际7球</span>
                    <strong>
                      {data.rows[0].numbers.map(ball).join(" · ")}
                    </strong>
                  </p>
                  <b className={data.rows[0].success ? "orr-ok" : "orr-bad"}>
                    {data.rows[0].success ? "成功 · 未出现" : "失败 · 已出现"}
                  </b>
                </div>
              </section>
            )}
            <section className="orr-card">
              <div className="orr-section-head">
                <div>
                  <span className="orr-eyebrow">DRAW BY DRAW</span>
                  <h2>逐期排除记录</h2>
                </div>
                <div className="orr-filters">
                  <label>
                    <input
                      type="checkbox"
                      checked={onlyFailures}
                      onChange={(e) => setOnlyFailures(e.target.checked)}
                    />
                    只看失败
                  </label>
                  <label>
                    显示{" "}
                    <select
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                    >
                      <option value={20}>20期</option>
                      <option value={50}>50期</option>
                      <option value={100}>100期</option>
                      <option value={365}>全部</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="orr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">目标期</th>
                      <th scope="col">来源期</th>
                      <th scope="col">上期7球（高亮第4位）</th>
                      <th scope="col">排除号</th>
                      <th scope="col">实际7球</th>
                      <th scope="col">7码结果</th>
                      <th scope="col">特别号结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, limit).map((r) => (
                      <tr key={r.No} className={r.success ? "" : "orr-failed"}>
                        <td>{period(r)}</td>
                        <td>{period(r.source)}</td>
                        <td className="pf-source-row">
                          {r.source.numbers.map((n, i) => (
                            <span
                              key={i}
                              className={i === 3 ? "pf-position" : ""}
                            >
                              {ball(n)}
                            </span>
                          ))}
                        </td>
                        <td>
                          <b className={colorClass(r.predictedColor)}>
                            {ball(r.predictedNumber)}
                          </b>
                        </td>
                        <td>{r.numbers.map(ball).join(" · ")}</td>
                        <td className={r.success ? "orr-ok" : "orr-bad"}>
                          {r.success ? "成功 · 未出现" : "失败 · 已出现"}
                        </td>
                        <td>{r.specialCodeMiss ? "未出现" : "已出现"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && (
                  <p className="orr-empty">
                    {onlyFailures
                      ? "当前没有失败记录。"
                      : "至少需要两期连续数据才能核对一次结果。"}
                  </p>
                )}
              </div>
              <p className="orr-muted">
                显示 {Math.min(rows.length, limit)} / {rows.length} 条 ·
                从新到旧
              </p>
            </section>
            <footer className="orr-footer">
              数据截止 {period(data.latest)} · 统计生成{" "}
              {new Date(data.generatedAt).toLocaleString("zh-CN")}
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
