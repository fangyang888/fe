# 变量、对象和基础类型

## 要理解的核心

Python变量是“名字”，对象才保存类型和值。`x = 1`是让名字`x`指向整数对象，不是在盒子里固定存入某种类型。

基础类型：`int`、`float`、`str`、`bool`、`None`。学习`type()`、`isinstance()`、类型转换、字符串格式化，以及`==`和`is`的区别。

```python
left = 125
right = 8
result = left * right
message = f"{left} × {right} = {result}"
```

## 必须避开的错误

- 用`is`比较字符串或数字；值比较应该使用`==`。
- 认为类型注解会自动阻止错误值进入函数。
- 忽略`bool`是`int`子类带来的边界行为。
- 金额使用`float`；以后金额应使用`Decimal`或数据库Decimal类型。

## 练习

写`describe_value(value)`，返回值、类型名以及它是否为`None`。覆盖整数、字符串、布尔值和`None`。

## 自测

1. `==`和`is`分别比较什么？
2. `None`为什么通常用`is None`判断？
3. 类型注解为什么不能替代Pydantic？

## 验收

能解释变量引用关系，并为练习写至少四个pytest测试。
