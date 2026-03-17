---
name: kill-predictor
description: Implements KillPredictor for Hong Kong Mark Six lottery — predicts 10 numbers unlikely to appear next draw. Two files: App.jsx (综合杀码 predictKillNumbers + predictKillLastDigit) and KillPredictor.jsx (独立路由 /kill, 高置信4杀 strategyKill5 + 10杀 strategyAbsoluteSafe). Use when the user asks to add, update, debug, or extend the kill number prediction (杀码) feature in either file.
---

# KillPredictor Skill

## Overview

Two kill-number prediction functions live in `src/App.jsx`. Both take `history` (2D array, each row is 7 numbers 1-49) and return an array of 10 objects with attached metadata arrays.

---

## Function 1: `predictKillNumbers` (综合杀码)

**Location**: ~line 521 in `App.jsx`  
**State**: `killNumbers` / `setKillNumbers`

### Pipeline
1. Call `learnKillWeights(history)` → learned weights + success rates per strategy
2. Run sub-predictors: `predictK1`–`predictK5` (lines ~215–424), `predictN` (~line 153)
3. Add 3 extra strategies inline:
   - **consecutiveNums**: numbers appearing ≥2 consecutive periods
   - **hotNums**: 5-period frequency ≥3
   - **overlap2Period**: appeared in both last 2 rows
4. Vote/score via `addVotes(nums, weight, source, extraVotes)`
5. Sort: strategyCount ≥3 first, then by weight descending
6. Return `result[0..9]` with `.learnInfo` attached

### Return shape
```js
[
  { num, votes, weight, sources: string[], strategyCount },
  // ... 10 items
]
// plus:
result.learnInfo = { learned, weights, successRates, totalPeriods }
```

---

## Function 2: `predictKillLastDigit` (增强版 v3)

**Location**: ~line 639 in `App.jsx`  
**State**: `killLastDigit` / `setKillLastDigit`

### 10 Strategies (S1–S10)
| Key | Strategy |
|-----|----------|
| `lastRow` | S1: Numbers in last row |
| `consecutive` | S2: Appeared ≥2 consecutive periods |
| `hotFatigue` | S3: ≥3 times in last 5 rows |
| `recentRepeat` | S4: Appeared in both of last 2 rows |
| `gapPattern` | S5: Appeared within last 2 rows (not last row) |
| `sumZone` | S6: Sum-zone deviation (high avg→kill big, low avg→kill small) |
| `parityBias` | S7: Odd/even imbalance |
| `sizeZone` | S8: Zone overload (≥3 in a 10-number band) |
| `neighborExcl` | S9: ±1 neighbors of last row numbers |
| `freqDecay` | S10: High in earlier 5 but decaying in recent 5 |

### Pipeline
1. `learnWeights()` — backtests last 40 periods to compute per-strategy success rates & weights
2. Score all 49 numbers against each strategy
3. Sort: multi-strategy (strategyCount ≥2) first, then by score
4. `backtestRecent()` — validates last 5 periods for accuracy display
5. Return `result[0..9]` with `.analysisInfo` and `.learnInfo` attached

### Return shape
```js
[
  { num, score, sources: string[], strategyCount, reason },
  // ... 10 items
]
result.analysisInfo = { lastRowNums, avgNum, oddCount, zones }
result.learnInfo = { learned, weights, successRates, totalPeriods, backtestResults, avgAccuracy }
```

---

## Sub-predictors (used by predictKillNumbers)

| Function | Line | Method |
|----------|------|--------|
| `predictN` | ~153 | Statistical frequency analysis |
| `predictK1` | ~215 | Markov chain |
| `predictK2` | ~249 | Periodicity analysis |
| `predictK3` | ~299 | Consecutive exclusion |
| `predictK4` | ~334 | Difference back-calculation |
| `predictK5` | ~379 | Anti-co-occurrence |
| `learnKillWeights` | ~425 | Backtest weight learner for K1-K5+N+lastRow |

---

## Invocation (in handlePredict)

