# 仓库问题调查助手

一个练习项目：输入关于当前仓库的问题，助手搜索源码、读取相关片段，最后给出带文件和行号的回答。复杂问题可以拆给专门的子 Agent；连续追问沿用同一个会话。

## 完成时的样子

示例问题：`这个项目的模型是怎样调用工具并拿到结果的？`

合格回答应指出实际经过的函数和图节点，给出可核对的 `路径:行号`，并把代码事实与推测分开。找不到证据时明确说找不到。第一版只读源码，不修改仓库。

## 为什么选这个项目

它直接使用你已经写过的 LangChain 工具调用、LangGraph 图与检查点，以及 `deepagent.py` 中的 Deep Agent 实验。搜索范围就是当前仓库，不需要先接数据库或外部搜索服务。现有的 `src/langgraph_py/deepagent_practical.py` 可以作为完成后的对照，先尽量自己实现。

## 四个阶段

| 阶段 | 你要实现的能力 | 对应知识 | 完成标准 |
| --- | --- | --- | --- |
| 1. 证据工具 | `search_code`、`read_code` | LangChain `@tool`、参数与工具结果 | 给定关键字，返回真实的路径、行号和短片段；拒绝越界读取 |
| 2. 显式工作流 | 模型 → 工具 → 模型，保存会话 | LangGraph `StateGraph`、`ToolNode`、条件边、checkpointer | 能看到工具调用轨迹；相同 `thread_id` 可继续提问 |
| 3. Deep Agent | 计划、临时笔记、`code_researcher` 子 Agent | `create_deep_agent`、middleware、backend、subagents | 跨文件问题能先调查再回答，不把虚拟文件说成真实文件 |
| 4. 验收 | 命令行入口和一组问题 | 结果评估与错误定位 | 至少 5 个问题中，引用都能定位到真实代码；无证据时不编造 |

每次只推进一个小任务：你先动手，我根据运行结果帮你定位问题、解释原理，再进入下一阶段。

## 现在做：任务 1

打开 [starter.py](starter.py)，完成 `search_code`。约定：

1. 只搜索仓库 `src/langgraph_py` 下的 `.py` 文件；跳过 `__pycache__` 和 `core/config.py`。
2. 查询词按普通文本匹配，不当作正则；去掉首尾空白后长度须为 1～100。
3. 每个命中返回一行 `相对路径:行号:源码内容`，最多返回 30 行，避免把大量代码塞进模型上下文。
4. 没有命中时返回清楚的提示；不要读取 `.env` 或 `.venv`。

运行：

```bash
.venv/bin/python projects/repo_investigator/starter.py --query 'call_model'
```

预期至少能找到 `src/langgraph_py/graphs/core_agent_graph.py` 中的 `call_model`。完成后把输出或遇到的报错发给我，我们一起检查，然后做 `read_code`。
