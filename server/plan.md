# /api/predictor/kill 优化空间分析与实施计划

经过对 `server/src/predictor/predictor.service.ts` 的深入分析，该服务目前在**逻辑准确性**、**时间复杂度（计算性能）**以及**内存管理**三个维度都存在显著的优化空间。

## 1. 致命逻辑缺陷：排斥分数完全失效 (Bug Fix)
在 `kill10WithRepulsion` 方法中，存在一个逻辑计算错误，导致跨期排斥规则（Repulsion）和 Apriori 规则在杀号排序中起到了**零作用**。
**当前代码：**
```typescript
const enhanced = baseNums.map(c => {
  const rBonus = ...
  const aBonus = ...
  return { ...c, w: c.w + rBonus + aBonus }; // 此时 w 已经被加上了 bonus
});
const reScored = enhanced.map(c => ({
  ...c,
  // 这里的 c.w 已经是加过 bonus 的值了，再减去 bonus，导致 w 完全变回了原始的 c.w！
  w: c.w - (repulsionScores[c.n] || 0) * repulsionWeight - (aprioriScores.scores[c.n] || 0) * aprioriWeight
}));
```
**影响：** 高级网格搜索出来的 `repulsionWeight` 等参数对最终排序结果没有任何影响。
**优化方案：** 直接基于原始 `baseNums` 进行一次映射，计算出正确的 `w`（降低权重 `w = c.w - bonus` 即可）。

## 2. 算法时间复杂度优化：消除大量 O(N^2) 级遍历 (性能提升百倍)
在网格搜索期间，`getAdaptiveKill10OptsInternal` 会组合 48 种参数并在过去的 50 期上进行循环验证。这会调用底层的 `buildScoreEngineWithOpts` `48 * 50 = 2400` 次。
**当前性能瓶颈：**
- **重复的历史遍历：** `buildScoreEngineWithOpts` 中为了获取每个号码的出现位置，采用了：
  ```typescript
  for (let n = 1; n <= 49; n++) {
    hist.forEach((row, idx) => { if (row.includes(n)) apps.push(idx); });
  }
  ```
  假设历史期数为 3000 期，每次调用需执行 `49 * 3000 = 14.7万` 次循环。总计执行约 3.5 亿次操作。
- **昂贵的数学运算：** 计算指数衰减权重使用了 `Math.pow(decay, age)`，在庞大循环中极为耗时。

**优化方案：**
- **建立全局倒排索引（Inverted Index）：** 只需要对历史数据遍历一次，建立一个 `allApps[1...49]` 数组，之后获取任何号码的 `apps` 只需 `O(1)` 时间。这能让引擎速度提升数倍以上。
- **逆向递推衰减权重：** 放弃 `Math.pow`，改用从后往前的 `for` 循环并通过 `w *= decay` 来累乘计算。

## 3. 内存泄漏风险：无界缓存 (Memory Management)
**当前情况：**
```typescript
private checkAndClearCache(currentHistLength: number) {
  if (currentHistLength < this.lastHistLength) { // 仅在长度变小时清理
    this.memoKill10.clear(); ...
  }
}
```
**风险：** 只有当数据库重置或数据减少时才会清空缓存。而在正常运行和尤其是回测期间（长度从 N-50 一直增长到 N），Map 会不断塞入新长度的 key，体积无限增长，导致潜在的内存泄漏。
**优化方案：** 引入简单的 LRU（最近最少使用）淘汰机制，或者在 Map 大小超过阈值（如 100）时自动修剪旧缓存，确保服务长期稳定运行。

## 4. 其它细微优化点
- `pickLowCVFromLastRow` 也可以复用预先计算好的 `apps` 数据结构，避免再次对全量历史记录发起遍历。
- 将 `any` 类型声明逐步替换为具体的接口类型，增加代码健壮性。

---

如果同意以上优化思路，我可以立即开始修改 `predictor.service.ts`！
