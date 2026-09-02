# 第 12 章：Hybrid、Rerank、Parent-Child 与高级检索

## 本章定位

到这里你已经会做可信客服 RAG。本章不是堆“高级名词”，而是学习怎样根据失败数据选择技术，这才是从会用到精通的分界线。

## 一、建立 Dense Baseline

固定第 07 章 Dataset，保存：

```text
Hit@3 / Recall@5 / MRR
exact_code 标签成绩
synonym 标签成绩
exception 标签成绩
P50/P95
```

没有 Baseline，后续优化无法证明有效。

## 二、BM25 解决精确词

当 `POLICY-2026-08`、SKU 和专有名词失败时增加 LexicalSearchPort：

```ts
export type LexicalSearchInput = {
  /** 需要进行关键词检索的独立查询文本。 */
  query: string;
  /** 服务端根据认证身份构造的知识读取边界。 */
  scope: KnowledgeScope;
  /** 过滤和排序后最多返回的关键词候选数量。 */
  topK: number;
};

export type LexicalSearchHit = {
  /** 命中的稳定知识 Chunk ID，用于与 Dense 结果去重融合。 */
  chunkId: string;
  /** 仅在关键词结果内部有意义的相关性分数，不与余弦分数直接相加。 */
  score: number;
};

export abstract class LexicalSearchPort {
  /** 在可信 Scope 内执行关键词检索。 */
  abstract search(input: LexicalSearchInput): Promise<LexicalSearchHit[]>;
}
```

学习阶段可以使用轻量本地 BM25 库或自己实现小数据版本，但业务层只依赖 Port。不要把 BM25 score 与 cosine score 直接相加。

## 三、RRF 融合排名

```ts
export function reciprocalRankFusion(
  rankings: string[][],
  rankConstant = 60,
) {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      const contribution = 1 / (rankConstant + index + 1);
      scores.set(id, (scores.get(id) ?? 0) + contribution);
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}
```

测试：同一 Chunk 在 Dense 第 2、BM25 第 1，应高于只在一路第 1 的候选；并验证结果确定。

## 四、Rerank 只负责排准

```text
Dense top 20 + BM25 top 20
→ RRF 去重约 25～35
→ Rerank 前 15
→ 最终上下文 4～6
```

定义 `RerankPort`，第一版用 Noop Adapter。只有“正确证据已在候选中但总排后面”时接真实 Reranker。

必须记录质量收益、P95 和调用成本。Rerank 超时降级到 RRF，不取消权限过滤。

## 五、Parent-Child 解决上下文不完整

症状：Child 命中了“七天”，但没带同章节的“已拆封例外”。

```text
Child 用于检索
→ 根据 parentId 加载完整章节
→ 再检查 tenant/status/time
→ 去重
→ 控制上下文预算
```

不是把整篇文档无上限展开。

## 六、Multi-Query 与 Query Decomposition

Multi-Query 适合同一意图多种表达；Query Decomposition 适合“能不能退、多久到账”两个子问题。限制最多 2～3 个子 Query，并记录总调用和去重。

HyDE 可能把模型猜测带进检索方向，不作为默认方案。

## 七、Embedding 对照

在相同 Chunk、相同 Dataset 下比较 small/large 或兼容服务模型。记录维度、索引体积、质量和成本。更换模型必须重建索引，不能混用空间。

## 八、VectorStore 替换实验

MemoryVectorStore 只用于学习。选任意持久化方案时，实现同一个 `KnowledgeSearchPort`，使用完全相同 Dataset 和安全用例验收。

精通要求不是会某个数据库 API，而是：

- 能解释 ANN/HNSW 的召回与延迟取舍。
- 知道过滤应在候选搜索前生效。
- 知道 Score 定义随实现变化。
- 能完成 Embedding 蓝绿迁移。
- 上层 Answer/Agent 不因存储替换而重写。

## Gate 12

- [ ] 每个新增组件都对应明确失败标签。
- [ ] Hybrid 与 Dense 使用同一 Dataset 对照。
- [ ] 不直接相加两种原始 Score。
- [ ] Rerank、Parent-Child、Multi-Query 都有启用条件和降级。
- [ ] 能替换 VectorStore 而不改客服业务层。
