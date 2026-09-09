import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./OnlineRiskRanking.css";

const ball = (n) => String(n).padStart(2, "0");
const period = (r) => (r ? `${r.year}-${String(r.No).padStart(3, "0")}` : "—");
const rate = (s) => (s?.count ? `${(s.successRate * 100).toFixed(1)}%` : "—");
const signed = (v) => `${v > 0 ? "+" : ""}${v.toFixed(4)}`;

function Stat({ title, data, detail }) {
  return (
    <article className="orr-stat">
      <span>{title}</span>
      <strong>
        {data.successCount}
        <small> / {data.count}</small>
      </strong>
      <b>{rate(data)}</b>
      <p>{detail}</p>
    </article>
  );
}

export default function OnlineRiskRanking() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [limit, setLimit] = useState(20);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kill/online-risk-ranking", {
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
  const weights = useMemo(
    () =>
      [...(data?.weights ?? [])]
        .filter((w) => w.name !== "基础项")
        .sort((a, b) => Math.abs(b.current) - Math.abs(a.current))
        .slice(0, 6),
    [data],
  );
  const maxWeight = Math.max(0.001, ...weights.map((w) => Math.abs(w.current)));
  const ready = data?.status === "ready";
  const reload = () => {
    setLoading(true);
    setError("");
    setRefresh((v) => v + 1);
  };

  return (
    <main className="orr-page">
      <div className="orr-shell">
        <header className="orr-header">
          <div>
            <Link className="orr-back" to="/kill/adaptive-anchor-suite">
              ← 五算法实战观察
            </Link>
            <span className="orr-eyebrow">ONLINE RANKING · 2026</span>
            <h1>动态号码排序</h1>
            <p>
              从前面的变化中学习，每期开奖后更新权重，下一期只排除一个号码。
            </p>
          </div>
          <div className="orr-actions">
            <div>
              <span>当前目标期</span>
              <strong>{period(data?.target)}</strong>
            </div>
            <button type="button" onClick={reload} disabled={loading}>
              {loading ? "计算中…" : "刷新数据"}
            </button>
          </div>
        </header>
        <div className="orr-timeline">
          <span>仅使用 2026 年</span>
          <span>101～150 期选参</span>
          <span>151～250 期回溯比较</span>
          <span>每期更新模型权重</span>
        </div>
        {error && (
          <div role="alert" className="orr-message orr-error">
            加载失败：{error}。可点击刷新重试。
            {data && "下方保留上次结果，请留意数据截止期。"}
          </div>
        )}
        {loading && (
          <div role="status" className="orr-message">
            正在读取历史数据并逐期计算…
          </div>
        )}
        {data && !ready && (
          <section role="status" className="orr-message">
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
            <section className="orr-hero orr-card">
              <div className="orr-hero-copy">
                <span className="orr-eyebrow">{data.model.version}</span>
                <h2>逐期学习，相对排序</h2>
                <p>{data.model.description}</p>
                <div className="orr-latest">
                  <span>
                    数据截止 {period(data.latest)} · 共 {data.historyCount} 期
                  </span>
                  <div>
                    {data.latest.numbers.map((n, i) => (
                      <b key={n} className={i === 6 ? "orr-special" : ""}>
                        {ball(n)}
                      </b>
                    ))}
                  </div>
                  <small>末位为特别号；排除结果按全部 7 个号码判断。</small>
                </div>
              </div>
              <div className="orr-pick">
                <span>下一期 · 实验排除号</span>
                <strong>
                  {data.prediction ? ball(data.prediction.number) : "—"}
                </strong>
                <p>
                  {data.prediction
                    ? `目标 ${period(data.target)}`
                    : "2026 年数据已结束"}
                </p>
                <small>模型输出，不代表确定不会出现</small>
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
                  {s.count < s.window && <small>可回测 {s.count} 期</small>}
                </article>
              ))}
            </section>

            <section className="orr-card">
              <div className="orr-section-head">
                <div>
                  <span className="orr-eyebrow">AUDIT</span>
                  <h2>把选参和后段表现分开看</h2>
                </div>
                <span className="orr-badge">目标：100期成功95期</span>
              </div>
              <div className="orr-stats">
                <Stat
                  title="101～150期 · 选参段"
                  data={data.stages.selection}
                  detail="用于选择配置，不能作为独立验收"
                />
                <Stat
                  title="151～250期 · 回溯比较"
                  data={data.stages.audit}
                  detail={
                    !data.stages.audit.complete
                      ? "数据尚不足完整100期"
                      : data.stages.audit.targetPassed
                        ? "本段达到95/100，仍需后续独立验证"
                        : "本段未达到95/100"
                  }
                />
                <Stat
                  title="251期起 · 后续回算"
                  data={data.stages.after250}
                  detail="按当前历史重新计算，非提前登记成绩"
                />
              </div>
              <p className="orr-note">{data.notice}</p>
            </section>

            <div className="orr-columns">
              <section className="orr-card">
                <div className="orr-section-head">
                  <div>
                    <span className="orr-eyebrow">LEARNING</span>
                    <h2>当前学习到的权重</h2>
                  </div>
                  <span className="orr-muted">对比20期前</span>
                </div>
                <p className="orr-description">
                  正值推高排序分，负值拉低排序分。模型排除总分最低的号码；单个权重不代表独立规律。
                </p>
                <div className="orr-weights">
                  {weights.map((w) => (
                    <div key={w.name}>
                      <div>
                        <span>{w.name}</span>
                        <strong>{signed(w.current)}</strong>
                        <small>此前 {signed(w.previous)}</small>
                      </div>
                      <div className="orr-track">
                        <i
                          style={{
                            width: `${(Math.abs(w.current) / maxWeight) * 100}%`,
                            background: w.current < 0 ? "#61d4a8" : "#f4c15d",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="orr-card">
                <span className="orr-eyebrow">HOW IT UPDATES</span>
                <h2>每期怎样改变判断</h2>
                <ol className="orr-steps">
                  <li>
                    <b>01</b>
                    <div>
                      <strong>读取前面的变化</strong>
                      <p>频率、升降温、遗漏、历史间隔与相邻期关系。</p>
                    </div>
                  </li>
                  <li>
                    <b>02</b>
                    <div>
                      <strong>给49个号码排序</strong>
                      <p>按当前权重计算相对分数，只排除最低的一个。</p>
                    </div>
                  </li>
                  <li>
                    <b>03</b>
                    <div>
                      <strong>开奖后再学习</strong>
                      <p>依据实际7球更新权重，用于下一期计算。</p>
                    </div>
                  </li>
                </ol>
                <p className="orr-note">
                  学习率 {data.model.learningRate} · 旧系数保留{" "}
                  {data.model.retention}
                  。这两个参数固定，特征值和模型权重逐期更新。
                </p>
              </section>
            </div>

            <section className="orr-card">
              <div className="orr-section-head">
                <div>
                  <span className="orr-eyebrow">DRAW BY DRAW</span>
                  <h2>逐期核对记录</h2>
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
                      <th scope="col">期号</th>
                      <th scope="col">阶段</th>
                      <th scope="col">排除号</th>
                      <th scope="col">实际7个号码</th>
                      <th scope="col">7码结果</th>
                      <th scope="col">特别号结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, limit).map((r) => (
                      <tr key={r.No} className={r.success ? "" : "orr-failed"}>
                        <td>{period(r)}</td>
                        <td>
                          {r.No >= 251
                            ? "后续回算"
                            : r.No >= 151
                              ? "回溯比较"
                              : r.No >= 101
                                ? "选参"
                                : "训练"}
                        </td>
                        <td className="orr-number">
                          {ball(r.predictedNumber)}
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
                {rows.length === 0 && (
                  <p className="orr-empty">
                    {onlyFailures
                      ? "当前记录没有失败期。"
                      : "首个可回测期为第41期，等待更多历史数据。"}
                  </p>
                )}
              </div>
              <p className="orr-muted">
                显示 {Math.min(limit, rows.length)} / {rows.length} 条 ·
                从新到旧
              </p>
            </section>
            <footer className="orr-footer">
              统计生成：{new Date(data.generatedAt).toLocaleString("zh-CN")} ·
              历史排除成功率不是下一期成功概率
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
