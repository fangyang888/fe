# 商城客服 RAG 实战主线

这条主线把 [生产级 RAG 代码实验课](../README.md) 的所有知识放进当前商城客服，而不是制作一个独立的 PDF 问答项目。

最终客服需要同时处理三种事实：

```text
知识事实：退货政策、配送说明、FAQ、商品说明书
→ KnowledgeAnswerService / RAG

实时事实：商品价格、库存、订单状态、购买时间
→ ProductService / OrderService

会话事实：用户刚才选择的商品、订单和未补全字段
→ AgentConversationService / Checkpointer
```

模型负责理解和表达，不负责创造业务事实、决定用户身份或执行未经批准的退款。

---

## 一、当前项目已经有什么

| 能力 | 当前代码 | 当前状态 |
| --- | --- | --- |
| 意图和实体提取 | `agent.intent.ts`、`agent.intent.service.ts` | 已有 Structured Output |
| 商品搜索/价格/库存 | `product-customer.service.ts` | 已连接真实 ProductService |
| 多轮补字段 | `conversation/` | 已有客服状态模型 |
| 历史消息 | `persistence/` | 已有 MySQL 历史链路 |
| Agent Checkpointer | `agent-checkpointer.service.ts` | 已有 Redis 方向 |
| SSE/取消 | `stream/`、`AgentChat.tsx` | 已有事件协议和 Abort |
| 订单事实 | `order/order.service.ts` | 已有，但尚未接入 Agent |
| 知识库/RAG | 尚无 `src/knowledge` | 本课程实现 |
| 真正人工工单 | 尚无 support ticket | 案例 05 实现 |

两个必须先承认的安全现状：

1. 当前公开 `AgentController` 没有使用 `JwtAuthGuard`，也没有向 `AgentService` 传递 `AuthUser`。因此不能直接加入“查询我的订单”。
2. 当前 `human_handoff` 只是返回提示文本，没有创建真实工单，不能对用户声称已经完成转人工。

---

## 二、六个连续客服案例

1. [案例 01：政策 FAQ 客服](./01-policy-faq.md)
2. [案例 02：商品实时事实 + 商品说明](./02-product-and-policy.md)
3. [案例 03：登录用户订单状态查询](./03-order-status.md)
4. [案例 04：我的订单是否符合退货条件](./04-return-eligibility.md)
5. [案例 05：证据不足时真正转人工](./05-human-handoff.md)
6. [案例 06：端到端 SSE、历史、观测与上线](./06-end-to-end-streaming.md)

案例之间有依赖，按顺序完成。

---

## 三、最终客服路由

```text
AgentController（JWT + DTO）
  ↓ AuthUser + message + conversationId + signal
AgentChatApplicationService
  ↓
AgentService / CustomerServiceRouter
  ├─ product_search / price / inventory
  │    → ProductCustomerService
  ├─ knowledge_query
  │    → KnowledgeCustomerService
  │       → 2-Step RAG + citations
  ├─ order_status
  │    → OrderCustomerService（只读、按 userId）
  ├─ return_eligibility
  │    → ReturnEligibilityService
  │       → OrderService 取得订单事实
  │       → KnowledgeSearchService 取得当前政策
  │       → 确定性规则判断/无法判断转人工
  ├─ human_handoff
  │    → SupportTicketService
  └─ general_chat
       → 现有 createAgent
```

这里的 `return_eligibility` 是混合业务流程，不是让通用 Agent 自由调用两个 Tool 后猜结论。

---

## 四、建议新增的客服用例层

```text
server/src/agent/customer-service/
├── customer-service-context.ts
├── order-customer.service.ts
├── return-eligibility.service.ts
├── support-ticket.service.ts
└── *.spec.ts

server/src/knowledge/
├── domain/
├── ingestion/
├── retrieval/
├── answer/
└── evaluation/
```

`AgentService` 继续只做路由，不把 Elasticsearch DSL、订单 SQL、政策 Prompt 和工单写入都堆进一个类。

---

## 五、认证上下文

当前 `AuthUser` 包含：

```ts
interface AuthUser {
  userId: number;
  openid: string;
  roles: string[];
  permissions: string[];
}
```

当前项目看起来是单商城，可以先由服务端配置固定：

```ts
type CustomerServiceContext = {
  userId: number;
  roles: string[];
  permissions: string[];
  knowledgeTenantId: 'default-shop';
};
```

不要为了 RAG 强行让客户端传 tenantId。如果以后产品真正演进为多商户，再把 tenantId 加入可信认证领域和数据库关系。

---

## 六、学习阶段与客服成果

| 完成代码实验 | 客服获得的能力 |
| --- | --- |
| 00～06 | 能检索“耳机拆封能否退货”的正确政策 Chunk |
| 07～10 | 政策可发布/回滚，能同时搜索编号和自然语言 |
| 11～12 | 能理解“那它能退吗”，并返回已验证来源 |
| 13 | 正式接入现有 Agent 路由和 SSE |
| 客服案例 03 | 登录用户能安全查询自己的订单 |
| 客服案例 04 | 用订单事实 + 当前政策解释退货资格 |
| 客服案例 05 | 无法回答时创建真实工单 |
| 14～17 | 有评估、安全、观测、灰度和回滚能力 |
| 18 | 用同一客服数据比较 Agentic RAG 是否值得采用 |

---

## 七、贯穿全程的测试对话

```text
1. “降噪耳机多少钱，还有货吗？”
   → ProductService，不能走 RAG

2. “耳机拆封后还能七天无理由吗？”
   → RAG，返回政策引用

3. “我的 202608310001 订单到哪了？”
   → OrderService，必须 JWT + userId 归属校验

4. “那这个订单还能退吗？”
   → 对话状态 + OrderService + RAG + 确定性资格规则

5. “知识库没写这种情况，帮我找人工。”
   → 创建 support_ticket，返回真实 ticketId
```

完成标准不是模型回复得像客服，而是每句话中的事实都能指出来自 ProductService、OrderService、会话状态、知识 Chunk 或工单记录中的哪一个。

