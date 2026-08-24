# 综合练习：三个纯Python工具

## 目标

在接触LangChain之前，自己实现：

- `calculator`
- `transform_text`
- `get_current_time`

建议目录：

```text
src/python_agent/tools/
├── calculator.py
├── text.py
├── time.py
└── registry.py
```

## 功能要求

- calculator支持加减乘除，拒绝除0和非有限结果。
- transform_text支持uppercase、lowercase、trim、reverse，限制长度。
- get_current_time接受IANA时区名称，错误时返回明确异常。
- registry拒绝重复工具名和未知工具。

## 测试要求

- 每个正常分支。
- 边界值。
- 非法operation。
- 除0。
- 空文本和超长文本。
- 非法时区。

## 最终验收

关闭TypeScript源码后，能从需求重新写出实现；`ruff`、`pyright`、`pytest`全部通过。
