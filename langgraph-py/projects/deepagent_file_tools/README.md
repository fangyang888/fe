# Deep Agent 文件工具

在仓库根目录运行；不需要模型密钥：

```bash
.venv/bin/python projects/deepagent_file_tools/demo.py
```

脚本依次调用 `write_file → ls → read_file → edit_file → read_file → glob → grep`。默认的 `StateBackend()` 把 `/note.txt` 存在 Agent 状态中，这次运行不会在项目目录创建文件。

想看真实文件，再运行：

```bash
.venv/bin/python projects/deepagent_file_tools/demo.py --local
```

`--local` 改用 `FilesystemBackend(root_dir=workspace, virtual_mode=True)`。Agent 看到的 `/note.txt` 会映射到本目录的 `workspace/note.txt`；`root_dir` 限定访问范围，`virtual_mode=True` 将工具中的绝对路径解释为相对于该目录的虚拟路径。

配置只看三处：

| 配置 | 作用 |
| --- | --- |
| `backend` | 决定文件存在哪里：`StateBackend` 是会话状态，`FilesystemBackend` 是真实目录 |
| `checkpointer=InMemorySaver()` | 保存会话状态；这个示例仅在当前进程内有效 |
| `thread_id` | 标识会话；同一进程中继续调用时，要沿用同一个 ID 才能取回虚拟文件 |

`FakeModel` 只固定提出工具调用，便于观察工具本身。`write_file` 会覆盖已有文件；`edit_file` 做精确文本替换，且先前必须读过该文件。`grep` 搜索的是普通文本，不是正则表达式。
