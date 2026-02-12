---
name: lottery_predictor
description: 彩票预测器技能 - 使用 App.jsx 中的多种算法进行号码预测、杀码分析和尾数预测
---

# 彩票预测器技能 (Lottery Predictor Skill)

## 概述

此技能提供了一套完整的彩票号码预测工具，位于 `/Users/yang/fe/fe/src/App.jsx`。

## 使用场景

当用户需要进行彩票号码预测、分析历史数据、或了解预测算法时，使用此技能。

---

## 可用算法

### 正向预测算法

| 函数       | 用途                     |
| ---------- | ------------------------ |
| `predictB` | 基础预测                 |
| `predictC` | 频率预测                 |
| `predictM` | 机器学习预测（逻辑回归） |
| `predictL` | 多特征学习预测           |
| `predictX` | 排除上期数字预测         |

### 杀码算法（预测不会出现的数字）

| 函数                 | 用途               |
| -------------------- | ------------------ |
| `predictK1`          | 马尔可夫链反向预测 |
| `predictK2`          | 周期性排除         |
| `predictK3`          | 连续排除法         |
| `predictK4`          | 差值反推           |
| `predictK5`          | 反共现分析         |
| `predictKillNumbers` | 综合杀码推荐       |

### 杀码推荐 (`predictKillLastDigit`)

| 策略 | 用途 |
| --- | --- |
| S1 | 上行排除 |
| S2 | 连续排除 |
| S3 | 热号疲劳 |
| S4 | 近期重复 |
| S5 | 间隔模式 |
| S6 | 和值偏离 |
| S7 | 奇偶失衡 |
| S8 | 区间过载 |
| S9 | 邻号排除 |
| S10 | 频率衰减 |

### 尾数预测 (`predictTail`)

| 子算法  | 用途             |
| ------- | ---------------- |
| `runT1` | 一阶马尔可夫转移 |
| `runT2` | 二阶马尔可夫转移 |
| `runT3` | 和值尾数关联     |
| `runT4` | N-gram 序列匹配  |
| `runT5` | 差值模式分析     |
| `runT6` | 周期分析         |
| `runT7` | 冷热平衡         |
| `runT8` | 012路补偿        |

### 其他功能

| 函数                           | 用途        |
| ------------------------------ | ----------- |
| `predictZodiac`                | 生肖预测    |
| `calculateStatistics`          | 统计分析    |
| `selectFromCurrentPredictions` | AI 综合推荐 |

---

## 操作指南

### 运行预测

1. 启动开发服务器：

   ```bash
   cd /Users/yang/fe/fe
   npm run dev
   ```

2. 访问应用查看预测结果

### 修改预测算法

1. 打开文件 `src/App.jsx`
2. 找到对应的预测函数
3. 修改算法逻辑
4. 保存后自动热更新

### 添加新算法

1. 在 `LotteryPredictor` 组件内添加新函数
2. 函数签名：`const predictXX = (history) => { ... }`
3. 返回格式：数字数组 `[1, 2, 3, ...]`
4. 在 `calculateStatistics` 中注册新算法以启用统计

---

## 数据文件

- **历史数据**: `public/history.txt`
- **生肖数据**: `src/result.ts`

---

## 相关文件

- [App.jsx](file:///Users/yang/fe/fe/src/App.jsx) - 主预测组件
- [App_skills.md](file:///Users/yang/fe/fe/src/App_skills.md) - 技能清单文档
