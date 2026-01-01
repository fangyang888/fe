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
  const [summary, setSummary] = useState(null);
  const [selectedNumbers, setSelectedNumbers] = useState(null);
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

  // 反预测算法：预测不在下一行中出现的数字
  // 基于规律：排除其他预测方法、热号，选择频率低、长时间未出现的数字
  const predictN = (history) => {
    const rows = history.length;
    if (rows < 2) return null;

    // 获取其他预测方法的结果
    const predB = predictB(history);
    const predC = predictC(history);
    const predI = predictI(history);
    const predM = predictM(history);
    const hotCold = computeHotCold(history);

    // 合并所有预测结果和热号（这些数字更可能出现，需要排除）
    const excludeSet = new Set([
      ...predB,
      ...predC,
      ...predI,
      ...(predM || []),
      ...hotCold.hot,
    ]);

    // 计算每个数字的"不出现分数"
    const scores = Array.from({ length: 49 }, (_, i) => {
      const num = i + 1;
      
      // 如果已经在排除列表中，分数为0
      if (excludeSet.has(num)) {
        return { num, score: 0 };
      }

      // 计算频率（越低越好）
      const freq = history.flat().filter((n) => n === num).length;
      const freqScore = 1 - freq / (rows * 7); // 频率越低，分数越高

      // 计算最近出现时间（越久越好）
      let lastSeen = rows;
      for (let i = rows - 1; i >= 0; i--) {
        if (history[i].includes(num)) {
          lastSeen = rows - 1 - i;
          break;
        }
      }
      const recencyScore = lastSeen / rows; // 越久未出现，分数越高

      // 计算短期频率（最近20期，越低越好）
      const shortWindow = history.slice(-Math.min(rows, 20));
      const shortFreq = shortWindow.flat().filter((n) => n === num).length;
      const shortFreqScore = 1 - shortFreq / (shortWindow.length * 7);

      // 综合分数：频率低 + 长时间未出现 + 短期频率低
      const score = freqScore * 0.3 + recencyScore * 0.4 + shortFreqScore * 0.3;

      return { num, score };
    });

    // 按分数降序排序，选择分数最高的7个（最不可能出现的）
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 7).map((s) => s.num);
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

  // 统计最后18行：对每一行用之前数据预测，与下一行对比，并计算热号冷号
  const calculateStatistics = (history) => {
    const rows = history.length;
    if (rows < 2) return null;

    const last18Rows = Math.min(18, rows - 1); // 最后18行，但需要至少2行才能比较
    const startIdx = rows - last18Rows - 1; // 从倒数第19行开始（因为需要预测下一行）

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

      // 反预测方法 N（预测不在下一行中出现的数字）
      const predN = predictN(pastHistory);
      const matchedN = predN ? predN.filter((num) => nextRow.includes(num)) : [];

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
        N: { prediction: predN, matched: matchedN },
      });
    }

    return { details };
  };

  // 分析每个算法每个位置的不匹配率，推荐10个最可能不在下一行中出现的数字
  const calculateSummary = (history) => {
    const rows = history.length;
    if (rows < 2) return null;

    const last18Rows = Math.min(18, rows - 1);
    const startIdx = rows - last18Rows - 1;

    // 统计每个算法每个位置的不匹配次数
    const positionStats = {
      B: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      C: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      I: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      M: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
      N: Array(7).fill(0).map(() => ({ total: 0, unmatched: 0, numbers: {} })),
    };

    for (let i = startIdx; i < rows - 1; i++) {
      const pastHistory = history.slice(0, i + 1);
      const nextRow = history[i + 1];

      // B方法
      const predB = predictB(pastHistory);
      predB.forEach((num, pos) => {
        positionStats.B[pos].total++;
        if (!nextRow.includes(num)) {
          positionStats.B[pos].unmatched++;
          positionStats.B[pos].numbers[num] = (positionStats.B[pos].numbers[num] || 0) + 1;
        }
      });

      // C方法
      const predC = predictC(pastHistory);
      predC.forEach((num, pos) => {
        positionStats.C[pos].total++;
        if (!nextRow.includes(num)) {
          positionStats.C[pos].unmatched++;
          positionStats.C[pos].numbers[num] = (positionStats.C[pos].numbers[num] || 0) + 1;
        }
      });

      // I方法
      const predI = predictI(pastHistory);
      predI.forEach((num, pos) => {
        positionStats.I[pos].total++;
        if (!nextRow.includes(num)) {
          positionStats.I[pos].unmatched++;
          positionStats.I[pos].numbers[num] = (positionStats.I[pos].numbers[num] || 0) + 1;
        }
      });

      // M方法
      const predM = predictM(pastHistory);
      if (predM) {
        predM.forEach((num, pos) => {
          positionStats.M[pos].total++;
          if (!nextRow.includes(num)) {
            positionStats.M[pos].unmatched++;
            positionStats.M[pos].numbers[num] = (positionStats.M[pos].numbers[num] || 0) + 1;
          }
        });
      }

      // N方法
      const predN = predictN(pastHistory);
      if (predN) {
        predN.forEach((num, pos) => {
          positionStats.N[pos].total++;
          if (!nextRow.includes(num)) {
            positionStats.N[pos].unmatched++;
            positionStats.N[pos].numbers[num] = (positionStats.N[pos].numbers[num] || 0) + 1;
          }
        });
      }
    }

    // 找出每个算法每个位置的不匹配率
    const positionRates = [];
    Object.keys(positionStats).forEach((method) => {
      positionStats[method].forEach((stat, pos) => {
        if (stat.total > 0) {
          const rate = stat.unmatched / stat.total;
          positionRates.push({
            method,
            position: pos + 1,
            rate,
            total: stat.total,
            unmatched: stat.unmatched,
            numbers: stat.numbers,
          });
        }
      });
    });

    // 按不匹配率降序排序
    positionRates.sort((a, b) => b.rate - a.rate);

    // 收集所有不匹配的数字及其权重
    const numberScores = {};
    positionRates.forEach((item) => {
      Object.keys(item.numbers).forEach((num) => {
        const numVal = parseInt(num);
        if (!numberScores[numVal]) {
          numberScores[numVal] = { count: 0, totalWeight: 0, sources: [] };
        }
        // 权重 = 不匹配率 * 出现次数
        const weight = item.rate * item.numbers[num];
        numberScores[numVal].count += item.numbers[num];
        numberScores[numVal].totalWeight += weight;
        numberScores[numVal].sources.push({
          method: item.method,
          position: item.position,
          rate: item.rate,
          count: item.numbers[num],
        });
      });
    });

    // 转换为数组并按权重排序
    const recommendations = Object.keys(numberScores)
      .map((num) => ({
        num: parseInt(num),
        count: numberScores[num].count,
        weight: numberScores[num].totalWeight,
        sources: numberScores[num].sources,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    // 计算每个算法每个位置的平均不匹配率（用于当前预测）
    const methodPositionRates = {};
    positionRates.forEach((item) => {
      const key = `${item.method}_${item.position}`;
      if (!methodPositionRates[key]) {
        methodPositionRates[key] = item.rate;
      }
    });

    return {
      positionRates: positionRates.slice(0, 20), // 前20个最高不匹配率的位置
      recommendations,
      methodPositionRates, // 用于从当前预测中挑选
    };
  };

  // 根据当前预测结果和统计的不匹配率，挑选10个最可能不在下一行中出现的数字
  const selectFromCurrentPredictions = (currentResults, summary) => {
    if (!summary || !summary.methodPositionRates) return null;

    const candidates = [];

    // 从每个算法的预测结果中，根据位置不匹配率挑选
    Object.keys(currentResults).forEach((method) => {
      const prediction = currentResults[method];
      if (!prediction || !Array.isArray(prediction)) return;

      prediction.forEach((num, pos) => {
        const key = `${method}_${pos + 1}`;
        const unmatchedRate = summary.methodPositionRates[key] || 0;
        
        // 如果这个位置的不匹配率 > 0，则加入候选
        if (unmatchedRate > 0) {
          candidates.push({
            num,
            method,
            position: pos + 1,
            unmatchedRate,
            weight: unmatchedRate, // 权重就是不匹配率
          });
        }
      });
    });

    // 去重：同一个数字只保留权重最高的
    const uniqueCandidates = {};
    candidates.forEach((item) => {
      if (!uniqueCandidates[item.num] || uniqueCandidates[item.num].weight < item.weight) {
        uniqueCandidates[item.num] = item;
      } else if (uniqueCandidates[item.num].weight === item.weight) {
        // 如果权重相同，合并来源
        if (!uniqueCandidates[item.num].sources) {
          uniqueCandidates[item.num].sources = [
            { method: uniqueCandidates[item.num].method, position: uniqueCandidates[item.num].position },
          ];
        }
        uniqueCandidates[item.num].sources.push({ method: item.method, position: item.position });
      }
    });

    // 按权重降序排序，取前10个
    const selected = Object.values(uniqueCandidates)
      .map((item) => ({
        num: item.num,
        weight: item.weight,
        method: item.method,
        position: item.position,
        sources: item.sources || [{ method: item.method, position: item.position }],
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    return selected;
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
      const currentResults = {
        B: predictB(history),
        C: predictC(history),
        I: predictI(history),
        M: predictM(history),
        N: predictN(history),
      };

      setResults(currentResults);

      setHotCold(computeHotCold(history));
      buildChart(history);
      setStatistics(calculateStatistics(history));
      const summaryData = calculateSummary(history);
      setSummary(summaryData);
      
      // 根据统计概率从当前预测中挑选10个数字
      if (summaryData) {
        const selected = selectFromCurrentPredictions(currentResults, summaryData);
        setSelectedNumbers(selected);
      }
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
          {results.N && (
            <p>
              <b>N反预测（预测不在下一行中出现的数字）：</b>
              {results.N.join(", ")}
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
          <h3>统计表格（最后18行数据，最后一行无对比结果不显示）</h3>
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                minWidth: "1600px",
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
                  <th style={{ padding: "8px", border: "1px solid #ddd", textAlign: "center" }}>
                    N反预测（与下一行对比）
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
                    <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                      {detail.N.prediction ? (
                        <>
                          <div style={{ textAlign: "center" }}>
                            {detail.N.prediction.map((num, i) => {
                              const isMatched = detail.N.matched.includes(num);
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
                                  {i < detail.N.prediction.length - 1 && ", "}
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ textAlign: "center", color: "#666", fontSize: "11px" }}>
                            匹配 {detail.N.matched.length} 个：{detail.N.matched.length > 0 ? detail.N.matched.join(", ") : "无"}
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

      {selectedNumbers && selectedNumbers.length > 0 && (
        <div style={{ marginTop: 20, padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "8px", border: "2px solid #007bff" }}>
          <h3 style={{ marginTop: 0, color: "#007bff" }}>
            🎯 根据统计概率从当前算法中挑选的10个数字
          </h3>
          <div style={{ marginTop: 15 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {selectedNumbers.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 15px",
                    backgroundColor: idx < 3 ? "#fff3cd" : idx < 6 ? "#d1ecf1" : "#e7f3ff",
                    border: `2px solid ${idx < 3 ? "#ffc107" : idx < 6 ? "#17a2b8" : "#2196F3"}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    fontWeight: idx < 3 ? "bold" : "normal",
                    minWidth: "120px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "6px" }}>
                    {item.num}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    不匹配率: {(item.weight * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: "10px", color: "#888" }}>
                    {item.sources.map((s, i) => (
                      <span key={i}>
                        {s.method}第{s.position}位
                        {i < item.sources.length - 1 && " / "}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 15, padding: "10px", backgroundColor: "#e7f3ff", borderRadius: "6px", fontSize: "13px" }}>
            <strong>说明：</strong>这10个数字是从当前算法的预测结果中，根据历史统计的不匹配率挑选出来的。
            数字越大（不匹配率越高），表示该数字在历史数据中越不容易出现在下一行中。
          </div>
        </div>
      )}

      {summary && (
        <div style={{ marginTop: 20 }}>
          <h3>算法分析总结（历史统计推荐）</h3>
          
          <div style={{ marginTop: 15 }}>
            <h4 style={{ marginBottom: 10 }}>推荐列表（按概率排序）：</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: 15 }}>
              {summary.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: idx < 3 ? "#fff3cd" : "#e7f3ff",
                    border: `2px solid ${idx < 3 ? "#ffc107" : "#2196F3"}`,
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: idx < 3 ? "bold" : "normal",
                  }}
                >
                  <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "4px" }}>
                    {rec.num} (权重: {rec.weight.toFixed(3)})
                  </div>
                  <div style={{ fontSize: "11px", color: "#666" }}>
                    出现 {rec.count} 次 | 来源: {rec.sources.map((s) => `${s.method}第${s.position}位`).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 15 }}>
            <h4 style={{ marginBottom: 10 }}>各算法位置不匹配率分析（前20个）：</h4>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                  minWidth: "600px",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5" }}>
                    <th style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                      算法
                    </th>
                    <th style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                      位置
                    </th>
                    <th style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                      不匹配率
                    </th>
                    <th style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                      不匹配/总数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.positionRates.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                        {item.method}
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                        第{item.position}位
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                        <span
                          style={{
                            color: item.rate > 0.7 ? "red" : item.rate > 0.5 ? "orange" : "green",
                            fontWeight: "bold",
                          }}
                        >
                          {(item.rate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center" }}>
                        {item.unmatched} / {item.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 15, padding: "12px", backgroundColor: "#f0f8ff", borderRadius: "6px" }}>
            <h4 style={{ marginBottom: 8 }}>分析说明：</h4>
            <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", lineHeight: "1.8" }}>
              <li>
                <strong>推荐数字</strong>：基于历史数据统计，这些数字在各算法预测中不匹配下一行的概率最高
              </li>
              <li>
                <strong>权重计算</strong>：权重 = 不匹配率 × 出现次数，权重越高表示越可靠
              </li>
              <li>
                <strong>位置分析</strong>：显示每个算法每个位置的不匹配率，帮助了解哪个位置最不容易匹配
              </li>
              <li>
                <strong>建议</strong>：优先选择权重最高的前3个数字（黄色高亮），这些是最可能不在下一行中出现的
              </li>
            </ul>
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
