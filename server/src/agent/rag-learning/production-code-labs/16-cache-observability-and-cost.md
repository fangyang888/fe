# 第 16 章：缓存、可观测性、超时、降级与成本

对应原文：第 45～46、51～52 节。

## 任务 1：阶段耗时

```ts
type RagTrace = {
  runId: string;
  tenantScopeHash: string;
  indexVersion: string;
  embeddingVersion: string;
  retrievalConfigVersion: string;
  candidateCount: number;
  contextCount: number;
  citedChunkIds: string[];
  insufficientEvidence: boolean;
  degraded: boolean;
  timings: RetrievalResult['timings'] & { generationMs: number };
  usage: { inputTokens?: number; outputTokens?: number };
};
```

不要记录 API Key、Cookie、完整订单、未脱敏问题和全部私有 Chunk。

## 任务 2：缓存键

```ts
function retrievalCacheKey(input: {
  scopeHash: string;
  normalizedQueryHash: string;
  indexVersion: string;
  retrievalConfigVersion: string;
}) {
  return `rag:retrieval:${sha256(JSON.stringify(input))}`;
}
```

只有 query 的全局缓存会造成旧政策和跨租户泄漏。alias 切换后 indexVersion 改变，自然绕开旧缓存。

## 任务 3：Deadline 与 Abort

```ts
function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new Error('aborted');
}
```

在 Query Rewrite、Embedding、ES、Rerank 和生成阶段边界调用，并尽可能把 signal 传到底层 SDK。整体 deadline 到达后不保存完整成功回答。

## 任务 4：降级矩阵

```text
Rewrite 失败 → 原问题检索
BM25 失败   → Dense only，保留相同 Filter
Dense 失败  → BM25 only，保留相同 Filter
Rerank 超时 → RRF 排名
生成失败    → 受控失败/人工，不伪造答案
ES 不可用   → 知识问题 503/转人工，不让通用 Agent 猜政策
```

每次降级设置 `degraded=true` 并记录阶段错误码。

## 任务 5：关键指标

```text
rag_request_total{result}
rag_retrieval_duration_ms{stage}
rag_candidate_count
rag_insufficient_total
rag_degraded_total{stage}
rag_invalid_citation_total
rag_index_job_total{status}
rag_embedding_tokens_total
rag_generation_tokens_total
```

避免把 tenantId、userId、query 作为高基数/敏感 metric label。

## Gate 16

- [ ] runId 能串起 SSE、检索、生成和最终引用。
- [ ] 能定位 P95 慢在 Embedding、ES、Rerank 还是生成。
- [ ] 缓存不会跨 scope/indexVersion。
- [ ] 每种降级都有测试且不削弱权限。

