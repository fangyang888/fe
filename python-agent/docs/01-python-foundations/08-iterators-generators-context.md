# 迭代器、生成器和上下文管理器

## 为什么Agent需要

SSE和模型流式输出不是一次返回完整内容，而是一段一段产生。生成器正适合描述这种过程。

```python
def words(text: str):
    for word in text.split():
        yield word
```

需要掌握可迭代对象、迭代器、`yield`、惰性计算和生成器结束。

上下文管理器使用`with`确保文件、数据库连接和锁即使异常也会正确释放。

```python
with open("data.json", encoding="utf-8") as file:
    content = file.read()
```

## 练习

写一个生成器，把长文本按固定长度切片；再写测试证明它不会丢字符。

## 验收

能够说明普通函数、生成器函数和异步生成器的区别，以及资源为什么必须在`finally`中清理。
