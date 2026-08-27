# 第 10 章：BM25、Hybrid Search、RRF 与 Rerank

## 本章目标

理解 Dense Retrieval 的盲区，并根据评估结果组合关键词检索、排名融合和重排序，而不是盲目堆组件。

---

## 一、三类能力的分工

### Dense Retrieval

把查询和文档映射到向量空间，擅长语义、同义表达和自然语言改写。

### BM25 / Lexical Search

根据词项匹配、词频和稀有度排序，擅长：

- SKU、订单外的公开型号。
- 政策编号。
- 人名、产品名和罕见缩写。
- 必须精确出现的术语。

### Rerank

对已经召回的有限候选逐对判断“问题与证据是否真正相关”，负责排准，不负责在全库中找全。

正确顺序：

```text
Dense / BM25 负责召回
→ Fusion 合并排名
→ 去重
→ Rerank 精排少量候选
→ Context Selection
```

---

## 二、什么时候加入 Hybrid Search

先运行 Dense 基线。如果失败案例明显集中在：

- 精确政策编号。
- SKU 和产品型号。
- 专有名词。
- 中英文混合短词。

再加入 BM25。没有数据证明的情况下，不要仅因为“生产级”三个字就增加复杂度。

---

## 三、为什么不能直接相加原始 Score

Dense 和 BM25 的分数尺度、方向和分布可能完全不同：

```text
Dense score: 0.73
BM25 score: 12.4
```

直接相加会让数值尺度较大的系统主导结果，而且换模型后分布可能变化。

Reciprocal Rank Fusion（RRF）只使用排名：

```text
RRF(d) = Σ 1 / (k + rank_i(d))
```

其中 `rank_i(d)` 是文档在第 i 个结果列表中的名次，`k` 是平滑常数。

概念实现：

```ts
function rrfScore(ranks: number[], k = 60): number {
  return ranks.reduce((sum, rank) => sum + 1 / (k + rank), 0);
}
```

缺席某个列表的候选不贡献该列表分数。

---

## 四、候选去重

同一内容可能因为 overlap、多个版本或 Dense/BM25 双路召回而重复。

去重可以考虑：

- 相同 `chunkId` 直接合并。
- 相同 `contentHash` 合并。
- 同一文档相邻高度重复 Chunk 限制数量。
- 旧 revision 在过滤阶段排除。

合并时保留各阶段分数，便于排查：

```ts
scores: {
  dense?: number;
  lexical?: number;
  fusion?: number;
  rerank?: number;
}
```

---

## 五、Rerank 的正确位置

不要对全库文档逐一 Rerank，成本和延迟不可接受。

典型流程：

```text
Dense top 30 + BM25 top 30
→ RRF 和去重后约 40 条
→ Rerank 前 20 条
→ 最终上下文 4～8 条
```

具体数量必须通过评估确定，不是固定答案。

Reranker 失败时应有降级策略：

```text
Rerank 超时
→ 使用 RRF 排名继续
→ retrieval.degraded = true
→ 记录错误和阶段耗时
```

---

## 六、Parent-Child Retrieval

它解决一个矛盾：

```text
小 Chunk 更容易精确匹配
大 Chunk 更容易保留完整上下文
```

流程：

```text
用 child Chunk 检索
→ 找到 parentId
→ 展开较完整的 Parent
→ 去重和控制上下文预算
```

只有当评估显示“小片段搜到了但缺少条件/例外”时再加入。不要把整个父文档无限展开。

---

## 七、实验矩阵

使用同一套至少 50 条 Dataset 比较：

```text
Dense only
BM25 only
Dense + BM25 + RRF
Hybrid + Rerank
Hybrid + Rerank + Parent Expansion（确有需要时）
```

记录：

- Hit Rate@3/5。
- Recall@5/10。
- MRR 或 nDCG@10。
- 检索 P50/P95 延迟。
- Rerank 调用成本。
- 降级率。
- 具体失败标签。

---

## 八、测试清单

- 相同输入的 RRF 结果确定且可重复。
- Dense/BM25 重复候选正确合并。
- 精确编号问题在 Hybrid 后改善。
- Rerank 超时能降级。
- Parent 展开不会跨租户或带入旧版本。
- 最终上下文不超过预算。

## 验收标准

- 能解释召回、融合、精排的不同职责。
- 不直接相加不同搜索系统的原始分数。
- Hybrid/Rerank 的保留有评估数据支持。
- 能报告质量收益、延迟和成本代价。

通过后进入：[第 11 章：多轮查询改写与上下文工程](./11-query-rewrite-and-context-engineering.md)。

