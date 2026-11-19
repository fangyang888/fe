"""报修助手第一步：对照 dict.update 与工具的 Command(update=...)。

运行：.venv/bin/python projects/context_engineering_python/repair_address_step.py
默认使用固定回复的演示模型，不需要 API Key，不会提交真实报修。
"""

from deepagents import create_deep_agent
from deepagents.graph import DeepAgentState
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command


# 1. 业务规则需要设备、故障、地址，所以 State 保存这三个字段。
# messages 已经从 DeepAgentState 继承，不用重新定义。
class RepairState(DeepAgentState):
    device: str | None
    problem: str | None
    address: str | None


def next_action(state: dict) -> str:
    """普通 Python 判断：根据缺少的信息决定下一步，不修改 State。"""
    if state["device"] is None:
        return "请提供设备名称"
    if state["problem"] is None:
        return "请描述具体故障"
    if state["address"] is None:
        return "请提供上门地址"
    return "信息完整，可以生成报修记录"


# 2. 普通 Python：直接修改自己持有的字典。
def ordinary_python_example() -> dict:
    state = {"device": "电脑", "problem": "无法联网", "address": None}
    state.update({"address": "幸福路 10 号"})
    return state


# 3. Deep Agents：工具返回更新指令，由框架把它合并到当前任务 State。
@tool
def save_address(address: str, runtime: ToolRuntime[None, RepairState]) -> Command:
    """当用户提供或修改上门地址时，保存地址。address 是用户提供的地址。"""
    # address 是模型填写的业务参数；runtime 由框架注入。
    # runtime.state 可以读取当前任务状态，但不要直接对它调用 update()。
    old_address = runtime.state["address"]
    address = address.strip()
    if not address:
        # 输入无效：只回复工具结果，不更新 address。
        return Command(update={"messages": [ToolMessage(
            content="地址为空，请用户提供具体地址。",
            tool_call_id=runtime.tool_call_id,
        )]})

    return Command(update={
        # address 是普通字段：新地址覆盖旧值；device、problem 未提交，保持不变。
        "address": address,

        # 同时回复模型本次工具执行的结果，关联模型发起的那次调用。
        # messages 使用继承的消息合并机制，不会清空之前的对话。
        "messages": [ToolMessage(
            content=f"地址已从 {old_address!r} 更新为 {address}。",
            tool_call_id=runtime.tool_call_id,
        )],
    })


def main() -> None:
    # 以下两行借用已有的离线演示基础设施，先不需要研究模拟模型实现。
    from custom_state_demo import DemoModel

    # 这里明确安排一次 save_address 调用，方便稳定观察框架如何更新状态。
    # 真实模型应从用户消息提取地址；本例没有验证该提取能力。
    model = DemoModel(responses=[
        AIMessage(content="", tool_calls=[{
            "id": "save-address-1",
            "name": "save_address",
            "args": {"address": "幸福路 10 号"},
        }]),
        AIMessage(content="地址已记录。"),
    ])
    agent = create_deep_agent(
        model=model,
        tools=[save_address],
        state_schema=RepairState,
        checkpointer=InMemorySaver(),
    )
    config = {"configurable": {"thread_id": "repair-001"}}
    initial = {
        "messages": [{"role": "user", "content": "上门地址是幸福路 10 号。"}],
        "device": "电脑",
        "problem": "无法联网",
        "address": None,
    }
    print("更新前下一步：", next_action(initial))
    agent.invoke(initial, config=config)

    # invoke 完成后读取框架保存的真实 State，不手动执行 Command.update。
    saved = agent.get_state(config).values
    business_state = {key: saved[key] for key in ("device", "problem", "address")}
    print("普通字典更新后：", ordinary_python_example())
    print("Command 更新后：", business_state)
    print("更新后下一步：", next_action(saved))

    # 对照检查：这三个普通字段，两种更新方式得到相同的业务数据。
    assert business_state == ordinary_python_example()
    assert saved["device"] == "电脑" and saved["problem"] == "无法联网"
    assert any(isinstance(msg, ToolMessage) and msg.tool_call_id == "save-address-1"
               for msg in saved["messages"])
    print("检查通过：地址已更新，设备与故障保持不变，工具结果已关联到原调用。")


if __name__ == "__main__":
    main()
