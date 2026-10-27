"""运行一次，观察 Deep Agent 的工具审批中断与消息补全。"""

from typing import Any

from deepagents import create_deep_agent
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command


executed = []  # 用来判断工具是否真的运行了


@tool
def record(text: str) -> str:
    """把文本记录在内存中。"""
    executed.append(text)
    return f"已记录：{text}"


class FakeModel(FakeMessagesListChatModel):
    """固定回复，避免示例依赖模型密钥。"""

    def bind_tools(self, tools: Any, **kwargs: Any):
        return self


def tool_request() -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"name": "record", "args": {"text": "你好"}, "id": "call-1"}],
    )


def approval_example() -> None:
    print("=== 1. 审批中断 ===")
    model = FakeModel(responses=[tool_request(), AIMessage(content="完成")])
    agent = create_deep_agent(
        model=model,
        tools=[record],
        interrupt_on={"record": True},
        checkpointer=InMemorySaver(),
    )
    config = {"configurable": {"thread_id": "approval-demo"}}

    paused = agent.invoke(
        {"messages": [{"role": "user", "content": "记录你好"}]}, config=config
    )
    print("待审批工具：", paused["__interrupt__"][0].value["action_requests"][0]["name"])
    print("审批前，工具执行记录：", executed)

    resumed = agent.invoke(
        Command(resume={"decisions": [{"type": "approve"}]}), config=config
    )
    result = next(m for m in resumed["messages"] if isinstance(m, ToolMessage))
    print("审批后的工具结果：", result.content)
    print("审批后，工具执行记录：", executed)


def patch_example() -> None:
    print("\n=== 2. 悬空调用补全 ===")
    executed.clear()
    agent = create_deep_agent(
        model=FakeModel(responses=[AIMessage(content="看到错误结果")]),
        tools=[record],
    )
    # 模拟上次只记录了 AI 的工具请求，没记录到工具返回结果。
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "记录你好"}, tool_request()]}
    )
    patched = next(m for m in result["messages"] if isinstance(m, ToolMessage))
    print("补出的 ToolMessage 状态：", patched.status)
    print("补出的内容：", patched.content)
    print("工具执行记录：", executed)


if __name__ == "__main__":
    approval_example()
    patch_example()
