# LangGraph Checkpoint

## 作用

Checkpoint使用稳定的`thread_id`保存Agent运行状态，使同一会话可以恢复上下文。当前项目中conversationId会映射为thread_id。

## 学习顺序

1. 先使用内存Checkpointer理解接口。
2. 测试同一thread延续、不同thread隔离。
3. 再接Redis Checkpointer和TTL。
4. 测试进程重启后的恢复。
5. 设计Checkpoint版本和清理策略。

Checkpoint不代替MySQL聊天历史：前者服务模型执行，后者服务页面恢复、审计和客服查询。

## 练习

分别创建两个conversationId，验证A记住自己的信息但B无法读到；再模拟Checkpoint缺失后的安全恢复。

## 验收

能解释thread_id、业务conversation和数据库message之间的关系，以及上下文无限增长的风险。
