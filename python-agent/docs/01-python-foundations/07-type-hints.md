# 类型注解

## 目标

类型注解让编辑器、Pyright和读代码的人理解函数契约，但运行时默认不会强制执行。

需要掌握：

- `str | None`
- `list[str]`、`dict[str, object]`
- `Literal`、`TypedDict`
- `Callable`、`Awaitable`
- `Protocol`
- 类型缩小和`isinstance`

```python
from typing import Literal

Operation = Literal["add", "subtract", "multiply", "divide"]

def calculate(operation: Operation, left: float, right: float) -> float:
    ...
```

## 练习

为前三个工具补齐严格类型，使Pyright不出现`Any`泄漏和未知成员错误。

## 验收

能够解释类型检查和运行时验证的边界，并理解为什么`Any`会让错误继续传播。
