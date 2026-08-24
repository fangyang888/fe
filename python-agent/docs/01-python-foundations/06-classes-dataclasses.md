# 类、组合和dataclass

## 核心概念

类把数据和行为组织在一起。业务系统优先组合，不要建立很深的继承树。

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class ToolResult:
    name: str
    content: str
    duration_ms: int
```

学习实例属性、类属性、`__init__`、实例方法、`@classmethod`、`@staticmethod`、属性、组合和不可变dataclass。

## dataclass与Pydantic

- dataclass：程序内部数据，轻量，不负责外部数据验证。
- Pydantic：HTTP、模型输出、Redis或第三方数据等不可信边界。

## 练习

设计`ToolRegistry`，可以注册工具、按名称获取工具并拒绝重复名称。

## 验收

能够解释“继承是什么”和“为什么当前场景更适合组合”，并为重复注册写异常测试。
