# Deep Agent：工具中断与补全

在仓库根目录运行一次即可，不需要模型密钥：

```bash
.venv/bin/python projects/deepagent_tool_interrupt/demo.py
```

看 `demo.py` 里的两个函数：

1. `approval_example()`：模型提出工具调用 → `interrupt_on` 暂停 → 工具执行记录还是空的 → `Command(resume=...)` 批准 → 工具才执行。
2. `patch_example()`：人为构造一条没有结果的工具调用 → Deep Agent 自动补一条 `status="error"` 的 `ToolMessage` → 工具没有因此重新执行。

这里的 `FakeModel` 只负责固定地产生工具请求和结束语，方便你专注看中断和补全。`record` 工具只改内存列表。
