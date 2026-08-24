# 条件、循环和推导式

## 知识点

- `if / elif / else`
- `for`和`while`
- `break`、`continue`
- `enumerate`、`zip`
- 列表、字典和集合推导式
- `match / case`

```python
def apply_operation(operation: str, left: float, right: float) -> float:
    match operation:
        case "add":
            return left + right
        case "multiply":
            return left * right
        case _:
            raise ValueError("不支持的运算")
```

## 学习重点

优先写清晰条件，不为了少写几行制造复杂推导式。业务分支很多时，先考虑拆函数或映射表。

## 练习

遍历消息列表，只保留`user`和`assistant`角色，并给每条消息增加从1开始的序号。

## 验收

能解释什么时候用`match`、什么时候用字典映射、什么时候拆成多个函数。
