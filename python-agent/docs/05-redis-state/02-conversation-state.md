# 短期会话状态

## 状态内容

当前多轮客服可能需要：`pending_intent`、`entities`、`missing_fields`、状态和最后活动时间。

状态合并必须遵守：

- 新消息明确提供的字段可以覆盖旧字段。
- 模型没有提到的字段不能凭空生成。
- 用户切换话题时清除不再相关的pending状态。
- 不同conversationId绝不能串线。

## 数据分层

- LangGraph Checkpoint：Agent运行状态和消息上下文。
- Redis业务状态：意图和缺失字段，带TTL。
- MySQL：长期会话、最终消息和审计事实。

## 练习

用纯Python写状态合并函数，覆盖补字段、换话题、过期和不同会话隔离。

## 验收

先通过纯函数测试，再接Redis；不能把合并规则藏在Redis命令里。
