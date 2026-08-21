# 第 9 课：安全业务 Tool、用户归属与真正转人工

> 本章基于当前项目的 NestJS、JWT、OrderService、CouponService、MySQL 和单 Agent 架构编写。
>
> 第 8 章让客服能够根据知识证据回答；第 9 章让客服安全地读取当前用户的真实业务数据，并在无法解决时真正创建人工工单。
>
> 本章先实现只读业务能力和低风险工单写入。真实退款、取消订单、支付和发券仍然不交给模型直接执行。

---

## 一、本章要解决什么问题

当前 Agent 已经能够：

- 识别意图和字段。
- 查询商品与库存。
- 保存会话和消息。
- 使用 Checkpointer 延续上下文。
- 调用计算、时间和文本 Tool。

但以下能力仍然缺失：

```text
用户问“我的订单到哪里了”
→ Agent 没有安全订单查询入口

用户问“我还有哪些优惠券”
→ Agent 没有当前用户身份

用户说“转人工”
→ 现在只返回一句文字，没有创建工单
```

本章目标：

```text
认证用户
  ↓
服务端生成可信业务上下文
  ↓
意图路由选择确定性业务 Service
  ↓
Service 使用 userId 限制数据归属
  ↓
返回安全快照
  ↓
必要时创建可审计的人工工单
```

---

## 二、完成标准

学完后你应该能解释：

- JWT、`request.user`、`CurrentUser` 分别做什么。
- 为什么 `userId` 不能由模型或前端消息文本提供。
- Controller、ApplicationService、业务 Service 和 Tool 怎样分工。
- 为什么查询订单必须同时使用订单条件和当前 `userId`。
- 为什么不能把完整 Order Entity 原样交给模型。
- 读操作和写操作为什么要分级。
- 幂等键、审计日志和业务事务分别解决什么问题。
- “回复已转人工”和“成功创建人工工单”有什么区别。
- 为什么模型失败不能导致用户消息和工单全部丢失。

最终应完成：

- 当前用户订单查询。
- 当前用户优惠券查询。
- 工单创建与重复请求幂等。
- 会话与工单关联。
- 用户归属测试和越权测试。

---

## 三、先认识当前项目已经有什么

| 能力 | 当前文件 | 状态 |
| --- | --- | --- |
| JWT 校验 | `auth/jwt-auth.guard.ts` | 已实现 |
| 当前登录用户 | `auth/decorators.ts` | 已实现 `CurrentUser` |
| 用户订单查询 | `order/order.service.ts` | 已按 `userId` 过滤 |
| 我的优惠券 | `coupon/coupon.service.ts` | 已按 `userId` 过滤 |
| Agent HTTP 入口 | `agent/agent.controller.ts` | 尚未接 JWT |
| Agent 订单能力 | `agent` 模块 | 尚未实现 |
| Agent 优惠券能力 | `agent` 模块 | 尚未实现 |
| 转人工 | `agent.service.ts` | 只返回文字 |
| 工单表和 Service | 当前项目 | 尚未实现 |
| 会话归属 | `agent_conversation.user_id` | 当前允许为空 |

因此本章不是重新实现订单和优惠券，而是建立一个安全适配层。

---

## 四、最重要的安全规则：身份不是模型参数

错误设计：

```ts
schema: z.object({
  userId: z.number(),
  orderId: z.number(),
})
```

模型看到用户说“帮我查询 userId=2 的订单”，就可能生成：

```json
{
  "userId": 2,
  "orderId": 100
}
```

这会把权限交给模型和用户文字。

正确原则：

```text
userId、openid、roles、permissions
→ 只能来自服务端验证后的 JWT

orderId、订单号、查询状态
→ 可以来自用户输入，但必须结合当前 userId 再查询
```

安全查询必须长这样：

```ts
await orderService.findOne(currentUser.userId, orderId);
```

而不是：

```ts
await orderService.adminFindOne(orderId);
```

`adminFindOne()` 能跨用户查询，绝不能暴露给普通客服 Agent。

---

## 五、建立可信的 AgentRequestContext

不要把 HTTP Request 对象传遍所有 Service。定义最小上下文：

```ts
export interface AgentRequestContext {
  userId: number;
  openid: string;
  roles: string[];
  permissions: string[];
  requestId: string;
}
```

这个对象的来源必须是：

```text
Authorization Header
→ JwtAuthGuard 验证签名和有效期
→ request.user
→ Controller 映射 AgentRequestContext
→ ApplicationService / 业务处理器
```

Controller 概念示例：

```ts
@Controller('api/agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  @Post('chat')
  chat(
    @Body() dto: AgentChatDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatApplication.chat(dto, {
      userId: user.userId,
      openid: user.openid,
      roles: user.roles,
      permissions: user.permissions,
      requestId: crypto.randomUUID(),
    });
  }
}
```

