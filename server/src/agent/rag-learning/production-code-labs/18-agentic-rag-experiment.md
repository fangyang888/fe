# 第 18 章：Agentic RAG 与 LangGraph 对照实验

对应原文：第 4、40～41、55 节。

## 前置门槛

只有第 00～17 章全部通过后才做。它是实验分支，不替换稳定 2-Step 基线。

## 任务 1：安全 Retriever Tool

```ts
const SearchKnowledgeToolSchema = z.strictObject({
  query: z.string().trim().min(1).max(500),
});
```

Tool 不接受 tenantId、userId、visibility、indexName 或 topK。运行时从认证上下文注入 scope，并限制每轮最多 2 次检索。

## 任务 2：显式 LangGraph

```text
START
→ classify
→ retrieve
→ grade_evidence
   ├─ sufficient → answer
   ├─ retryable and attempts < 2 → rewrite → retrieve
   └─ insufficient → handoff
→ validate_citations
→ END
```

State 至少保存：query、scopeRef、attempts、retrieval、answer、citations、indexVersion。不要把原始密钥或完整用户对象写入 Checkpoint。

## 任务 3：有限循环

```ts
if (state.attempts >= 2) return 'handoff';
```

同时使用 LangGraph recursionLimit 和应用层 attempt 双保险。

## 任务 4：对照指标

```text
任务成功率
Hit/Recall
Groundedness
非法引用率
平均模型调用次数
P50/P95
Token 和成本
行为路径稳定性
安全用例
```

Agentic 只有在复杂问题质量显著提升且成本/安全可接受时保留。FAQ 和明确政策问题继续走 2-Step。

## Gate 18

- [ ] Agent 不能跳过知识问题的证据要求。
- [ ] 最大检索次数和总 deadline 生效。
- [ ] Scope 永远由运行时注入。
- [ ] 与 2-Step 使用同一 Dataset 的报告已完成。

