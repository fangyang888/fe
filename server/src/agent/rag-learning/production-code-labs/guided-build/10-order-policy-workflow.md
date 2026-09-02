# 第 10 章：JWT、订单事实 + 退货政策

## 本章结果

安全处理：

```text
用户：我的订单 202608310001 到哪里了？
用户：那这个耳机订单还能退吗？
```

订单事实来自当前 JWT 用户的 OrderService；政策来自 RAG；最终资格由确定性规则判断。

## 第一步：先修认证链路

当前普通 `AgentController` 没有 Guard。若客服必须登录，修改：

```ts
@Controller('api/agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  @Post('chat')
  chat(
    @Body() dto: AgentChatDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatApplication.chat(dto, user);
  }
}
```

流式接口也增加 `@CurrentUser() user`，并把它传入 `streamApplication.stream()`。

然后逐层修改签名：

```text
AgentController
→ AgentChatApplicationService.chat(dto, user)
→ AgentService.chat(message, conversationId, context, stream?)
```

```ts
export type CustomerServiceContext = {
  /** JWT 验证后的当前用户 ID，所有个人订单查询必须使用它。 */
  userId: number;
  /** JWT 中可信的角色列表，用于客服功能路由和知识可见范围。 */
  roles: string[];
  /** JWT 中可信的权限点，不能由模型或请求 Body 增加。 */
  permissions: string[];
  /** 当前单商城的服务端知识租户常量，不接受客户端覆盖。 */
  knowledgeTenantId: 'default-shop';
};
```

## 第二步：订单号只读查询

在 `OrderService` 增加：

```ts
async findByOrderNoForUser(userId: number, orderNo: string) {
  const order = await this.orderRepo.findOne({ where: { userId, orderNo } });
  if (!order) throw new NotFoundException('订单不存在');
  return order;
}
```

归属条件必须进入 SQL。不要先全局查 orderNo，再在 Node.js 中判断 userId。

## 第三步：区分查询与申请

意图增加：

```text
order_status        → 只读订单状态
return_eligibility  → 只读判断是否满足退货条件
refund_request      → 写操作申请，本章不执行
```

## 第四步：结构化政策快照

自由文本适合解释，不适合直接驱动高风险判断。发布退货政策时同时生成并人工审核：

```ts
type ReturnPolicySnapshot = {
  /** 稳定政策 ID，用来关联结构化规则和可阅读政策文档。 */
  policyId: string;
  /** 当前规则快照的政策修订号，必须与引用文档一致。 */
  revision: number;
  /** 从付款/签收基准时间计算的允许退货天数。 */
  returnWindowDays: number;
  /** 业务规则允许申请退货的订单状态集合。 */
  allowedOrderStatuses: OrderStatus[];
  /** 明确不适用通用退货规则的商品分类。 */
  excludedCategories: string[];
  /** 必须由人工确认是否拆封或影响二次销售的商品分类。 */
  requiresSealInspectionCategories: string[];
};
```

Snapshot 与可阅读文档共享 policyId/revision。RAG 返回解释证据，规则引擎使用 Snapshot。

## 第五步：资格判断 Service

```ts
export type ReturnEligibilityInput = {
  /** 当前 JWT 对应的用户 ID；不得由请求 Body 指定。 */
  userId: number;
  /** 用户要咨询的订单号，读取时必须再次校验归属。 */
  orderNo: string;
  /** 服务端根据认证身份构造的政策知识读取边界。 */
  scope: KnowledgeScope;
  /** 由服务端注入的可信判断时间，测试中可固定。 */
  now: Date;
};

@Injectable()
export class ReturnEligibilityService {
  constructor(
    private readonly orders: OrderService,
    private readonly policies: ReturnPolicyRepository,
    private readonly knowledge: KnowledgeSearchPort,
  ) {}

  async decide(input: ReturnEligibilityInput): Promise<ReturnEligibilityDecision> {
    const order = await this.orders.findByOrderNoForUser(
      input.userId,
      input.orderNo,
    );
    const policy = await this.policies.getCurrent(input.now);
    const evidence = await this.knowledge.search({
      query: `${order.items.map((x) => x.name).join('、')} 退货政策`,
      scope: input.scope,
      topK: 6,
    });

    if (!order.paidAt) return notEligible('ORDER_NOT_PAID', order, evidence);
    if (!policy.allowedOrderStatuses.includes(order.status)) {
      return notEligible('ORDER_STATUS_NOT_ALLOWED', order, evidence);
    }
    if (daysBetween(order.paidAt, input.now) > policy.returnWindowDays) {
      return notEligible('RETURN_WINDOW_EXPIRED', order, evidence);
    }
    if (requiresSealInspection(order, policy)) {
      return humanReview('SEAL_STATUS_UNKNOWN', order, evidence);
    }
    return eligible(order, evidence);
  }
}
```

## 第六步：会话中的 orderNo

模型提取 orderNo 后，先调用 `findByOrderNoForUser()` 验证，再保存进会话状态。后续“那个订单”只能引用已经验证属于当前 userId 的订单。

## 安全测试

- 无 JWT 返回 401。
- 用户 A 查询用户 B orderNo 返回相同的 404，不泄露存在性。
- Body/Prompt 中提供 userId=B 没有效果。
- 通用 Agent 没有 `adminFindOne`、`updateStatus` 工具。
- 不确定是否拆封时 `eligible=null` 并转人工。

## Gate 10

- [ ] JWT 用户一路传到 OrderService。
- [ ] 订单查询是只读且数据库级归属过滤。
- [ ] 政策解释和业务判断使用相同 revision。
- [ ] 本章不执行退款、取消或状态修改。