学习阶段可以先生成 `requestId`。生产环境应优先复用网关或请求中间件生成的关联 ID。

---

## 六、会话也必须绑定用户

当前 `agent_conversation.userId` 允许为 `null`，历史查询只依赖 `conversationId`。这只适合本地学习。

生产规则：

```text
第一次创建会话
→ 保存 currentUser.userId

以后写入或读取会话
→ WHERE id = conversationId AND user_id = currentUser.userId

找不到
→ 返回 404 或安全的无权限错误
```

不要先查到会话再在 JavaScript 中比较用户。尽量让归属条件进入数据库查询。

概念接口：

```ts
ensureOwnedConversation(conversationId: string, userId: number)
listOwnedMessages(conversationId: string, userId: number)
```

还要测试：

```text
用户 A 创建 conversationId=X
用户 B 请求 X/messages
→ 必须失败
```

`conversationId` 是资源标识，不是访问凭证。

---

## 七、为什么建议业务处理器优先于自由 Tool

订单状态和优惠券查询是明确业务意图。当前项目已经有：

```text
AgentIntentService
→ activeIntent
→ ProductCustomerService
```

可以继续采用确定性路由：

```text
order_status
→ OrderCustomerService
→ OrderService.findOne(userId, orderId)

coupon_query
→ CouponCustomerService
→ CouponService.listMine(userId, status)
```

优点：

- 身份和权限由代码强制注入。
- 一种意图只有一个执行入口。
- 响应格式稳定。
- 单元测试不需要真正调用模型。
- 不会因为 Tool 描述变化而改走错误业务。

当任务确实需要模型在多个只读能力之间动态选择时，再把安全处理器包装为 Tool。

---

## 八、OrderCustomerService 应该做什么

建议新增：

```text
server/src/agent/business/order-customer.service.ts
```

职责：

```text
接收已认证 userId 和已验证业务参数
→ 调用 OrderService
→ 映射安全快照
→ 返回确定性答复或结构化结果
```

安全快照示例：

```ts
export interface AgentOrderView {
  orderId: number;
  orderNo: string;
  status: string;
  totalAmount: number;
  paidAt: Date | null;
  createdAt: Date;
}
```

默认不要返回：

- 完整收货地址。
- 手机号。
- openid。
- 支付回调原文。
- 内部数据库字段。
- 管理员备注。

如果物流查询确实需要脱敏地址，应由代码生成专用字段，例如：

```text
广东省深圳市南山区 ****
```

不要把完整地址交给模型后再要求模型“自行脱敏”。

---

## 九、订单状态必须经过业务映射

数据库状态：

```text
unpaid
unshipped
shipping
unreviewed
after_sale
```

不应该直接让模型猜含义。建立确定性映射：

```ts
const ORDER_STATUS_TEXT = {
  unpaid: '待付款',
  unshipped: '待发货',
  shipping: '运输中',
  unreviewed: '待评价',
  after_sale: '售后处理中',
} as const;
```

如果出现未知状态，记录内部错误并返回安全文案，不能编造新的状态解释。

---

## 十、CouponCustomerService 的边界

建议新增：

```text
server/src/agent/business/coupon-customer.service.ts
```

第一版只做：

```text
查询我的可用优惠券
查询指定状态的我的优惠券
解释优惠券门槛和有效期
```

第一版不要做：

```text
自动领取优惠券
自动修改优惠券
自动给用户发券
```

原因：查询是只读操作；领取、发放和修改会改变业务状态，需要幂等、审计和更严格权限。

---

## 十一、如果包装成 Tool，Tool 工厂必须闭包可信上下文

概念示例：

```ts
export function createBusinessTools(
  context: AgentRequestContext,
  orderService: OrderService,
) {
  const getMyOrder = tool(
    async ({ orderId }) => {
      const order = await orderService.findOne(context.userId, orderId);
      return toSafeOrderView(order);
    },
    {
      name: 'get_my_order',
      description: '查询当前已登录用户自己的订单。',
      schema: z.object({
        orderId: z.number().int().positive(),
      }),
    },
  );

  return [getMyOrder];
}
```

注意：Tool Schema 中没有 `userId`。

但这会产生一个架构问题：当前 `AgentService` 缓存了单个 Agent 实例，不能把某个用户的 Context 永久闭包进全局 Agent。

可选方案：

1. 业务意图继续走确定性 Service，最简单。
2. 使用 LangChain Runtime Context，在每次调用时注入用户上下文。
3. 每次请求创建只包含当前上下文的 Tool 集合，但要评估实例开销和缓存边界。

