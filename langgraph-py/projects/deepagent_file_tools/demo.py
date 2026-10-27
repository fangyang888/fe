"""Deep Agent 文件工具示例：默认虚拟文件；加 --local 写入本目录的 workspace。"""

import sys
from pathlib import Path
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend, StateBackend
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver


class FakeModel(FakeMessagesListChatModel):
    """按顺序提出固定工具调用，不需要模型密钥。"""

    def bind_tools(self, tools: Any, **kwargs: Any):
        return self


def call(name: str, args: dict, number: int) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": args, "id": f"call-{number}"}],
    )


steps = [
    ("write_file", {"file_path": "/note.txt", "content": "今天学习文件工具。\n"}),
    ("ls", {"path": "/"}),
    ("read_file", {"file_path": "/note.txt"}),
    ("edit_file", {"file_path": "/note.txt", "old_string": "今天学习", "new_string": "正在学习"}),
    ("read_file", {"file_path": "/note.txt"}),
    ("glob", {"pattern": "*.txt"}),
    ("grep", {"pattern": "正在学习", "path": "/", "output_mode": "content"}),
]


def main() -> None:
    local = "--local" in sys.argv
    workspace = Path(__file__).parent / "workspace"
    if local:
        workspace.mkdir(exist_ok=True)
        backend = FilesystemBackend(root_dir=workspace, virtual_mode=True)
    else:
        backend = StateBackend()

    model = FakeModel(
        responses=[
            *(call(name, args, i) for i, (name, args) in enumerate(steps, 1)),
            AIMessage(content="演示结束"),
        ]
    )
    agent = create_deep_agent(
        model=model,
        backend=backend,
        checkpointer=InMemorySaver(),
    )
    config = {"configurable": {"thread_id": "file-tools-demo"}}
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "演示文件工具"}]},
        config=config,
    )

    for message in result["messages"]:
        if isinstance(message, ToolMessage):
            print(f"{message.name}: {message.status}")
            if message.name in {"ls", "read_file", "glob", "grep"}:
                print(message.content)

    if local:
        print(f"真实文件：{workspace / 'note.txt'}")
    else:
        print("虚拟文件：/note.txt（电脑上没有新建 note.txt）")


if __name__ == "__main__":
    main()
