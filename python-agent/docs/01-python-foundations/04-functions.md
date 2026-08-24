# 函数、参数和作用域

## 必须掌握

- 位置参数和关键字参数
- 默认参数
- 仅限关键字参数`*`
- `*args`与`**kwargs`
- 返回值和提前返回
- LEGB作用域
- 纯函数与副作用

```python
def calculate(*, operation: str, left: float, right: float) -> float:
    if operation == "divide" and right == 0:
        raise ValueError("除数不能为0")
    # 其余分支省略
    return left + right
```

Agent工具适合使用明确的关键字参数；调用代码更易读，也不容易把左右操作数传反。

## 练习

写`transform_text(*, operation, text)`，支持大写、小写、去首尾空格和反转。

## 验收

能解释参数绑定过程、默认参数何时创建，以及为什么业务函数应该尽量返回结果而不是直接打印。
