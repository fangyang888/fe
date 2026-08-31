# 第 13 章：接入当前 AgentService、会话与 SSE

对应原文：第 39～42 节。

## 任务 1：增加 knowledge_query

在 `agent.intent.ts` 枚举加入 `knowledge_query`，并在 system prompt 增加清晰边界：政策、FAQ、说明书、配送和售后规则属于知识查询；库存、价格和个人订单仍使用业务意图。

补意图测试：

```text
“耳机退货规则是什么” → knowledge_query
“耳机现在还有几个”   → inventory_query
“我的订单能不能退”    → 混合问题，第一版不能只落到 knowledge_query
```

## 任务 2：固定路由

```ts
if (activeIntent === 'knowledge_query') {
  const scope = this.knowledgeScopeFactory.create(authUser);
  const answer = await this.knowledgeAnswerService.answer({
    question: message,
    conversationContext: { entities: mergedEntities },
    scope,
    signal: stream?.signal,
  });
  return mapKnowledgeAnswerToAgentDto(answer);
}
```

当前 `AgentService.chat()` 尚未接收 AuthUser，需要从 Controller/ApplicationService 到 AgentService 显式传递认证上下文。不能在深层 Service 偷读全局 request，也不能让 conversationId 代替用户身份。

## 任务 3：响应 DTO

```ts
type PublicCitation = {
  title: string;
  section: string;
  url: string | null;
  revision: number;
};

type RagResponseFields = {
  source: 'knowledge_rag';
  citations: PublicCitation[];
  insufficientEvidence: boolean;
  indexVersion: string;
};
```

## 任务 4：SSE 协议

增加事件但保持协议版本化：

```ts
| (BaseStreamEvent & {
    type: 'retrieval_finished';
    sourceCount: number;
  })
| (BaseStreamEvent & {
    type: 'assistant_final';
    content: string;
    citations: PublicCitation[];
    source: 'knowledge_rag' | 'intent_router' | 'agent';
  })
```

只展示“正在查询知识库”等安全状态。不要流出私有 Chunk、过滤 DSL、系统 Prompt 或未验证引用。最终事件用于校正流式草稿。

## 测试

- 知识意图一定调用 Search，不允许 Agent 跳过。
- 商品/库存既有路由不回归。
- JWT 用户可以传到 scope factory。
- AbortSignal 传递到检索和生成。
- 最终 citations 已验证，delta 阶段不附带未经验证引用。

## Gate 13

- [ ] 页面能显示回答、来源标题和章节。
- [ ] Stop 能中断仍支持取消的下游步骤。
- [ ] conversationId 不能读取其他用户知识范围。
- [ ] 混合问题尚未安全实现时明确转人工或走受控分支。

