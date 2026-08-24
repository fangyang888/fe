# 第5章：Redis与短期状态

目标：理解Redis适合保存什么、不适合保存什么，并实现可靠的会话状态。

1. [Redis数据结构与TTL](./01-data-structures-ttl.md)
2. [短期会话状态](./02-conversation-state.md)
3. [幂等、原子性和并发](./03-idempotency-concurrency.md)
4. [LangGraph Checkpoint](./04-langgraph-checkpoint.md)

通过标准：Redis重启或暂时不可用时，不丢失MySQL中的最终聊天历史，并有明确降级行为。
