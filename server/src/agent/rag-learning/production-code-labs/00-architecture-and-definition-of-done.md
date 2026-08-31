# 第 00 章：架构、边界与完成定义

对应原文：第 1～5、57～60 节。

## 目标

在写代码前定义真实业务边界、目标架构和上线标准，避免最后只得到一个无法鉴权和更新的 Demo。

## 任务 1：建立 ADR

新建未来代码文件：

```text
server/src/knowledge/adr/0001-production-rag.md
```

内容至少回答：

```markdown
# ADR 0001：商城客服生产 RAG

## Context
- 文档知识：政策、FAQ、说明书、公告。
- 实时事实：商品、库存、价格、订单仍走业务 Service。
- 当前系统：NestJS + MySQL + Redis + LangChain.js + SSE。

## Decision
- 知识问题使用固定 2-Step RAG。
- MySQL 保存文档生命周期；Elasticsearch 保存检索索引。
- Hybrid 使用 BM25 + dense vector + RRF。
- 权限在检索请求中 pre-filter。
- 引用由服务端 ID 白名单验证。

## Consequences
- 需要独立索引任务、评估集和发布流程。
- Elasticsearch 失败时知识问答受控失败或转人工。
- Agentic RAG 只有评估证明需要时才启用。
```

## 任务 2：增加知识意图，但先不实现

未来会在 `agent.intent.ts` 中增加：

```ts
export const CustomerIntentNameSchema = z.enum([
  // 现有意图……
  'knowledge_query',
]);
```

此时只记录设计，不要立即修改现有路由，避免出现意图已经可选但处理器尚不存在的半成品状态。

## 任务 3：定义完成标准

```ts
type ProductionRagDefinitionOfDone = {
  retrieval: {
    goldenCases: number; // >= 50
    hitRateAt5Gate: number;
    recallAt5Gate: number;
  };
  safety: {
    crossTenantLeaks: 0;
    invalidCitationsAccepted: 0;
    unauthorizedDraftHits: 0;
  };
  operations: {
    supportsRollback: true;
    recordsIndexVersion: true;
    propagatesAbortSignal: true;
  };
};
```

具体质量阈值要在有第一版基线后确定，安全类指标必须是零容忍，不能用平均分掩盖泄漏。

## 任务 4：准备问题路由表

建立 30 条问题，标记：

```ts
type ExpectedRoute =
  | 'knowledge_rag'
  | 'business_service'
  | 'conversation_state'
  | 'rag_and_business'
  | 'general_agent';
```

至少包含：

- “退货政策是什么？” → `knowledge_rag`
- “SKU-X 还有多少库存？” → `business_service`
- “刚才那款多久发货？” → `conversation_state` + 可能的知识/业务路由
- “我的订单是否符合退货政策？” → `rag_and_business`

## Gate 00

- [ ] 能画出离线索引和在线查询两条管道。
- [ ] 能解释为什么 MySQL 与 Elasticsearch 各自存在。
- [ ] 30 个问题的事实来源都已标注。
- [ ] 团队接受安全、质量、延迟和回滚是上线条件。

