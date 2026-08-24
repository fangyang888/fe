# asyncio异步编程

## 核心模型

异步适合等待网络、数据库和模型返回。它不会让CPU密集计算自动变快。

必须理解：

- coroutine是什么
- `async def`和`await`
- Task和事件循环
- `asyncio.gather`
- TaskGroup结构化并发
- 超时、取消和`CancelledError`
- 不在事件循环中执行长时间阻塞代码

```python
import asyncio

async def fetch_one() -> str:
    await asyncio.sleep(0.1)
    return "done"
```

## 关键规则

一个`AsyncSession`不能被多个并发任务随意共享；每个请求或任务应有清晰的Session生命周期。

## 练习

并发运行两个模拟工具，记录总时间；再增加超时并确认慢任务被取消。

## 验收

能解释“并发不等于并行”、漏写`await`会发生什么，以及取消时如何释放资源。
