# 异常、模块和包

## 异常

用异常表达“函数无法完成约定”，不要用异常代替普通业务分支。

```python
try:
    result = calculate(operation="divide", left=10, right=0)
except ValueError as exc:
    print(f"输入错误：{exc}")
```

掌握`try/except/else/finally`、异常链`raise ... from exc`、自定义异常和捕获边界。

## 模块与包

- 一个`.py`文件是模块。
- 包通常是包含`__init__.py`的目录。
- `src/python_agent`是正式包，`tests`是测试目录。
- 不要通过修改`sys.path`修复导入问题。

## 练习

把calculator和文本转换拆到两个模块；创建`ToolInputError`并保留原始异常原因。

## 验收

能够区分用户输入错误、依赖服务错误和程序错误，并知道异常应该在哪一层转换。
