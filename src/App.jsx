import React, { useState, useEffect } from "react";
// import { Line } from "react-chartjs-2";
// import "chart.js/auto";

export default function LotteryPredictor() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [hotCold, setHotCold] = useState(null);

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

  const runPrediction = (flag = true) => {
    const history = parseInput();

    if (!history.length || history[0].length !== 7) return alert("格式错误：每行必须是7个数字");
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

    setResults({
      B: predictB(history),
      C: predictC(history),
      I: predictI(history),
    });

    setHotCold(computeHotCold(history));
    buildChart(history);
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

      {/* {chartData && (
        <div style={{ marginTop: 20, overflowX: "auto" }}>
          <h3>走势图（7列分布变化）</h3>
          <div style={{ minWidth: "300px", maxWidth: "100%" }}>
            <Line data={chartData} />
          </div>
        </div>
      )} */}

      {metrics.length > 0 && (
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
      )}
    </div>
  );
}
