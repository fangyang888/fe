# 从 JS / Node 开始学 Python

先按 01 → 05 的顺序运行、修改、调试。全部使用本地模拟日志，无需 ELK、数据库或 API Key。
每天学一个例子：先猜输出，运行验证，再完成文件末尾的练习。

前 5 课完成后，继续 [第 6 课：模块、包与多文件日志查询](./06_modules/README.md)。

## 工具与版本

本项目采用 Python 3.14、uv、Ruff 和 Pyright；VS Code 使用 Python Debugger（debugpy）。
截至 2026-09-07，Python 官网的最新稳定版本为 3.14.7，3.15 尚处于预发布阶段。
本机已有 Python 3.14.5 和 uv 0.12.5，这些例子可以直接使用现有环境，不要求更新补丁版本。

| Node / TS 中的概念 | 这里的对应工具 |
| --- | --- |
| Node 运行时 | Python 3.14 |
| package.json | pyproject.toml |
| pnpm-lock.yaml | uv.lock |
| 安装项目依赖 | uv sync --locked |
| node demo.js | uv run python demo.py |
| 项目的隔离运行环境 | .venv（包含 Python 解释器与依赖） |
| ESLint / Prettier | Ruff |
| tsc 类型检查 | Pyright |
| JS 断点调试器 | Python Debugger |

`uv run` 会选用项目环境，不用先手动激活 `.venv`。这些脚本本身只用 Python 标准库。
不要提交 `.venv`；项目已经忽略它。

## 先运行第一个例子

在终端粘贴：

```bash
cd /Users/yang/fe/fe/python-agent
uv sync --locked
uv run python examples/01_variables.py
```

预期输出：

```text
服务：order-api
级别：ERROR
耗时：1500 毫秒
发现错误日志
请求较慢
检查结束
```

打开 `01_variables.py`，把 `level` 改成 `INFO`，保存并重新执行最后一条命令。
你应该看到“无需告警”。运行脚本不会自动监听修改，保存后需要重新运行。

如果 `uv` 不在 PATH，但本机已安装，可用 `/Users/yang/.local/bin/uv --version` 检查。
如果尚未准备依赖，也可以用现有环境直接运行：

```bash
.venv/bin/python examples/01_variables.py
```

## 每个例子怎么学

| 文件 | 重点 | 验收与关键输出 |
| --- | --- | --- |
| [01_variables.py](./01_variables.py) | 赋值、True/None、f-string、缩进、if | 改变量后能解释哪个分支执行 |
| [02_collections.py](./02_collections.py) | list/dict、索引、for、append、get | 3 条日志中找出 2 条 ERROR |
| [03_functions.py](./03_functions.py) | def、参数、return、类型提示、main | 输出 `['数据库连接超时']` 和 `True` |
| [04_json_cli.py](./04_json_cli.py) | import、Path、JSON、参数、异常 | 默认找到 2 条超时日志；文件不存在时解释原因 |
| [05_debugging.py](./05_debugging.py) | 断点、单步、观察变量 | 故意输出实际 3 / 预期 2，自己修好计数 |

依次运行（终端仍在 `python-agent` 目录）：

```bash
uv run python examples/02_collections.py
uv run python examples/03_functions.py
uv run python examples/04_json_cli.py
uv run python examples/04_json_cli.py --keyword 登录
uv run python examples/04_json_cli.py --keyword timeout
uv run python examples/04_json_cli.py --keyword 不存在
uv run python examples/04_json_cli.py --file missing.json
uv run python examples/04_json_cli.py --help
uv run python examples/05_debugging.py
```

搜索“登录”和 `timeout` 各返回 1 条；“不存在”返回 0 条，这是正常结果。
`missing.json` 那条命令故意触发失败，输出“读取失败”，退出码为 1。
读 JSON 的文件路径相对于脚本计算，所以不会因为运行目录变化找不到自带数据。
显式传入 `--file` 的相对路径则相对于终端工作目录。

## VS Code 断点调试

