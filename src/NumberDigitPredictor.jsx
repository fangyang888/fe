import React, { useState } from "react";
import * as tf from "@tensorflow/tfjs";

export default function NumberDigitPredictor({ history: externalHistory }) {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [random7, setRandom7] = useState([]); // 10选7随机数字

  // 10选7: 从1-10中随机选择7个数字
  const pick7Random = () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // Fisher-Yates 洗牌算法
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    // 取前7个并排序
    const selected = numbers.slice(0, 7).sort((a, b) => a - b);
    setRandom7(selected);
  };

  // 如果外部传入历史数据，使用外部数据；否则使用内部输入
  const history = externalHistory || [];

  // 构建更丰富的特征向量
  const buildFeatures = (history, rowIndex) => {
    if (rowIndex === 0) return null;

    const features = [];
    const currentRow = history[rowIndex];
    const prevRow = history[rowIndex - 1];

    // 1. 前一行所有数字的个位数（归一化到0-1）
    prevRow.forEach((num) => {
      features.push((num % 10) / 9);
    });

    // 2. 最近3行的最后一个数字的个位数（归一化）
    const windowSize = Math.min(3, rowIndex);
    for (let i = 0; i < windowSize; i++) {
      const row = history[rowIndex - i];
      if (row && row.length > 0) {
        features.push((row[row.length - 1] % 10) / 9);
      } else {
        features.push(0);
      }
    }

    // 3. 最近5行中每个个位数（0-9）出现的频率
    const recentWindow = history.slice(Math.max(0, rowIndex - 5), rowIndex);
    const digitCounts = new Array(10).fill(0);
    recentWindow.forEach((row) => {
      row.forEach((num) => {
        digitCounts[num % 10]++;
      });
    });
    const totalDigits = recentWindow.reduce((sum, row) => sum + row.length, 0);
    digitCounts.forEach((count) => {
      features.push(totalDigits > 0 ? count / totalDigits : 0);
    });

    // 4. 前一行最后一个数字的个位数（单独特征）
    features.push((prevRow[prevRow.length - 1] % 10) / 9);

    // 5. 前一行平均个位数
    const prevDigits = prevRow.map((num) => num % 10);
    const prevAvg = prevDigits.reduce((sum, d) => sum + d, 0) / prevDigits.length;
    features.push(prevAvg / 9);

    // 6. 前一行个位数的标准差（归一化）
    const prevVariance =
      prevDigits.reduce((sum, d) => sum + Math.pow(d - prevAvg, 2), 0) / prevDigits.length;
    const prevStd = Math.sqrt(prevVariance);
    features.push(Math.min(prevStd / 5, 1)); // 标准差最大约为5，归一化到0-1

    return features;
  };

  // 训练多分类模型（10个类别：0-9）
  const trainModel = async (history) => {
    if (history.length < 3) {
      throw new Error("至少需要3行数据才能训练");
    }

    setStatus("正在提取特征和训练模型...");
    const samples = [];
    const labels = [];

    // 使用滑动窗口创建训练样本
    for (let i = 1; i < history.length; i++) {
      const features = buildFeatures(history, i);
      if (!features) continue;

      const currentRow = history[i];
      const targetDigit = currentRow[currentRow.length - 1] % 10; // 目标：当前行最后一个数字的个位数

      samples.push(features);
      labels.push(targetDigit); // 直接使用0-9作为标签
    }

    if (samples.length === 0) {
      throw new Error("无法创建训练样本");
    }

    // 确保所有特征向量长度相同
    const featureLength = samples[0].length;
    const paddedSamples = samples.map((sample) => {
      const padded = [...sample];
      while (padded.length < featureLength) {
        padded.push(0);
      }
      return padded.slice(0, featureLength);
    });

    // 将标签转换为 one-hot 编码
    const oneHotLabels = labels.map((label) => {
      const oneHot = new Array(10).fill(0);
      oneHot[label] = 1;
      return oneHot;
    });

    // 创建多分类模型（使用 softmax 输出10个类别的概率）
    const model = tf.sequential();
    model.add(
      tf.layers.dense({
        units: 128,
        activation: "relu",
        inputShape: [featureLength],
      })
    );
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 64, activation: "relu" }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 32, activation: "relu" }));
    model.add(tf.layers.dense({ units: 10, activation: "softmax" })); // 10个类别：0-9

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: "categoricalCrossentropy",
      metrics: ["accuracy"],
    });

    const xs = tf.tensor2d(paddedSamples);
    const ys = tf.tensor2d(oneHotLabels);

    // 训练模型（增加epochs以提高精度）
    const epochs = Math.min(200, Math.max(50, samples.length * 2));
    await model.fit(xs, ys, {
      epochs: epochs,
      batchSize: Math.min(32, samples.length),
      verbose: 0,
      shuffle: true,
      validationSplit: 0.2, // 使用20%数据作为验证集
    });

    xs.dispose();
    ys.dispose();

    setStatus(`模型训练完成（训练样本: ${samples.length}，特征维度: ${featureLength}）`);
    return { model, featureLength };
  };

  // 预测下一行最后一个数字的个位数
  const predict = async () => {
    if (history.length === 0) {
      alert("历史数据为空，无法进行预测");
      return;
    }

    if (history.length < 3) {
      alert("至少需要3行数据才能进行预测");
      return;
    }

    setLoading(true);
    setPredictions([]);
    setStatus("");

    try {
      // 训练模型
      const { model, featureLength } = await trainModel(history);

      // 使用最后一行作为"当前行"，前一行作为"前一行"来构建特征
      // 为了构建特征，我们需要模拟一个"下一行"，所以创建一个临时数组
      const tempHistory = [...history, history[history.length - 1]]; // 添加一个占位行
      const features = buildFeatures(tempHistory, tempHistory.length - 1);
      if (!features) {
        throw new Error("无法构建预测特征");
      }

      // 填充特征到相同长度
      const paddedFeatures = [...features];
      while (paddedFeatures.length < featureLength) {
        paddedFeatures.push(0);
      }
      const finalFeatures = paddedFeatures.slice(0, featureLength);

      // 进行预测
      const inputTensor = tf.tensor2d([finalFeatures]);
      const prediction = model.predict(inputTensor);
      const probabilities = await prediction.data(); // 10个类别的概率分布

      inputTensor.dispose();
      prediction.dispose();
      model.dispose();

      // 根据概率分布选择6个最可能的数字
      const digitProbs = Array.from({ length: 10 }, (_, i) => ({
        digit: i,
        prob: probabilities[i],
      }));

      // 按概率降序排序
      digitProbs.sort((a, b) => b.prob - a.prob);

      // 选择概率最高的6个
      const topPredictions = digitProbs.slice(0, 6).map((item) => item.digit);

      setPredictions(topPredictions);
      setStatus(`预测完成，最高概率: ${(digitProbs[0].prob * 100).toFixed(2)}%`);
    } catch (error) {
      console.error("预测错误:", error);
      setStatus(`错误: ${error.message}`);
      alert(`预测失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "100%",
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h3 style={{ fontSize: "18px", marginBottom: "15px", color: "#333" }}>
        数字个位数预测器（TensorFlow.js - 优化版）
      </h3>
      <p style={{ marginBottom: "15px", color: "#666", fontSize: "14px" }}>
        使用 TensorFlow.js
        多分类模型预测下一行最后一个数字的个位数（0-9），基于上方输入的历史数据训练
      </p>

      {!externalHistory && (
        <p style={{ color: "#999", fontSize: "12px", marginBottom: "15px" }}>
          提示：需要在上方输入历史数据后才能进行预测
        </p>
      )}

      {externalHistory && externalHistory.length > 0 && (
        <button
          onClick={predict}
          disabled={loading || externalHistory.length < 3}
          style={{
            marginTop: "10px",
            marginBottom: "15px",
            padding: "10px 20px",
            fontSize: "14px",
            backgroundColor: loading || externalHistory.length < 3 ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading || externalHistory.length < 3 ? "not-allowed" : "pointer",
            minHeight: "36px",
          }}
        >
          {loading ? "预测中..." : "预测个位数"}
        </button>
      )}

      {/* 10选7按钮 */}
      <div style={{ marginTop: "15px", marginBottom: "15px" }}>
        <button
          onClick={pick7Random}
          style={{
            padding: "10px 20px",
            fontSize: "14px",
            backgroundColor: "#9c27b0",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            minHeight: "36px",
          }}
        >
          🎲 10选7 (随机)
        </button>
        
        {random7.length > 0 && (
          <div style={{ 
            marginTop: "10px", 
            padding: "15px", 
            backgroundColor: "#f3e5f5", 
            borderRadius: "6px",
            border: "2px solid #9c27b0"
          }}>
            <h4 style={{ fontSize: "14px", marginBottom: "10px", color: "#7b1fa2" }}>
              🎯 随机7个数字 (1-10)
            </h4>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {random7.map((num, idx) => (
                <div
                  key={idx}
                  style={{
                    width: "40px",
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    fontWeight: "bold",
                    backgroundColor: "#9c27b0",
                    color: "white",
                    borderRadius: "50%",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  {num}
                </div>
              ))}
            </div>
            <p style={{ marginTop: "8px", fontSize: "11px", color: "#666" }}>
              从1-10中随机选择了7个数字，点击按钮重新随机
            </p>
          </div>
        )}
      </div>

      {status && (
        <p
          style={{
            marginTop: "10px",
            padding: "8px",
            backgroundColor: "#f0f0f0",
            borderRadius: "4px",
            color: "#333",
            fontSize: "12px",
          }}
        >
          {status}
        </p>
      )}

      {predictions.length > 0 && (
        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            backgroundColor: "#f9f9f9",
            borderRadius: "6px",
            border: "2px solid #007bff",
          }}
        >
          <h4
            style={{
              fontSize: "16px",
              marginBottom: "12px",
              color: "#007bff",
            }}
          >
            预测结果（下一行最后一个数字的个位数，按概率排序）
          </h4>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              justifyContent: "flex-start",
            }}
          >
            {predictions.map((digit, index) => (
              <div
                key={index}
                style={{
                  width: "45px",
                  height: "45px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  fontWeight: "bold",
                  backgroundColor: index === 0 ? "#28a745" : "#007bff",
                  color: "white",
                  borderRadius: "6px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  position: "relative",
                }}
                title={`预测概率排名第 ${index + 1} 位`}
              >
                {digit}
                {index === 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-8px",
                      right: "-8px",
                      fontSize: "10px",
                      backgroundColor: "#ffc107",
                      color: "#000",
                      borderRadius: "50%",
                      width: "18px",
                      height: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                    }}
                  >
                    ★
                  </span>
                )}
              </div>
            ))}
          </div>
          <p
            style={{
              marginTop: "12px",
              fontSize: "12px",
              color: "#666",
            }}
          >
            共预测了 {predictions.length} 个可能的个位数（0-9），按模型输出概率从高到低排列
          </p>
        </div>
      )}
    </div>
  );
}
