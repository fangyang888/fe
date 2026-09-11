# 第 6 课：模块、包与多文件日志查询

你已经写过函数、读过 JSON，也用过断点。这一课把第 4 课的单文件程序拆开，学习如何让几个 Python 文件一起工作。建议花 60～90 分钟，边读边运行。

学完后，你应该能解释 `import`、`__init__.py`、`__main__.py` 和 `python -m`，并独立添加一个新模块。

## 1. 先运行，看看我们要做什么

打开终端执行：

```bash
cd /Users/yang/fe/fe/python-agent/examples/06_modules
uv run python -m log_search --keyword 超时
```

`uv` 会向上找到 `python-agent/pyproject.toml`，使用项目的 Python 环境。已有环境也可直接运行 `../../.venv/bin/python -m log_search --keyword 超时`。

预期输出：

```text
[
  "order-api 数据库连接超时",
  "order-api 支付请求超时"
]
找到 2 条日志
```

接下来所有终端命令都在 `examples/06_modules` 目录执行。先记住这个工作目录，后面会解释原因。

## 2. 为什么要拆文件

第 4 课的文件同时做了四件事：解析参数、读取文件、筛选日志、输出结果。
如果以后网页接口也要筛选日志，你希望它能直接调用筛选函数，而不用启动命令行程序。

本课已经准备好这些文件：

```text
06_modules/
├── README.md
└── log_search/
    ├── __init__.py      # 定义普通包，暂时只放说明
    ├── __main__.py      # 命令行入口：组织一次查询
    ├── reader.py        # 读取 JSON，校验数据
    ├── search.py        # 按关键词筛选
    └── data/
        └── logs.json   # 本地练习数据
```

调用过程：`__main__.py → reader.load_messages → search.search_messages → 打印结果`。
以后接入 Elasticsearch 时，可以替换读取数据的部分，继续复用筛选与输出代码。

## 3. 模块是什么：一个可以导入的 Python 文件

打开 [search.py](./log_search/search.py)：

```python
def search_messages(messages: list[str], keyword: str) -> list[str]:
    results: list[str] = []
    for message in messages:
        if keyword.casefold() in message.casefold():
            results.append(message)
    return results
```

逐行理解：

| 代码 | 含义 |
| --- | --- |
| `def search_messages(...)` | 定义函数，类似 JS 的 `function searchMessages(...)` |
| `messages: list[str]` | 参数期望是字符串列表，类似 TS 的 `string[]` |
| `keyword: str` | 关键词期望是字符串 |
| `-> list[str]` | 返回字符串列表；这是类型提示，不是运行时校验 |
| `results: list[str] = []` | 创建空列表，并标注元素类型 |
| `for message in messages` | 遍历每条消息 |
| `keyword.casefold() in message.casefold()` | 忽略大小写，判断是否包含关键词 |
| `results.append(message)` | 相当于 JS 的 `results.push(message)` |
| `return results` | 把结果交给调用者 |

`casefold()` 用于 Unicode 无大小写比较；对于这里的 ASCII 英文，效果类似 `toLowerCase()`。空关键词会匹配所有消息，因为空字符串包含在任意字符串中。