1. 用 VS Code 打开整个 `/Users/yang/fe/fe` 文件夹。调试配置位于仓库根目录的 `.vscode/launch.json`。
2. 在扩展页安装 Microsoft 的 **Python** 和 **Python Debugger**；Pylance 用于类型提示，Ruff 用于检查与格式化。仓库已加入推荐列表。
3. 命令面板执行 `Python: Select Interpreter`，选择或输入 `/Users/yang/fe/fe/python-agent/.venv/bin/python`。
4. 打开 `examples/01_variables.py`，点击 `if level == "ERROR" and enabled:` 左边的行号边缘，出现红点。
5. 左侧“运行和调试”选择 **Python 入门：调试当前文件**，按 F5（部分 Mac 键盘需要 Fn+F5）。
6. 黄色高亮表示“即将执行”的行，左侧 VARIABLES 查看 `service`、`level` 和 `duration_ms`。
7. 按 F10 执行一行，观察程序走入哪个分支。结果输出在下方 Terminal。

| 操作 | 快捷键 | 用途 |
| --- | --- | --- |
| 继续 | F5 | 运行到下一个断点或结束 |
| 单步跳过 | F10 | 执行当前行，不进入函数内部 |
| 单步进入 | F11 | 进入自己写的函数 |
| 单步跳出 | Shift+F11 | 执行完当前函数，返回调用处 |
| 停止 | Shift+F5 | 结束本次调试 |

在第 3 课的 `result = find_messages(...)` 打断点，F11 进入函数。
在 DEBUG CONSOLE 中输入 `messages` 或 `len(messages)` 查看表达式。
变量只能在当前作用域查看：进入 `contains_keyword` 后查看的是 `message` 和 `keyword`。

要调试带参数的第 4 课，选择 **Python 入门：日志搜索（带参数）**。
在 `.vscode/launch.json` 中修改 `args` 的关键词；数组每一项代表一个命令行参数。
不要在 JSON 内复制完整的 shell 命令。

“调试当前文件”会运行当前编辑器里的文件，请先选中 `.py` 文件再按 F5。
若只打开了 `python-agent` 子目录，请重新打开整个 `fe` 仓库，才能使用这份根目录配置。
运行成功但没有停住时，检查红点是否打在实际执行的代码行，而不是注释或空行。

## 不使用编辑器也能调试

Python 自带 pdb，无需安装插件：

```bash
uv run python -m pdb examples/05_debugging.py
```

进入 `(Pdb)` 提示符后，依次输入：

```text
b count_errors
c
n
n
p level
p count
n
p count
q
```

`b` 设置断点，`c` 继续，`n` 下一行，`p` 查看变量，`q` 退出。
也可以在代码里临时添加 `breakpoint()`，普通运行就会在那一行进入 pdb；练完删掉。

## 第 5 课调试任务

`count += 1` 在每次循环都执行，因此 INFO 也被计数了。
在这行打断点，按 F5 看三轮循环的 `level`，确认问题后自己添加 `if`。
修复后应输出实际 2；再把 levels 改为 `[]` 和 `["INFO"]`，都应输出实际 0。
“预期错误数：2”是初始数据的演示文案，改数据时也要更新预期。

## 写完如何检查

```bash
uv run ruff check examples
uv run ruff format --check examples
```

检查不通过时先读提示；需要自动排版就运行 `uv run ruff format examples`。
第 5 课的逻辑错误不会被格式检查发现，需要你观察数据与预期结果。
项目的严格 Pyright 检查目前覆盖 `src` 和 `tests`；入门例子暂不纳入严格类型检查。

能独立完成筛选函数、读取文件和断点调试后，再把第 4 课的数据来源替换成 Elasticsearch 查询。

## 官方资料

- [Python 版本状态与下载](https://www.python.org/downloads/)
- [uv 项目运行方式](https://docs.astral.sh/uv/guides/projects/)
- [VS Code Python 调试](https://code.visualstudio.com/docs/python/debugging)
- [Python 中文教程](https://docs.python.org/zh-cn/3/tutorial/)
