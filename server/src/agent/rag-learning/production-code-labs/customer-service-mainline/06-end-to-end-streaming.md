# 案例 06：端到端 SSE、历史、观测与上线

## 完整对话

```text
用户：帮我看看降噪耳机价格和库存。
客服：ProductService 返回实时价格和库存。

用户：拆封能退吗？
客服：RAG 返回当前政策和引用。

用户：我的订单 202608310001 呢？
客服：OrderService 按 JWT userId 查询状态。

用户：那这个订单还能退吗？
客服：State + Order + Policy + 确定性规则，无法判断则转人工。
```

## SSE 阶段

```text
run_started
status: understanding
status: querying_product / querying_order / retrieving_knowledge
retrieval_finished（只包含安全数量和耗时）
status: answering
assistant_delta
assistant_final（含已验证 citations、source、indexVersion）
done
```

可以扩展当前 `status.stage`，但要升级前后端共享协议和契约测试，不能只改后端枚举。

## History Metadata

当前 `AgentChatApplicationService` 保存 metadata。RAG 后增加：

```ts
metadata: {
  source: result.source,
  intent: result.intent,
  entities: result.entities,
  indexVersion: result.indexVersion,
  citationSnapshots: result.citations,
  orderFactIds: result.orderFactIds,
  supportTicketId: result.supportTicketId,
}
```

不要保存完整向量、密钥或全部私有 Chunk。

## 客服级可观测字段

```text
runId
conversationId
authenticated userId 的安全 hash
route
product/order/knowledge 各阶段耗时
indexVersion
cited chunkId
insufficientEvidence
supportTicketId
cancelled/degraded/errorCode
```

## 端到端测试

- 非登录用户不能查询个人订单。
- 同一 conversation 能解析“那这个订单”。
- 页面 Stop 后下游不继续写成功回答。
- assistant_final 引用都能打开或显示安全标题。
- 历史恢复后仍能看到当时的引用 revision。
- 新政策 alias 发布后新对话使用新 indexVersion。
- 旧回答仍保留当时引用快照，不被新政策篡改。
- RAG/ES 不可用时知识问题转人工，不由通用 Agent 猜测。

## 最终上线 Gate

- [ ] 商品、订单、政策、会话四种事实来源严格分离。
- [ ] 个人数据全程基于 JWT 用户。
- [ ] 混合退货判断是受控流程，不是自由 Agent 猜测。
- [ ] 真正的工单创建、失败和幂等均已验证。
- [ ] 客服 Golden Dataset、安全测试、P95 和回滚演练全部达标。