```js
// ~line 2521
const killNums = predictKillNumbers(history);
setKillNumbers(killNums);

const killDigitNums = predictKillLastDigit(history);
setKillLastDigit(killDigitNums);
```

---

## UI Rendering

- `killNumbers` renders at ~line 3486: red border card, 综合杀码推荐
- `killLastDigit` renders at ~line 3569: purple border card, 杀码推荐
- Green badge = 3+ strategies agree (killNumbers) or 2+ (killLastDigit)
- Blue/orange badge = avg accuracy %

---

## Adding a New Strategy

### To predictKillNumbers:
1. Compute candidate nums array
2. Call `addVotes(nums, weight, 'label', extraVotes)`
3. Update the algorithm explanation `<ul>` in the render section (~line 3540)

### To predictKillLastDigit:
1. Add key to `strategies` array in `learnWeights()`
2. Add backtest logic block (increment `totalCount.yourKey` / `successCount.yourKey`)
3. Add scoring block in `numberScores` map (check condition, add `weights.yourKey * multiplier`)
4. Add label entry in the `labels` object in the render section (~line 3620)

---

## Protection Rules
- Numbers with repeat rate ≥20% are protected from kill lists
- Minimum history required: `predictKillNumbers` needs ≥5 rows; `predictKillLastDigit` needs ≥15 rows

---

## KillPredictor.jsx (独立路由 /kill) — v7.1

**File**: `src/KillPredictor.jsx`  
**Route**: `/kill`

### Key Functions

| Function | Purpose |
|----------|---------|
| `strategyKill5` | 高置信4杀入口，调用 getAdaptiveOpts + killPredictWithOpts |
| `getAdaptiveOpts` | 162参数网格×20期回测找最优参数，useRef缓存每5期重学 |
| `killPredictWithOpts` | 马尔可夫(60%)+衰减冷度(40%)，保护集过滤后取最低4个 |
| `getMathProtect` | 热差值（动态学习top-6）+ 极值对称保护 |
| `getLearnedHotDeltas` | 历史60期回测学习最优差值，useRef缓存每10期重学 |
| `strategyAbsoluteSafe` | 10杀标准版，复用 buildScoreEngine + 尾数平衡 |
| `buildScoreEngine` | 指数衰减冷度 + 保护集（重复率/跳期率/周期回归）|
| `predictLikelyNumbers` | 预测下期可能出现的22个数字 |
| `runKillPrediction` | 主函数：回测+预测+交集计算，返回完整 result 对象 |

### result 对象结构
```js
{
  predictions,       // 10杀结果
  kill5Preds,        // 4杀结果 [{num, score, label, tier, evalScore}]
  highConfNums,      // 双算法交集（4杀∩10杀），置信度最高
  kill5Accuracy,     // 4杀回测准确率
  kill5PerfectRate,  // 4杀全中率
  kill5Backtest,     // 4杀回测明细（最近30期）
  kill8Numbers,      // kill5Preds 的简化格式（兼容旧UI）
  kill8Backtest,     // 同 kill5Backtest
  likelyNumbers,     // 22个可能出现的数字
  likelyBacktest,    // 可能出现数字的回测
  strategies,        // [{name, accuracy, total}]
  backtest,          // 10杀最近5期回测
  avgAccuracy,       // 10杀准确率
}
```

### v7.1 优化记录
1. `useRef` 持久化 `adaptiveCache`，修复每次 render 重置缓存问题
2. 双算法交集 `highConfNums`：`kill5Preds ∩ kill10Preds`，UI 红色高亮
3. 马尔可夫 `simCount < 5` 时自动降级 `overlapThresh`，减少噪声
4. `HOT_DELTAS` 由 `getLearnedHotDeltas` 动态学习（历史60期 top-6），替换硬编码 `[31,2,38,48]`

### 添加新保护策略
1. 在 `getMathProtect` 或 `buildScoreEngine` 的 `protect` 集合中添加条件
2. 若需要回测验证，参考 `getLearnedHotDeltas` 的模式：历史遍历→命中率→缓存
