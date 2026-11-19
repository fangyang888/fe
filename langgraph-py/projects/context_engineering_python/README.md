# 上下文工程：Python 可运行学习示例

场景：订单列表切换筛选条件后，旧请求可能覆盖新请求。
日志和订单源码均为合成教学数据，不连接真实系统。

本例按项目已安装的版本验证：

- deepagents 0.7.29
- langchain 1.4.6
- langgraph 1.2.14

不修改项目依赖，也不修改项目现有 Agent。

## 运行

在项目根目录执行：

```bash
# 报修助手：对照普通字典更新和工具的 Command 更新
.venv/bin/python projects/context_engineering_python/repair_address_step.py

# 报修助手：观察摘要前后模型实际输入、原始历史和当前业务状态
.venv/bin/python projects/context_engineering_python/repair_compression_step.py

# 首先推荐：独立、有中文注释的自定义 State 两轮对话示例
.venv/bin/python projects/context_engineering_python/custom_state_demo.py

# 打印模型可见的工具参数，不调用模型
.venv/bin/python projects/context_engineering_python/examples.py

# 离线验证真实框架的数据流，不需要 API Key
.venv/bin/python projects/context_engineering_python/verify.py

# 深入观察自定义 State、reducer、同线程恢复及 Deep Agents 压缩
.venv/bin/python projects/context_engineering_python/state_and_compression.py

# 可选：使用项目现有 .env / load_model() 发起真实模型请求
.venv/bin/python projects/context_engineering_python/examples.py --run
```

离线验证已运行通过。没有执行 `--run`；真实模型调用需要项目现有的模型配置，
模型是否选择 Skill、是否调用子 Agent、是否保存偏好取决于其行为。
`verify.py` 的脚本模型明确安排调用顺序，仅验证框架机制，不证明真实模型会推理。

## 专门学习自定义 State

先看 `custom_state_demo.py`；它不依赖本目录其他示例，关键代码均有中文注释。

阅读顺序：

1. `BugState`：定义任务字段，理解普通字段替换与 `findings` 列表追加。
2. `new_task()`：首次调用显式初始化字段，schema 不会自动创建默认值。
3. `inspect_requests()`：从 `runtime.state` 读取阶段，返回 `Command` 局部更新。
4. `run_demo_regression()`：从实际本地计算生成验证结果，阶段前置条件由 Python 检查。
5. `task_prompt()`：挑选状态字段转成模型可见的快照。
6. `build_agent()`：绑定 schema、工具、中间件和 checkpointer。
7. `main()`：两轮使用相同 thread_id，第二轮只传新消息，恢复第一轮状态。

默认不请求模型。`DemoModel` 仅固定工具调用顺序，便于确定性观察机制。
运行通过：第一轮 `diagnosed / verified=False`，第二轮 `verified / verified=True`，
证据从一条追加到两条；另检查提前验证被阻止、重复诊断不重复追加。
`verified` 仅表示本地教学算法用例通过，没有修改或验证真实订单项目。
可通过 `--run` 使用项目模型配置；这条真实模型路径没有执行。

## 按九种机制阅读 examples.py

### 1. system_prompt

先看 `SYSTEM_PROMPT`，再看 `build_agent()` 的 `system_prompt=`。
提示词规定输出需要区分已验证事实、根因推测与待验证项。

注意 `context_prompt()` 返回 `SYSTEM_PROMPT + ...`：动态提示词每次构造完整文本，
因此主动保留基础约定，而不是只返回一句当前环境。

### 2. 常驻 Memory

`PROJECT_MEMORY` 是静态项目约定。`task_input()` 使用 `create_file_data()` 把它
放到虚拟 `/AGENTS.md`；`build_agent()` 使用 `memory=["/AGENTS.md", ...]` 加载。

链路：Python 字符串 → 输入 files → StateBackend → Memory 中间件 → 系统提示词。

StateBackend 不会因为文件名叫 `/AGENTS.md` 就读取本机同名文件。
这条路径是 Agent 的虚拟文件路径，与工作区真实路径不同。
同一 thread 的后续问题只需传 messages；不要重复传初始 files 覆盖已有内容。

### 3. 按需 Skills

`SKILL` 是完整的 `SKILL.md` 文本，包含 YAML frontmatter 和步骤。
`REFERENCE` 是配套参考资料。两者也由 `task_input()` 放入虚拟文件系统。
`skills=["/skills/"]` 配置搜索目录。

链路：启动读取元数据 → 模型判断相关 → read_file 读正文 → 必要时读 reference。

`verify.py` 检查第一次模型输入包含名称，但不含 `SKILL_BODY_ONLY_123`；
读取技能文件后，第二次输入才出现正文标记。这直接展示了渐进式加载。

### 4. 工具说明

`search_request_logs()` 的函数名、docstring、类型和参数默认值组成工具描述。
直接运行 `examples.py` 可以查看 `tool_call_schema`。

模型填写的业务参数只有 `limit`；`runtime` 不在模型填写的 JSON schema 中。

### 5. Runtime context 与动态提示词

`AppContext` 描述调用方传入的身份、租户、环境和权限。

```python
context=AppContext(user_id="alice", tenant_id="tenant_a")
```

工具通过 `runtime.context` 取得这些值，然后由代码检查权限、过滤租户。
这里模拟的是调用方已经认证的上下文；真实应用需从可信会话构造它。

`context_prompt()` 仅将 environment 转为模型可见文本，没有把完整 context 写进提示词。
需要模型参与决策的配置才转为文本，其他依赖由工具执行时使用。

### 6. Offloading

