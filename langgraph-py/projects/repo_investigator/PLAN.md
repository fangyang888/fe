# 仓库问题调查助手：学习与实施计划

## 项目目标

做一个只读的仓库问答助手。输入“模型怎样调用工具”这类问题后，它能搜索并读取源码，给出可核对的 `文件:行号`；复杂问题可拆给子 Agent；同一会话可以继续追问。

## 本阶段记录（2026-10-23）

已完成：

- 检查了当前仓库的 LangChain、LangGraph 和 Deep Agent 练习，确定以现有 Python 源码作为项目素材。
- 新建 `projects/repo_investigator/`，写了项目说明 `README.md`。
- 新建 `starter.py`，预留第一个 LangChain 工具 `search_code` 的实现位置，并提供命令行入口。
- 验证 `.venv/bin/python projects/repo_investigator/starter.py --help` 可以运行。

尚未完成：`search_code` 的 TODO、实际搜索、模型接入和后续工作流。这些是接下来逐步完成的练习，不计入已完成内容。

## 接下来怎么做

| 顺序 | 任务 | 学到的核心点 | 验收方式 |
| --- | --- | --- | --- |
| 1 | 实现 `search_code` | LangChain `@tool`、工具输入和结果边界 | 搜索 `call_model` 返回真实路径与行号；空查询和无结果有明确提示 |
| 2 | 实现 `read_code` | 工具参数设计、路径校验、限制上下文 | 指定路径和行号可读源码；不能读取 `.env`、仓库外文件 |
| 3 | 用 LangGraph 组装模型与工具循环 | `StateGraph`、`ToolNode`、条件边 | 模型能先调工具再回答，运行时能看到调用轨迹 |
| 4 | 加入会话记忆 | checkpointer、`thread_id` | 同一会话能追问，不同会话互不混淆 |
| 5 | 用 Deep Agent 做复杂调查 | `create_deep_agent`、计划、临时文件、子 Agent | 跨文件问题会收集证据后回答，引用能定位到源码 |
| 6 | 做一组验收问题 | 事实与推测分离、错误定位 | 至少 5 个问题的引用都有效；无证据时不编造 |

## 协作节奏

每次只做表中的一个任务。我给出目标、必要提示和验收命令；你先写关键代码并运行；我根据你的代码或报错解释问题、帮你修改，然后再进入下一步。这样可以把 LangChain、LangGraph 和 Deep Agent 的职责逐层看清。

## 当前下一步

完成 `starter.py` 里的 `search_code`，再执行：

```bash
.venv/bin/python projects/repo_investigator/starter.py --query 'call_model'
```

要求返回格式、搜索范围和数量限制写在 `README.md` 的“任务 1”。
