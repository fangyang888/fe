# Redis数据结构与TTL

## 选择数据结构

- String：缓存结果、锁和值较小的JSON。
- Hash：会话多个字段。
- Set：唯一成员集合。
- Sorted Set：按分值排序的队列或时间线。
- List/Stream：特定队列和事件场景，不能未经设计就当消息总线。

## TTL

短期状态必须设置过期时间，读取时是否刷新TTL要按业务决定。没有TTL的临时key会持续占用内存。

Key需要命名空间，例如：`agent:conversation:{id}:state`，避免与其他系统冲突。

## 练习

设计会话状态Key、Checkpoint Key和幂等Key，记录类型、TTL、写入方、读取方和删除时机。

## 验收

能说明为什么聊天历史不能只放Redis，以及缓存失效后应从哪里恢复。