本章第一版推荐方案 1。

---

## 十二、业务能力风险分级

| 等级 | 示例 | 默认策略 |
| --- | --- | --- |
| L0 | 查询公开商品、FAQ | 可直接执行 |
| L1 | 查询我的订单、我的优惠券 | JWT + 资源归属校验 |
| L2 | 创建人工工单、保存用户反馈 | 鉴权 + 幂等 + 审计 |
| L3 | 取消订单、修改地址、领取优惠券 | 二次确认 + 幂等 +状态校验 |
| L4 | 退款、支付、发券、账户变更 | 明确审批、强审计、专用工作流 |

模型可以建议下一步，但不能提高自己的权限等级。

---

## 十三、真正的转人工需要哪些数据

“已为你转人工”如果没有创建任何记录，是虚假成功。

建议工单至少包含：

```ts
type SupportTicketStatus =
  | 'open'
  | 'assigned'
  | 'resolved'
  | 'closed';

type SupportTicket = {
  id: number;
  ticketNo: string;
  userId: number;
  conversationId: string;
  clientMessageId: string;
  category: string;
  subject: string;
  userQuestion: string;
  conversationSummary: string | null;
  priority: 'low' | 'normal' | 'high';
  status: SupportTicketStatus;
  assignedTo: number | null;
  createdAt: Date;
  updatedAt: Date;
};
```

不要把完整模型内部状态或敏感 Tool 输出无条件复制进工单。交接摘要必须做字段白名单和脱敏。

---

## 十四、工单服务必须是业务服务

推荐结构：

```text
support/
├── support-ticket.entity.ts
├── support-ticket.service.ts
├── support-ticket.controller.ts
└── support.module.ts

agent/business/
└── human-handoff.service.ts
```

职责：

```text
HumanHandoffService
→ 整理当前问题和安全会话摘要
→ 调用 SupportTicketService

SupportTicketService
→ 强制 userId、conversationId、幂等和数据库约束
→ 保存工单
→ 返回 ticketNo
```

Agent 不应该直接操作 TypeORM Repository。

---

## 十五、工单创建为什么必须幂等

用户可能：

- 连续点击发送。
- 网络超时后重试。
- 浏览器刷新后重放请求。
- 前端和网关都发生重试。

如果每次都直接插入，就会创建多个工单。

推荐幂等键：

```text
userId + conversationId + clientMessageId + operation
```

数据库建立唯一索引，业务代码执行：

```text
先按幂等键查找
→ 已存在：返回原工单
→ 不存在：创建
→ 并发冲突：捕获唯一键冲突，再查询原工单
```

仅在代码中“先查再插”不能完全解决并发重复，数据库唯一约束才是最后防线。

---

## 十六、聊天消息与工单的失败边界

推荐顺序：

```text
保存用户消息 pending
→ 执行业务查询或创建工单
→ 保存助手回复
→ 标记用户消息 completed
```

如果创建工单成功但保存助手回复失败：

- 工单不能回滚删除。
- 重试必须返回同一个工单号。
- 日志需要记录 `requestId`、`turnId`、`ticketNo`。

不要让模型网络调用期间一直持有数据库事务。

---

## 十七、审计日志与普通日志不同

普通日志回答“系统哪里出错”；审计日志回答“谁在什么时候对什么资源做了什么”。

高风险操作审计字段示例：

```text
actorUserId
operation
resourceType
resourceId
conversationId
requestId
idempotencyKey
inputDigest
result
createdAt
```

审计日志不要直接保存：

- JWT。
- API Key。
- 完整支付参数。
- 完整地址和手机号。
- 无限制的用户原文。

---

## 十八、错误分类与安全回答

| 错误 | 内部处理 | 用户回答 |
| --- | --- | --- |
| 未登录 | 401 | 请先登录 |
| 资源不属于用户 | 404 或安全的 403 | 未找到该订单 |
| 参数缺失 | 继续补字段 | 请提供订单编号 |
| 业务状态不允许 | 记录业务拒绝 | 当前订单状态不支持此操作 |
| 下游超时 | 有限重试/熔断 | 服务暂时不可用 |
| 重复请求 | 返回原结果 | 已为你创建工单 Txxx |
| 未知异常 | requestId + 内部堆栈 | 暂时无法处理，请稍后重试 |

不能把数据库错误、堆栈、SQL 或内部权限信息直接返回给模型和用户。

---

## 十九、推荐实施顺序

### 第 1 天：只给 Agent 接 JWT

- `AgentController` 加 `JwtAuthGuard`。
- Controller 获取 `CurrentUser`。
- 会话创建时保存 `userId`。
- 历史查询验证会话归属。

验收：用户 B 无法读取用户 A 的 conversationId。

