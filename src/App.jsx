import React, { useState, useEffect } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";

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

  // 初始化时通过请求读取历史数据
  // 优先级：API（开发环境）> /history.txt（生产环境）
  useEffect(() => {
    const loadHistory = async () => {
      // 1. 尝试从 API 读取（开发环境）
      try {
        const response = await fetch("/api/read-history");
        if (response.ok) {
          const text = await response.text();
          if (text.trim()) {
            setInput(text.trim());
            return;
          }
        }
      } catch (err) {
        // API 不可用（生产环境），继续尝试静态文件
      }

      // 2. 尝试从静态文件读取（生产环境）
      try {
        const response = await fetch("/fe/history.txt");
        if (response.ok) {
          const text = await response.text();
          if (text.trim()) {
            setInput(text.trim());
          }
        }
      } catch (err) {
        // 文件不存在或读取失败，忽略错误
        console.log("未找到 history.txt 文件，使用空输入");
      }
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

  const runPrediction = () => {
    const history = parseInput();

    if (!history.length || history[0].length !== 7) return alert("格式错误：每行必须是7个数字");

    // 将 history 转换为字符串并保存
    const historyString = history.map((row) => row.join(", ")).join("\n");
    saveHistoryToFile(historyString);

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
    <div style={{ padding: 20 }}>
      <h2>（增强版 B/C/I + 趋势图 + 热冷分析）</h2>

      <textarea
        style={{ width: "100%", height: 140 }}
        placeholder="输入历史数据，每行7个数字"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button onClick={runPrediction} style={{ marginTop: 10 }}>
        开始预测
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

      {chartData && (
        <div style={{ marginTop: 20 }}>
          <h3>走势图（7列分布变化）</h3>

          <Line data={chartData} />
        </div>
      )}

      {metrics.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>线性拟合统计</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>列</th>
                <th>斜率</th>
                <th>截距</th>
                <th>R²</th>
                <th>残差</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{m.a.toFixed(3)}</td>
                  <td>{m.b.toFixed(3)}</td>
                  <td>{m.r2.toFixed(3)}</td>
                  <td>{m.residual.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
