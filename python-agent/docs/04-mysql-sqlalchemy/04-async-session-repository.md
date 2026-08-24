# AsyncSession与Repository

## AsyncSession

Session是一次数据库工作单元，跟踪对象和事务。FastAPI通常每个请求创建一个AsyncSession，并在请求结束释放。

```python
async with session_factory() as session:
    async with session.begin():
        session.add(record)
```

不要让多个并发Task共享同一个AsyncSession，也不要把Session保存为全局变量。

## Repository

Repository提供有业务含义的方法，例如`get_messages`、`start_user_turn`、`complete_assistant_turn`。Service不应该散落SQLAlchemy查询细节。

## 练习

设计`ConversationRepository`和`MessageRepository`接口，使用fake实现先写Service测试，再接MySQL实现。

## 验收

能指出事务由哪一层开始、何时提交或回滚，并能在测试中替换Repository。