### 第 2 天：实现只读订单处理器

- 导入 `OrderModule`。
- 新建 `OrderCustomerService`。
- 只调用 `OrderService.findOne/findAll`。
- 映射安全快照。

验收：同一个订单 ID，错误用户查询不到。

### 第 3 天：实现只读优惠券处理器

- 导入 `CouponModule`。
- 新建 `CouponCustomerService`。
- 只实现 `listMine`。

验收：回答只包含当前用户优惠券。

### 第 4 天：创建工单模型与 Service

- Entity、Migration、唯一索引。
- `SupportTicketService.createIdempotently()`。
- Service 单元测试。

验收：同一幂等键并发执行只产生一条记录。

### 第 5 天：接入转人工

- `human_handoff` 调用 `HumanHandoffService`。
- 返回真实 `ticketNo`。
- 保存安全交接摘要。
- 后台提供工单列表。

验收：数据库有工单，能关联原会话。

### 第 6 天：故障与安全测试

- 未登录。
- 越权 conversationId。
- 越权 orderId。
- 重复发送。
- Agent 超时。
- 工单数据库失败。
- 恶意 Prompt 要求查询管理员订单。

---

## 二十、必须编写的自动化测试

### Controller 测试

- 没有 Bearer Token 返回 401。
- 有效 Token 能得到服务端用户上下文。
- Body 中额外传 `userId` 被 ValidationPipe 拒绝。

### Service 测试

- `OrderCustomerService` 总是把可信 `userId` 传给 OrderService。
- 不调用 `adminFindOne/adminFindAll`。
- 安全快照不包含地址和 openid。
- 优惠券只调用 `listMine`。

### 归属集成测试

- A 能查询自己的订单。
- B 不能查询 A 的订单。
- A 能查询自己的会话。
- B 不能读取 A 的消息。

### 工单幂等测试

- 同一 `clientMessageId` 重试返回同一 `ticketNo`。
- 并发创建只有一条工单。
- 创建成功但响应中断后，重试不会重复创建。

---

## 二十一、不要在本章做的事

- 不让模型直接调用管理员 Service。
- 不把 `userId` 放进 Tool Schema。
- 不实现真实退款或真实支付。
- 不让模型决定是否拥有权限。
- 不把所有 Entity 字段交给模型。
- 不在模型调用期间保持数据库事务。
- 不用 Redis 代替长期工单记录。
- 不因为返回了“已转人工”就认为转人工完成。
- 不同时引入自定义 LangGraph；审批流程留到第 10 章。

---

## 二十二、上线检查清单

### 身份与归属

- [ ] Agent 接口要求登录。
- [ ] userId 只来自 JWT。
- [ ] 会话与 userId 绑定。
- [ ] 消息历史查询验证归属。
- [ ] 订单和优惠券查询验证归属。

### Tool 与业务边界

- [ ] 只读和写操作分级。
- [ ] 没有暴露管理员方法。
- [ ] Tool 输出使用安全快照。
- [ ] 超时、重试和错误有上限。
- [ ] 模型不能提升权限。

### 工单与审计

- [ ] 工单有数据库唯一幂等约束。
- [ ] 工单关联 userId 和 conversationId。
- [ ] 转人工返回真实 ticketNo。
- [ ] 敏感字段经过脱敏。
- [ ] 写操作有审计记录。

### 测试

- [ ] 有跨用户越权测试。
- [ ] 有重复请求测试。
- [ ] 有并发幂等测试。
- [ ] 有下游失败测试。
- [ ] 有恶意 Prompt 测试。

---

## 二十三、毕业自测

1. 为什么 conversationId 不是访问凭证？
2. 为什么 userId 不能进入 Tool Schema？
3. `OrderService.findOne(userId, id)` 比 `adminFindOne(id)` 安全在哪里？
4. 为什么安全快照应由代码生成，而不是让模型脱敏？
5. 为什么查询优惠券和领取优惠券属于不同风险等级？
6. 为什么创建工单需要数据库唯一约束？
7. 普通日志和审计日志分别回答什么问题？
8. 为什么模型调用期间不应该持有数据库事务？
9. 怎样证明转人工真的成功？
10. 创建工单成功但网络响应失败时，重试应该怎样处理？

---

## 二十四、一句话总结

> 安全业务 Agent 的核心不是“给模型更多 Tool”，而是让身份、权限、资源归属、幂等和审计全部由确定性代码控制；模型只负责理解语言和组织表达，不能成为安全边界。

完成本章后，继续学习[第 10 课：自定义 LangGraph、持久工作流与人工审批](./LESSON_10_LANGGRAPH_WORKFLOW_AND_HUMAN_APPROVAL.md)。