`export_request_logs()` 生成大工具结果。
`build_offloading_agent()` 用 `create_agent + FilesystemMiddleware` 拆出独立实验，
把 `tool_token_limit_before_evict` 降到 200，便于马上观察。

结果：工具原文 → 后端文件 → 短引用/预览 → 模型按需 read_file 或 grep。

`create_deep_agent()` 自带文件结果卸载，本项目安装版默认工具结果阈值为 20,000。
主示例无需手动增加第二套文件中间件。
200 是教学阈值，不是建议的生产参数；本版本使用近似 token/字符判定。

### 7. Summarization

`build_summary_agent()` 使用 `create_agent + SummarizationMiddleware`，独立展示配置。
`trigger=("messages", 6)` 让小实验容易触发；`keep=("messages", 2)` 保留近期消息。
`SUMMARY_PROMPT` 保留目标、事实、推测、排除项、改动、证据和下一步。

离线验证给它十条历史消息：摘要模型接收旧历史，主模型接收摘要与近期消息。
验证只证明摘要发生和输入发生变化，不评价摘要质量。

`create_deep_agent()` 已内置摘要，不需要将这个独立实验重复叠加进去。
独立的 LangChain 摘要实验没有额外实现原始历史归档；不要将其与 Deep Agents
自带的完整压缩/归档机制混为一谈。

### 8. 子 Agent 隔离

`build_agent()` 中的 `race-researcher` 有自己的 system_prompt、模型和工具。
主 Agent 的 `task` 调用描述需要带上现象、证据路径、调查范围和报告要求。

子 Agent 不自动获得主 Agent 的完整聊天记录；它的内部工具轨迹也不会直接变成
主 Agent 的消息历史。文件是否共享取决于后端与权限，本例共享虚拟后端。

自定义子 Agent 如果需要 Skills，应显式配置 `skills`；本例研究员只用工具，
没有配置 Skills。

`verify.py` 使用不同的父、子脚本模型，验证子上下文不含父历史标记，
并检查主消息列表只有 task 调用和子报告，没有 read_demo_source 的子调用轨迹。

### 9. 长期记忆与作用域

`CompositeBackend` 的默认路由是线程范围的 `StateBackend`。
`/memories/` 路由到 `StoreBackend`，namespace 为：

```python
("users", runtime.context.tenant_id, runtime.context.user_id)
```

因此同一租户的 Alice 在不同 thread 中共享偏好；Bob 使用不同 namespace。
`/memories/preferences.md` 经过前缀路由后，以 `/preferences.md` 访问 StoreBackend。

`main()` 用同一个 store，连续发起两次不同 thread 的聊天：
第一次要求保存偏好，第二次分析 Bug。第二次没有传第一次的聊天历史。
`verify.py` 则固定发起 write_file，验证新 thread 的常驻记忆确实包含该偏好。

三个概念要分开：

- `thread_id`：哪一个会话；checkpointer 根据它恢复会话状态。
- `namespace`：哪一个用户/租户的长期文件。
- 底层存储：数据能否在进程重启后保留。

本例的 InMemoryStore 和 InMemorySaver 都只在当前进程保存。
如果需要磁盘记忆，可参考项目已有的
`src/langgraph_py/projects/deepagent_memory/README.md`，该示例使用 FilesystemBackend。

## 动手观察

1. 删除 memory 配置，对比首次模型输入是否还有 pnpm 约定。
2. 改变 Skill 描述，使用真实模型观察触发是否变化。
3. 将 context 换成 tenant_b，观察日志只剩 b1。
4. 将 permissions 换成空 tuple，观察权限拒绝由工具产生。
5. 将摘要触发阈值提高，观察主模型是否仍接收完整历史。
6. 保持 namespace 不变，只更换 thread_id，观察偏好仍能加载。
7. 新建一个 InMemoryStore 再读取，观察“跨线程”并不代表“跨进程”。

## 自定义 State 与压缩的联合实验

`state_and_compression.py` 提供两组额外实验：

1. 从 `DeepAgentState` 继承自定义字段，工具返回 `Command(update=...)`。
   普通字段覆盖，`Annotated[list[str], operator.add]` 字段追加增量。
   用动态提示词仅展示精简快照，验证未注入的字段不会自动进入模型输入。
   同一 thread 的后续调用不重传初始业务字段，仍能恢复之前的状态。
2. 用 **Deep Agents** 的 `SummarizationMiddleware` 替换其默认同名中间件，
   验证历史摘要、原文归档和业务 State 保留。在当前版本实测：
   初始历史 10 条，主模型输入 4 条（系统消息、摘要、近期 2 条），
   执行后持久化历史为原来的 10 条加新回答，共 11 条。

要区分两个同名类：

- `langchain.agents.middleware.SummarizationMiddleware`：独立 LangChain 实验使用，
  用摘要替换状态中的旧消息，不主动提供 Deep Agents 文件归档功能。
- `deepagents.middleware.summarization.SummarizationMiddleware`：本次联合实验使用，
  在当前版本保留原始 `state["messages"]`，通过私有压缩事件改变模型请求视图，
  并将被摘要历史保存到 `/conversation_history/`。

因此，检查压缩效果应观察模型实际输入，不能仅看 `len(state["messages"])`。
脚本读取私有 `_summarization_event` 仅用于学习诊断，业务代码不要依赖这个字段。

参考官方 Python 文档：

- https://docs.langchain.com/oss/python/deepagents/context-engineering
- https://docs.langchain.com/oss/python/deepagents/backends
- https://docs.langchain.com/oss/python/langchain/runtime
