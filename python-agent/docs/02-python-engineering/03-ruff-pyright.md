# Ruff与Pyright

## Ruff

Ruff负责格式化、导入排序、常见错误和代码风格检查。

```bash
uv run ruff format .
uv run ruff check .
uv run ruff check --fix .
```

不要对不理解的规则直接全局忽略。先读错误信息，只在确有理由时使用局部`noqa`。

## Pyright

Pyright负责静态类型检查：未知属性、错误参数、可能为`None`、不完整返回值、`Any`扩散等。

```bash
uv run pyright
```

类型检查通过不代表程序逻辑正确，所以还需要测试；测试通过也不代表所有类型路径都安全，所以两者互补。

## 练习

故意制造未使用导入、错误参数类型和可能为`None`的访问，分别观察Ruff和Pyright报告，再正确修复。

## 验收

能根据报错定位到规则、文件和行号，不通过随意关闭检查来“修复”。
