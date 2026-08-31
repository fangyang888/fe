# 案例 05：证据不足时真正转人工

## 用户场景

```text
用户：耳机已经拆封，但有间歇性杂音，政策没写这种情况，帮我找人工。
```

当前 `AgentService` 只返回“已记录人工客服请求”，实际上没有持久化工单。上线前必须让语言与真实状态一致。

## SupportTicket

```ts
@Entity('support_ticket')
export class SupportTicketEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'int' }) userId: number;
  @Column({ name: 'conversation_id', type: 'char', length: 36 }) conversationId: string;
  @Column({ name: 'order_no', nullable: true }) orderNo: string | null;
  @Column({ length: 50 }) category: string;
  @Column({ type: 'text' }) summary: string;
  @Column({ type: 'varchar', length: 30, default: 'open' }) status: 'open' | 'assigned' | 'resolved';
  @Column({ name: 'idempotency_key', unique: true }) idempotencyKey: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

## 创建服务

```ts
async createForCustomer(input: {
  userId: number;
  conversationId: string;
  clientMessageId: string;
  orderNo?: string;
  category: string;
  summary: string;
}) {
  if (input.orderNo) {
    await this.orders.findByOrderNoForUser(input.userId, input.orderNo);
  }
  return this.repo.save({
    ...input,
    idempotencyKey: `${input.userId}:${input.clientMessageId}`,
    status: 'open',
  });
}
```

摘要可以由模型生成，但必须限制长度、去除不必要敏感信息，并保存原 conversationId 供授权后的客服后台读取。

## 响应语义

只有数据库创建成功后才能回答：

```text
已创建人工客服工单 T-xxx，客服可以在授权后台查看本次会话摘要。
```

失败时回答“暂时无法创建工单”，不能声称已记录。

## Gate CS-05

- [ ] 重复请求通过 idempotencyKey 只创建一个工单。
- [ ] orderNo 经过当前 userId 归属校验。
- [ ] 工单创建失败不会返回成功文案。
- [ ] 后台读取工单有独立权限。
- [ ] RAG 证据不足可以明确触发人工分支。

