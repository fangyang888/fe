import React, { useState, useEffect } from "react";
// import { Line } from "react-chartjs-2";
// import "chart.js/auto";
// @ts-ignore
import NumberDigitPredictor from "./NumberDigitPredictor.jsx";

export default function LotteryPredictor() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [hotCold, setHotCold] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const dot = (w, x) => w.reduce((s, wi, i) => s + wi * x[i], 0);

  const clamp = (v) => Math.max(1, Math.min(49, Math.round(v)));

  const linearFit = (xs, ys) => {
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b) / n;
    const meanY = ys.reduce((a, b) => a + b) / n;
    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += Math.pow(xs[i] - meanX, 2);
    }
    const a = den === 0 ? 0 : num / den;
    const b = meanY - a * meanX;

    let ssTot = 0,
      ssRes = 0;
    for (let i = 0; i < n; i++) {
      const pred = a * xs[i] + b;
      ssTot += Math.pow(ys[i] - meanY, 2);
      ssRes += Math.pow(ys[i] - pred, 2);
    }
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

    return { a, b, r2, residual: Math.sqrt(ssRes / n) };
  };

  const parseInput = () =>
    input
      .trim()
      .split(/\n/)
      .map((line) => line.split(/[, ]+/).map(Number));

  const predictB = (history) => {
    const rows = history.length;
    const xs = Array.from({ length: rows }, (_, i) => i);
    return history[0].map((_, c) => {
      const ys = history.map((r) => r[c]);
      const { a, b } = linearFit(xs, ys);
      return clamp(a * rows + b);
    });
  };

  const predictC = (history) => {
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    return last.map((v, c) => clamp(v + (v - prev[c])));
  };

  // 轻量级逻辑回归：用历史特征对 1-49 号做二分类，给出概率最高的 7 个
  const buildFeatures = (history, num) => {
    const rows = history.length;
    const longFreq = rows === 0 ? 0 : history.flat().filter((n) => n === num).length / (rows * 7);
    const shortWindow = history.slice(-Math.min(rows, 20));
    const shortFreq =
      shortWindow.length === 0
        ? 0
        : shortWindow.flat().filter((n) => n === num).length / (shortWindow.length * 7);
    let lastSeen = rows;
    for (let i = rows - 1; i >= 0; i--) {
      if (history[i].includes(num)) {
        lastSeen = rows - 1 - i;
        break;
      }
    }
    const recency = rows === 0 ? 1 : Math.min(lastSeen / rows, 1);
    return [shortFreq, longFreq, recency];
  };

  const trainLogistic = (history) => {
    const rows = history.length;
    if (rows < 4) return null; // 数据太少就不训了
    const X = [];
    const y = [];
    for (let i = 1; i < rows; i++) {
      const past = history.slice(0, i);
      for (let num = 1; num <= 49; num++) {
        X.push(buildFeatures(past, num));
        y.push(history[i].includes(num) ? 1 : 0);
      }
    }
    const w = [0, 0, 0];
    const lr = 0.5;
    const epochs = 120;
    const n = X.length;
    for (let e = 0; e < epochs; e++) {
      let g0 = 0,
        g1 = 0,
        g2 = 0;
      for (let j = 0; j < n; j++) {
        const [x0, x1, x2] = X[j];
        const p = sigmoid(w[0] * x0 + w[1] * x1 + w[2] * x2);
        const diff = p - y[j];
        g0 += diff * x0;
        g1 += diff * x1;
        g2 += diff * x2;
      }
      w[0] -= (lr * g0) / n;
      w[1] -= (lr * g1) / n;
      w[2] -= (lr * g2) / n;
    }
    return w;
  };

  const predictM = (history) => {
    const w = trainLogistic(history);
    if (!w) return null;
    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      const f = buildFeatures(history, num);
      return { num, p: sigmoid(dot(w, f)) };
    });
    scores.sort((a, b) => b.p - a.p);
    return scores.slice(0, 7).map((s) => s.num);
  };


  const predictI = (history) => {
    const rows = history.length;
    const last = history[rows - 1];
    const prev = history[rows - 2];
    return last.map((v, c) => clamp(history.reduce((s, r) => s + r[c], 0) / rows + (v - prev[c])));
  };

  const computeHotCold = (history) => {
    const freq = Array(50).fill(0);
    history.flat().forEach((num) => freq[num]++);
    const sorted = [...Array(49).keys()].map((i) => i + 1).sort((a, b) => freq[b] - freq[a]);
    return {
      hot: sorted.slice(0, 7),
      cold: sorted.slice(-7),
    };
  };

  const buildChart = (history) => {
    const labels = history.map((_, i) => `期${i + 1}`);
    const datasets = Array.from({ length: 7 }, (_, col) => ({
      label: `列 ${col + 1}`,
      data: history.map((r) => r[col]),
    }));
    setChartData({ labels, datasets });
  };

  // 统计最后11行：对每一行用之前数据预测，与下一行对比，并计算热号冷号
  const calculateStatistics = (history) => {
    const rows = history.length;
    if (rows < 2) return null;

    const last11Rows = Math.min(11, rows - 1); // 最后11行，但需要至少2行才能比较
    const startIdx = rows - last11Rows - 1; // 从倒数第12行开始（因为需要预测下一行）

    const details = [];

    for (let i = startIdx; i < rows - 1; i++) {
      const pastHistory = history.slice(0, i + 1);
      const currentRow = history[i];
      const nextRow = history[i + 1];
      const period = i + 2;

      // 计算热号冷号（基于当前行之前的所有数据）
      const hotCold = computeHotCold(pastHistory);
      const matchedHot = hotCold.hot.filter((num) => nextRow.includes(num));
      const matchedCold = hotCold.cold.filter((num) => nextRow.includes(num));

      // 预测方法 B
      const predB = predictB(pastHistory);
      const matchedB = predB.filter((num) => nextRow.includes(num));

      // 预测方法 C
      const predC = predictC(pastHistory);
      const matchedC = predC.filter((num) => nextRow.includes(num));

      // 预测方法 I
      const predI = predictI(pastHistory);
      const matchedI = predI.filter((num) => nextRow.includes(num));

      // 预测方法 M
      const predM = predictM(pastHistory);
      const matchedM = predM ? predM.filter((num) => nextRow.includes(num)) : [];

      details.push({
        period,
        currentRow,
        nextRow,
        hotCold: {
          hot: hotCold.hot,
          cold: hotCold.cold,
          matchedHot,
          matchedCold,
        },
        B: { prediction: predB, matched: matchedB },
        C: { prediction: predC, matched: matchedC },
        I: { prediction: predI, matched: matchedI },
        M: { prediction: predM, matched: matchedM },
      });
    }

    return { details };
  };

  // 初始化时从静态文件读取历史数据
  useEffect(() => {
    const loadHistory = async () => {
      // 尝试多个可能的路径
      const paths = [
        "/fe/history.txt", // 生产环境（GitHub Pages）
        "/history.txt", // 开发环境或根路径
        "./history.txt", // 相对路径
        "history.txt", // 当前目录
      ];

      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            const text = await response.text();
            if (text.trim()) {
              setInput(text.trim());
              console.log(`成功从 ${path} 加载历史数据`);
              return;
            }
          }
        } catch (err) {
          // 继续尝试下一个路径
          console.log(`无法从 ${path} 加载:`, err.message);
        }
      }

      // 所有路径都失败
      console.log("未找到 history.txt 文件，使用空输入");
    };
    loadHistory();
  }, []);

  const saveHistoryToFile = async (historyString) => {
    // 通过 API 请求保存到 public/history.txt（开发环境）
    try {
      const response = await fetch("/api/save-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: historyString }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log("历史数据已保存到 public/history.txt");
        } else {
          throw new Error(result.error || "保存失败");
        }
      } else {
        throw new Error("保存请求失败");
      }
    } catch (err) {
      // API 不可用（生产环境），这是正常的
      console.log("生产环境无法保存文件，数据仅在当前会话有效");
    }
  };

  const runPrediction = async (flag = true) => {
    const history = parseInput();

    if (!history.length || history[0].length !== 7) return alert("格式错误：每行必须是7个数字");
    setLoading(true);
    if (flag) {
      // 将 history 转换为字符串并保存
      const historyString = history.map((row) => row.join(", ")).join("\n");
      saveHistoryToFile(historyString);
    }

    const rows = history.length;
    const xs = Array.from({ length: rows }, (_, i) => i);

    setMetrics(
      history[0].map((_, c) =>
        linearFit(
          xs,
          history.map((row) => row[c])
        )
      )
    );

    try {
      setResults({
        B: predictB(history),
        C: predictC(history),
        I: predictI(history),
        M: predictM(history),
      });

      setHotCold(computeHotCold(history));
      buildChart(history);
      setStatistics(calculateStatistics(history));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "100%",
        boxSizing: "border-box",
        fontSize: "14px",
      }}
    >
      <h2 style={{ fontSize: "18px", marginBottom: "15px" }}>
        （增强版 B/C/I + 趋势图 + 热冷分析）
      </h2>

      <textarea
        style={{
          width: "100%",
          height: 140,
          padding: "10px",
          boxSizing: "border-box",
          fontSize: "14px",
          fontFamily: "monospace",
        }}
        placeholder="输入历史数据，每行7个数字"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button
        onClick={runPrediction}
        disabled={loading}
        style={{
          marginTop: 10,
          padding: "12px 24px",
          fontSize: "16px",
          minHeight: "44px", // 移动端友好的触摸目标
          cursor: "pointer",
        }}
      >
        开始预测
      </button>
      <button
        onClick={() => runPrediction(false)}
        disabled={loading}
        style={{
          marginTop: 10,
          padding: "12px 24px",
          fontSize: "16px",
          minHeight: "44px", // 移动端友好的触摸目标
          cursor: "pointer",
        }}
      >
        开始预测不保存
      </button>
      {loading && <p style={{ marginTop: 10 }}>预测中，请稍候...</p>}

      {results && (
        <div style={{ marginTop: 20 }}>
          <h3>预测结果</h3>
          <p>
            <b>B趋势回归：</b>
            {results.B.join(", ")}
          </p>
          <p>
            <b>C差值外推：</b>
            {results.C.join(", ")}
          </p>
          <p>
            <b>I平均+动量：</b>
            {results.I.join(", ")}
          </p>
          {results.M && (
            <p>
              <b>M逻辑回归（特征：短期/长期频率 + 最近未出现）：</b>
              {results.M.join(", ")}
            </p>
          )}
        </div>
      )}

      {hotCold && (
        <div style={{ marginTop: 20 }}>
          <h3>热点分析</h3>
          <p>
            <b>热号 Top7：</b>
            {hotCold.hot.join(", ")}
          </p>
          <p>
            <b>冷号 Bottom7：</b>
            {hotCold.cold.join(", ")}
          </p>
        </div>
      )}

      {statistics && statistics.details && (
        <div style={{ marginTop: 20 }}>
          <h3>统计表格（最后11行数据，最后一行无对比结果不显示）</h3>
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                minWidth: "1400px",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f5f5f5" }}>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    期数
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    当前行
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    实际下一行
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    热号Top7（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    冷号Bottom7（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    B预测（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    C预测（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    I预测（与下一行对比）
                  </th>
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    M预测（与下一行对比）
                  </th>
                </tr>
              </thead>
              <tbody>
                {statistics.details.map((detail, idx) => (
                  <tr key={idx}>
                    <td
                      style={{
                        padding: "8px",
                        border: "1px solid #ddd",
                        textAlign: "center",
                        fontWeight: "bold",
                      }}
                    >
                      {detail.period}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                      {detail.currentRow.join(", ")}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                      {detail.nextRow.join(", ")}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.hotCold.hot.map((num, i) => {
                          const isMatched = detail.hotCold.matchedHot.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.hotCold.hot.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.hotCold.matchedHot.length} 个：{detail.hotCold.matchedHot.length > 0 ? detail.hotCold.matchedHot.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.hotCold.cold.map((num, i) => {
                          const isMatched = detail.hotCold.matchedCold.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.hotCold.cold.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.hotCold.matchedCold.length} 个：{detail.hotCold.matchedCold.length > 0 ? detail.hotCold.matchedCold.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.B.prediction.map((num, i) => {
                          const isMatched = detail.B.matched.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.B.prediction.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.B.matched.length} 个：{detail.B.matched.length > 0 ? detail.B.matched.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.C.prediction.map((num, i) => {
                          const isMatched = detail.C.matched.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.C.prediction.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.C.matched.length} 个：{detail.C.matched.length > 0 ? detail.C.matched.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      <div style={{ textAlign: "center" }}>
                        {detail.I.prediction.map((num, i) => {
                          const isMatched = detail.I.matched.includes(num);
                          return (
                            <span key={i}>
                              <span
                                style={{
                                  color: isMatched ? "red" : "inherit",
                                  fontWeight: isMatched ? "bold" : "normal",
                                }}
                              >
                                {num}
                              </span>
                              {i < detail.I.prediction.length - 1 && ", "}
                            </span>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                        匹配 {detail.I.matched.length} 个：{detail.I.matched.length > 0 ? detail.I.matched.join(", ") : "无"}
                      </div>
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      {detail.M.prediction ? (
                        <>
                          <div style={{ textAlign: "center" }}>
                            {detail.M.prediction.map((num, i) => {
                              const isMatched = detail.M.matched.includes(num);
                              return (
                                <span key={i}>
                                  <span
                                    style={{
                                      color: isMatched ? "red" : "inherit",
                                      fontWeight: isMatched ? "bold" : "normal",
                                    }}
                                  >
                                    {num}
                                  </span>
                                  {i < detail.M.prediction.length - 1 && ", "}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                            匹配 {detail.M.matched.length} 个：{detail.M.matched.length > 0 ? detail.M.matched.join(", ") : "无"}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: "center", color: "#999" }}>-</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* {chartData && (
        <div style={{ marginTop: 20, overflowX: "auto" }}>
          <h3>走势图（7列分布变化）</h3>
          <div style={{ minWidth: "300px", maxWidth: "100%" }}>
            <Line data={chartData} />
          </div>
        </div>
      )} */}

      {/* {metrics.length > 0 && (
        <div style={{ marginTop: 20, overflowX: "auto" }}>
          <h3>线性拟合统计</h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "400px", // 确保表格在小屏幕上可以横向滚动
              fontSize: "12px",
            }}
          >
            <thead>
              <tr>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>列</th>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>斜率</th>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>截距</th>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>R²</th>
                <th style={{ padding: "8px", border: "1px solid #ddd" }}>残差</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={i}>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>{i + 1}</td>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>{m.a.toFixed(3)}</td>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>{m.b.toFixed(3)}</td>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>{m.r2.toFixed(3)}</td>
                  <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                    {m.residual.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )} */}

      {/* 数字个位数预测器组件 */}
      {(() => {
        const parsedHistory = parseInput();
        return input.trim() && parsedHistory.length >= 2 ? (
          <div style={{ marginTop: "30px", borderTop: "2px solid #ddd", paddingTop: "20px" }}>
            <NumberDigitPredictor history={parsedHistory} />
          </div>
        ) : null;
      })()}
    </div>
  );
}