Python 不需要给函数写 `export`，其他模块可以通过名字导入它。先掌握普通函数导入就够了。[官方模块说明](https://docs.python.org/zh-cn/3.14/tutorial/modules.html)

## 4. import 怎么写：对照 JS

JS 的写法：

```javascript
import { searchMessages } from "./search.js";
```

本课在包内的写法：

```python
from .search import search_messages

results = search_messages(["连接超时", "登录成功"], "超时")
```

`.search` 中的点表示当前包。后面不写 `.py`，也不写文件路径的斜杠。

还有两种常用写法，以下都可以在本课工作目录的 Python 交互环境里使用：

```python
# 导入模块，再通过模块调用函数。
import log_search.search

print(log_search.search.search_messages(["连接超时"], "超时"))
```

```python
# 直接导入函数，后面用函数名调用。
from log_search.search import search_messages

print(search_messages(["连接超时"], "超时"))
```

`log_search.search` 是绝对导入，从可搜索到的顶层包开始定位；`.search` 是相对导入，需要知道当前属于哪个包。

实际试一下：

```bash
uv run python
```

看到 `>>>` 后输入以下代码（不要复制 `>>>`）：

```python
from log_search.search import search_messages
search_messages(["HTTP TIMEOUT", "登录成功"], "timeout")
```

预期返回 `['HTTP TIMEOUT']`。输入 `exit()` 回到终端。

`import` 不等于“执行搜索函数”。它先加载模块，函数调用时才执行函数体。不过，模块顶层的 `print()` 等语句在首次导入时会执行，所以读文件、请求接口这些动作应放进函数里，再明确调用。

## 5. 包是什么，两个特殊文件有什么区别

这里的 `log_search` 是组织多个模块的普通 Python 包。`__init__.py` 标记这个普通包，也可以放初始化代码；本课只放说明，保持导入简单。Python 还支持没有这个文件的命名空间包，当前练习不用它。

| 文件 | 什么时候使用 | 本课职责 |
| --- | --- | --- |
| `__init__.py` | 首次导入这个包时执行 | 只提供包说明 |
| `__main__.py` | 用 `python -m log_search` 启动包时执行 | 接收参数并调用查询函数 |

这两个文件都不是 `package.json`；项目依赖和构建配置在已有的 `pyproject.toml` 中。

## 6. 为什么用 python -m

```bash
uv run python -m log_search --keyword 登录
```

拆开来看：

| 部分 | 含义 |
| --- | --- |
| `uv run` | 使用项目环境运行命令 |
| `python` | 启动 Python 解释器 |
| `-m log_search` | 按包名查找并执行入口 |
| `--keyword 登录` | 传给我们程序的参数 |

本例把工作目录设在 `06_modules`，Python 可以在这里找到 `log_search` 文件夹。找到包后执行 `__main__.py`，并建立包上下文，因此 `.reader` 和 `.search` 能正确解析。[官方入口说明](https://docs.python.org/zh-cn/3.14/library/__main__.html)

不要用下面这条命令运行本课入口：

```bash
# 错误演示：直接运行文件缺少相对导入需要的包上下文。
uv run python log_search/__main__.py
```

它通常会报 `ImportError: attempted relative import with no known parent package`。修复方法是回到本课工作目录，用 `python -m log_search`。

`-m` 后面写点分隔的模块名，不写 `.py`；例如 `python -m log_search.search` 可以运行筛选模块，但它只定义函数，所以不会打印结果。

## 7. 看懂程序入口

打开 [__main__.py](./log_search/__main__.py)，先找到核心流程：

```python
messages = load_messages(args.file)
results = search_messages(messages, args.keyword)
```

第一行负责获得数据，第二行负责处理数据；`reader.py` 和 `search.py` 都不用知道参数从哪里来。

文件末尾是：

```python
if __name__ == "__main__":
    raise SystemExit(main())
```

`main` 只是我们起的普通函数名，Python 不会因为它叫 main 就自动调用。`__name__` 是 Python 设置的变量：作为入口执行时为 `"__main__"`，通过导入加载时通常为完整模块名。

因此，上面这段代码表示：只有作为入口运行时才调用 `main()`，再用返回值结束程序。0 表示成功，1 表示本例处理过的读取失败。它的用途类似 Node 的退出码。

试试：

```bash
uv run python -c "import log_search.__main__"
```

预期没有输出，也没有启动查询。`-c` 表示执行后面的 Python 代码字符串。这验证了导入与主动运行的区别。

## 8. 数据文件的路径与错误处理

[reader.py](./log_search/reader.py) 使用 `path.read_text()` 读取文本，再用 `json.loads()` 得到 Python 对象，最后检查是否为字符串列表。

读取失败时，它把异常交给入口处理：

```python
try:
    messages = load_messages(args.file)
except (OSError, ValueError) as error:
    print(f"读取失败：{error}")
    return 1
```

文件不存在、权限不足等读取错误属于 `OSError`；JSON 解码失败和我们主动抛出的数据格式错误可以由这里的 `ValueError` 捕获。

默认文件用 `Path(__file__).parent / "data/logs.json"` 定位：`__file__` 是当前模块文件路径，`.parent` 取目录，`/` 拼接路径。
用户显式传入 `--file my.json` 时，相对路径则是相对于终端工作目录。

依次验证：

```bash
uv run python -m log_search --keyword 登录
uv run python -m log_search --keyword timeout
uv run python -m log_search --keyword 不存在
uv run python -m log_search --file missing.json
uv run python -m log_search --help
```

前两条各找到 1 条；第三条找到 0 条并成功退出；第四条打印“读取失败”并以 1 退出；第五条显示帮助。

## 9. 跨文件断点调试

1. VS Code 打开整个 `/Users/yang/fe/fe` 仓库，并安装 Python、Python Debugger 扩展。
2. 打开本课 `log_search/__main__.py`，在 `results = search_messages(...)` 那行打断点。
3. 在“运行和调试”里选择 **Python 第6课：模块与包**，按 F5。
4. 暂停后查看 `messages`，它应该包含 4 条消息。
5. 按 F11 进入 `search.py`，查看 `keyword`，按 F10 逐步执行循环。
6. `return results` 执行后回到入口，继续运行会输出 2 条结果。

配置已经写在仓库根目录的 `.vscode/launch.json`，本课使用 `"module": "log_search"`，对应终端的 `-m log_search`；`cwd` 对应本课工作目录。
请选本课配置，之前的“调试当前文件”会按文件启动，不能用于这里的相对导入入口。

也可以在终端调试：

```bash
uv run python -m pdb -m log_search --keyword 超时
```

在 `(Pdb)` 后输入 `b log_search/search.py:5`，再输入 `c`。暂停后用 `p messages`、`p keyword` 查看参数，`n` 下一行，`q` 退出。

## 10. 自己动手：新增输出模块

先自己写，遇到困难再看下面的参考答案。

任务：新增 `formatter.py`，定义 `format_messages(messages: list[str]) -> str`，输出带序号的多行文本。然后在入口导入并调用它，替换原来的 JSON 输出。保留最后的“找到 N 条日志”。

要求：

- 筛选仍由 `search.py` 负责。
- `formatter.py` 返回字符串，由入口负责 `print()`。
- 空列表返回“没有匹配日志”。

<details>
<summary>完成后展开：参考答案</summary>

新建 `log_search/formatter.py`：

```python
def format_messages(messages: list[str]) -> str:
    if not messages:
        return "没有匹配日志"

    lines: list[str] = []
    for index, message in enumerate(messages, start=1):
        lines.append(f"{index}. {message}")
    return "\n".join(lines)
```

在 `__main__.py` 导入区加入：

```python
from .formatter import format_messages
```

把 `print(json.dumps(results, ensure_ascii=False, indent=2))` 替换成：

```python
print(format_messages(results))
```

删除入口中不再使用的 `import json`。`reader.py` 仍需要 json，不要删除它的导入。

默认运行应输出：

```text
1. order-api 数据库连接超时
2. order-api 支付请求超时
找到 2 条日志
```

`--keyword 不存在` 应输出“没有匹配日志”和“找到 0 条日志”。

</details>

## 11. 常见问题与检查

| 问题 | 原因与处理 |
| --- | --- |
| `No module named log_search` | 检查终端是否在 `examples/06_modules`；本课包没有安装成全局包 |
| `attempted relative import...` | 使用本课目录下的 `python -m log_search`，不要直接运行入口文件 |
| 导入成功却没有结果 | 导入定义不等于调用函数；确认执行了入口命令 |
| `json` 导入行为奇怪 | 不要把自己的文件命名为 `json.py`，避免遮蔽标准库 |
| 导入 `06_modules` 报语法错误 | 本课目录只是课程编号；普通 import 中的模块名应为合法标识符，使用 `log_search` |
| 出现 `__pycache__` 文件夹 | 这是自动生成的字节码缓存，通常无需处理，仓库已忽略 |

从本课目录运行代码检查：

```bash
uv run ruff check log_search
uv run ruff format --check log_search
```

完成标准：能独立添加 formatter，能解释相对导入为什么依赖包上下文，能在断点中跨文件查看参数，能分别验证正常结果、空结果与文件不存在。

下一课再学习结构化日志：把字符串升级为包含 service、level、message 的数据模型，学习类型提示与运行时校验的区别。
