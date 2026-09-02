# 第 08 章：多轮 Query Rewrite 与 Agent 路由

## 本章结果

让客服理解：

```text
用户：我买的是降噪耳机。
用户：那它拆开还能退吗？
```

检索 Query 应变成“降噪耳机拆开后是否符合退货政策”，但权限和业务事实不能由改写模型决定。

## 第一步：增加知识意图

在 `agent.intent.ts` 增加：

```ts
'knowledge_query'
```

在意图 Prompt 增加：

```text
退货政策、配送说明、商品说明书、FAQ 返回 knowledge_query。
价格、库存和订单状态不属于 knowledge_query。
```

先补测试，确认已有 `price_query`、`inventory_query` 不回归。

## 第二步：结构化改写 Schema

```ts
const QueryRewriteSchema = z.object({
  standaloneQuery: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('补全多轮指代后的独立检索问题，不得增加用户未表达的事实'),
  requiresClarification: z
    .boolean()
    .describe('缺少唯一商品、订单或关键条件，无法安全改写时为 true'),
  clarificationQuestion: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .describe('需要澄清时向用户提出的一个问题，否则为 null'),
  usedEntityKeys: z
    .array(z.string().max(50))
    .max(10)
    .describe('改写时实际使用的可信会话实体字段名，用于调试和审计'),
});
```

## 第三步：先确定性补全

```ts
function deterministicRewrite(
  question: string,
  state: AgentConversationState,
): string | null {
  if (!/[它那个这款]/.test(question)) return question;
  const product = state.entities.productName?.trim();
  if (!product) return null;
  return question.replace(/[它那个这款]/g, product);
}
```

只有确定性失败时才调用改写模型。存在多个候选商品时询问用户，不猜。

## 第四步：固定知识路由

在 `AgentService` 构造函数注入 `KnowledgeAnswerService`。放在商品路由之后、通用 Agent 之前：

```ts
if (activeIntent === 'knowledge_query') {
  const standaloneQuery = await this.queryRewrite.rewrite({
    question: message,
    state,
  });
  if (standaloneQuery.requiresClarification) {
    return this.buildClarificationResponse(standaloneQuery);
  }

  const answer = await this.knowledgeAnswers.answer({
    question: standaloneQuery.standaloneQuery,
    scope: defaultCustomerScope,
    signal: stream?.signal,
  });
  return this.mapKnowledgeResponse(answer, activeIntent, mergedEntities);
}
```

知识问题不交给通用 `createAgent` 自由决定要不要检索。

## 第五步：扩展 Response DTO

```ts
export interface AgentChatResponseDto {
  // 现有字段……
  /** 本轮回答的处理来源，用于前端展示和历史审计。 */
  source: 'intent_router' | 'agent' | 'knowledge_rag';
  /** RAG 回答经过服务端验证后的公开引用；非知识回答可省略。 */
  citations?: PublicCitation[];
  /** 是否因为证据不足而拒答或请求用户补充信息。 */
  insufficientEvidence?: boolean;
  /** 本轮知识检索使用的索引版本；非知识回答可省略。 */
  indexVersion?: string;
}
```

历史 metadata 同步保存引用快照和 indexVersion。

## 测试重点

- “耳机退货规则”调用 KnowledgeAnswerService，不调用通用 Agent。
- “耳机多少钱”仍调用 ProductCustomerService。
- “那它能退吗”使用状态中的 productName。
- 状态没有唯一商品时返回澄清。
- Query Rewrite 输出的 `tenantId=B` 文本不能改变 scope。

## Gate 08

- [ ] 知识意图固定检索。
- [ ] 既有商品客服测试全部通过。
- [ ] 多轮改写有独立测试和评估 tag。
- [ ] `conversationId` 仍然不是身份或权限。
