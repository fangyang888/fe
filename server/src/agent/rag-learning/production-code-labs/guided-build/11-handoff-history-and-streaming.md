# 第 11 章：真正转人工、历史与 SSE

## 本章结果

当 RAG 证据不足、政策冲突或必须人工检查时，真实创建工单；前端流式展示安全状态，并保存当时的引用快照。

## 第一步：SupportTicket Entity

```ts
@Entity('support_ticket')
@Unique(['idempotencyKey'])
export class SupportTicketEntity {
  /** 工单 UUID，创建成功后可返回给用户作为查询凭据。 */
  @PrimaryGeneratedColumn('uuid') id: string;
  /** 创建工单的认证用户 ID。 */
  @Column({ name: 'user_id', type: 'int' }) userId: number;
  /** 工单关联的客服会话 UUID，用于授权后台查看上下文。 */
  @Column({ name: 'conversation_id', type: 'char', length: 36 })
  conversationId: string;
  /** 可选的用户订单号；保存前必须验证订单归属于当前用户。 */
  @Column({ name: 'order_no', nullable: true }) orderNo: string | null;
  /** 工单业务分类，例如 policy_exception 或 quality_issue。 */
  @Column({ length: 50 }) category: string;
  /** 经过长度和隐私控制的客服问题摘要。 */
  @Column({ type: 'text' }) summary: string;
  /** 工单处理状态，不能由普通用户请求直接修改。 */
  @Column({ length: 30, default: 'open' }) status: 'open' | 'assigned' | 'resolved';
  /** 防止同一用户消息因重试重复创建工单的唯一键。 */
  @Column({ name: 'idempotency_key', length: 150 }) idempotencyKey: string;
  /** 工单首次持久化时间。 */
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

使用正式 TypeORM migration 创建表，不依赖 `synchronize`。

## 第二步：幂等创建

```ts
export type CreateSupportTicketInput = {
  /** 当前 JWT 对应的用户 ID；不得由请求 Body 直接信任。 */
  userId: number;
  /** 需要转人工的客服会话 UUID。 */
  conversationId: string;
  /** 前端为本条用户消息生成的稳定 ID，用于实现幂等。 */
  clientMessageId: string;
  /** 可选订单号；创建工单前必须验证其属于当前用户。 */
  orderNo: string | null;
  /** 受控的工单业务分类，生产代码应进一步收窄为枚举。 */
  category: string;
  /** 经过长度和隐私处理的问题摘要，不保存无关敏感信息。 */
  summary: string;
};

async createForCustomer(input: CreateSupportTicketInput) {
  if (input.orderNo) {
    await this.orders.findByOrderNoForUser(input.userId, input.orderNo);
  }
  const idempotencyKey = `${input.userId}:${input.clientMessageId}`;
  const existing = await this.repo.findOne({ where: { idempotencyKey } });
  if (existing) return existing;
  return this.repo.save({ ...input, idempotencyKey, status: 'open' });
}
```

生产上还需处理并发唯一键冲突：捕获 duplicate key 后重新读取，而不创建第二张工单。

## 第三步：修正 human_handoff 语义

当前代码直接回答“已记录”。改成：

```ts
const ticket = await this.supportTickets.createForCustomer(...);
return {
  reply: `已创建人工客服工单 ${ticket.id}。`,
  supportTicketId: ticket.id,
  source: 'intent_router',
  // 其他字段
};
```

数据库失败时不能返回成功文案。

## 第四步：SSE 协议升级

当前 `status.stage` 只有 understanding/tool/answering。增加客服阶段：

```ts
stage: z
  .enum([
    'understanding',
    'tool',
    'retrieving_knowledge',
    'querying_order',
    'creating_handoff',
    'answering',
  ])
  .describe('当前客服请求正在执行的安全、可公开进度阶段');
```

`assistant_final` 增加：

```ts
citations: z
  .array(PublicCitationSchema)
  .default([])
  .describe('最终回答使用且已经过服务端验证的公开引用'),
indexVersion: z
  .string()
  .nullable()
  .describe('生成知识回答时读取的索引版本；未使用 RAG 时为 null'),
supportTicketId: z
  .string()
  .uuid()
  .nullable()
  .describe('真实创建的人工客服工单 ID；未转人工时为 null'),
source: z
  .enum(['intent_router', 'agent', 'knowledge_rag'])
  .describe('最终回答由哪条受控客服路径产生'),
```

前后端协议和契约测试同时更新。流式 delta 不携带未验证引用，最终事件才给 citations。

## 第五步：历史 Metadata

在 `AgentChatApplicationService.completeAssistantTurn()` 中保存：

```ts
metadata: {
  source: result.source,
  intent: result.intent,
  entities: result.entities,
  indexVersion: result.indexVersion ?? null,
  citations: result.citations ?? [],
  supportTicketId: result.supportTicketId ?? null,
}
```

保存引用快照的原因：政策更新后仍能知道当时回答依据哪个 revision。

## 第六步：取消语义

客户端 Abort 后：

- 停止仍支持取消的模型/检索调用。
- 不保存成功的 assistant final。
- 已经成功创建的工单不能靠 Abort 回滚，应返回/恢复幂等结果。
- 不把取消当作模型失败重试。

## Gate 11

- [ ] 工单失败不会显示已创建。
- [ ] 重复 clientMessageId 只创建一个工单。
- [ ] SSE 最终引用全部验证。
- [ ] 历史保存 indexVersion、revision 和 ticketId。
- [ ] Stop 不会留下伪成功回答。
