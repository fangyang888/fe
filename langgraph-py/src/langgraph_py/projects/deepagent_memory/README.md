# 编程助手如何记住偏好

这是使用项目现有模型配置的真实 Deep Agent 示例，没有预设模型的工具调用。

从项目根目录运行：

```bash
uv run python projects/deepagent_memory/demo.py
uv run python projects/deepagent_memory/demo.py --run
```

第一条只打印规则；第二条读取项目 `.env` 的模型配置并发起真实模型请求。
当前示例已改用 `FilesystemBackend`，文件写入本目录的
`coding-helper/alice/preferences.md` 与 `coding-helper/bob/preferences.md`，重启后保留。

## 三次聊天与已观察到的结果

在 deepagents 0.7.29 上实际运行通过：

1. Alice 要求记住“中文、Python、先原理后例子”，同时提到今晚吃火锅。
   模型先调用 `read_file`，再调用 `write_file`，成功保存三项长期偏好。
   其他运行中也可能使用 `edit_file` 更新文件。
   “吃火锅”没有出现在保存后的文件中。
2. Alice 新开 thread，只问“解释闭包”。启动快照加载了上一次实际保存的文件，
   模型用中文、Python，并按原理和例子的顺序回答。
3. Bob 的 Agent 配置相同、虚拟文件路径相同，但绑定 Bob 的本地目录。
   首次运行时，启动快照是 Bob 的空白笔记，模型回答尚未记录偏好。

第一次运行后，Alice 的实际记忆是：

```markdown
# 用户偏好

- 回答语言：中文
- 代码示例：使用 Python
- 解释顺序：先讲原理，再给例子
```

具体措辞和工具调用顺序可以随模型改变；内容发生变化时，程序检查成功的写入工具结果，
还会核对新聊天加载内容是否与本地文件一致，以及 Bob 的记忆是否仍独立。
再次运行时保留已有文件，已保存的偏好可能不需要重复写入。
这些检查验证读写链路；没有把模型输出措辞当成固定答案。

## 按代码理解每一层

| 代码 | 职责 |
| --- | --- |
| `MEMORY_RULES` / `system_prompt` | 开发者规定什么需要保存、怎么更新 |
| `memory=[MEMORY_PATH]` | 从 backend 加载指定文件，将内容加入模型系统上下文 |
| `CompositeBackend` | 按路径前缀分流文件读写 |
| `StateBackend` | 默认文件位于线程 state 中 |
| `FilesystemBackend` | 把虚拟文件路径映射到真实磁盘文件 |
| `root_dir` | 当前 Agent 的记忆根目录，程序为不同用户绑定不同目录 |
| `virtual_mode=True` | 把转发来的 `/preferences.md` 解释为根目录里的文件 |
| `InMemorySaver` | 按 thread 保存消息和 state，亦用于查看启动快照 |

`FilesystemBackend` 没有 `namespace` 参数。创建 Agent 时选择目录：

```python
FilesystemBackend(
    root_dir=MEMORY_ROOT / user_id,
    virtual_mode=True,
)
```

例如 Alice 的文件定位链路：

```text
Agent 路径：/memories/preferences.md
    -> 命中路由 /memories/，去掉此前缀
    -> 转发路径 /preferences.md
    -> root_dir = 本目录/coding-helper/alice
    -> 真实文件 本目录/coding-helper/alice/preferences.md
```

`seed_empty_memory()` 只初始化空白笔记，便于观察 `edit_file`。
实际偏好内容由模型根据聊天和规则生成，经过工具写入，而不是程序预填。

## 为什么新聊天还能知道偏好

每次 `chat()` 都生成新 `thread_id`，只传本次的一条用户消息。
第二次没有传第一次的聊天记录。它从 Alice 的本地目录加载笔记。

同一个 root_dir 可以服务多个 thread，目录不随新聊天改变。
本例分别创建 Alice 和 Bob 的 Agent，绑定各自目录；一个 FilesystemBackend 实例
的 root_dir 是固定的，不会因为 invoke 传入另一个 user_id 就自动切换。

当前版本的 `memory_contents` 是私有 state，不直接出现在 `invoke()` 返回值。
演示通过 `agent.get_state(config).values` 查看它，再以 `loaded_memory` 返回诊断信息。
首次运行时，第一次聊天的“启动加载内容”是空白，但执行工具后的文件已更新；两者是不同时间的快照。

## 建议动手修改

1. 把保存规则改成“只在用户明确说记住时保存”，再删掉提问中的“请记住”，观察变化。
2. 增加一次新聊天：“以后改用 JavaScript 举例，请更新偏好”，检查旧偏好是否被替换。
3. 再运行一次程序，观察启动加载内容中已经存在 Alice 的偏好。

这些提示词规则用于引导模型，不能替代写入权限或应用层校验。
不再需要 `InMemoryStore`、`store.put()` 或 `store.get()`；初始化和检查都直接操作本地文件。
`seed_empty_memory()` 仅在文件不存在时创建空白笔记，不会覆盖上一次保存的记忆。
`InMemorySaver` 保存的聊天历史仍只在进程内；磁盘上的长期记忆会保留。
`/memories/preferences.md` 是 Agent 的虚拟路径，真实文件位于各用户目录中。

## 本次报错的原因

- 类名是 `FilesystemBackend`，不是 `FileSystemBackend`；从 `deepagents.backends` 导入。
- `FilesystemBackend` 接收 `root_dir`，不能沿用 `StoreBackend(namespace=...)`。
- 把磁盘路径写进 store namespace 不会创建磁盘文件。
- backend 切换后，初始化和读取检查也要切换，不能继续访问原来的内存 store。

参考：
- https://docs.langchain.com/oss/python/deepagents/memory
- https://docs.langchain.com/oss/python/deepagents/backends
