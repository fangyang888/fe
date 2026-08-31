# 案例 04：我的订单是否符合退货条件

## 用户场景

```text
用户：我刚才那个耳机订单还能退吗？
```

这是完整客服 RAG 的核心实战：

```text
会话 State  → 找到刚才的 orderNo
OrderService→ 订单归属、状态、商品、付款时间
RAG         → 当前生效退货政策和耳机例外
业务规则代码→ 计算确定性条件
模型/模板   → 解释结论并引用政策
```

## 新意图

```ts
'return_eligibility'
```

不要与现有 `refund_request` 混为一谈：

```text
return_eligibility → 只读判断和解释
refund_request     → 写操作申请，后续需要审批/工单
```

## 领域输入

```ts
type ReturnEligibilityInput = {
  userId: number;
  orderNo: string;
  now: Date;
};

type ReturnEligibilityDecision = {
  eligible: boolean | null;
  reasonCodes: string[];
  orderFacts: {
    status: OrderStatus;
    paidAt: Date | null;
    productNames: string[];
  };
  policyEvidence: PublicCitation[];
  requiresHumanReview: boolean;
};
```

`eligible=null` 表示资料不足或必须人工判断，不强迫系统二选一。

## 确定性规则示例

```ts
if (!order.paidAt) return notEligible('ORDER_NOT_PAID');
if (order.status === 'closed') return notEligible('ORDER_CLOSED');
if (daysBetween(order.paidAt, now) > policy.returnWindowDays) {
  return notEligible('RETURN_WINDOW_EXPIRED');
}
if (policy.requiresSealInspection) {
  return humanReview('SEAL_STATUS_UNKNOWN');
}
```

关键政策参数不能只从自由文本让模型随意提取。可以把已审核政策同时发布为：

```text
给用户解释的文档 Chunk
给业务判断的结构化 policy snapshot
```

两者共享 revision，发布时做一致性校验。

## 多轮状态

把已验证的 orderNo 保存到确定性 `AgentConversationState`。模型只能建议实体，真正写入前验证订单属于当前 userId。

## Gate CS-04

- [ ] 用户 A 不能通过会话 orderNo 引用用户 B 订单。
- [ ] 结论中的订单事实来自 OrderService。
- [ ] 政策解释有当前 revision 引用。
- [ ] 无法确定“是否拆封”时转人工，不猜 eligible。
- [ ] 本流程只判断，不执行退款。

