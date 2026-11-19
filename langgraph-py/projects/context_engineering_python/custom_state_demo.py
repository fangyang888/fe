"""自定义 State 完整示例：两轮对话完成一次教学故障调查。

学习顺序：BugState -> 两个工具 -> task_prompt -> build_agent -> main。

默认离线运行，不需要 API Key：
    .venv/bin/python projects/context_engineering_python/custom_state_demo.py

可选真实模型模式（复用本项目现有模型配置）：
    .venv/bin/python projects/context_engineering_python/custom_state_demo.py --run

教学边界：日志与回归用例均为本文件中的合成数据；没有修改真实订单代码。
"""

from __future__ import annotations

import argparse
import json
import operator
from typing import Annotated, Literal
from uuid import uuid4

from deepagents import create_deep_agent
from deepagents.graph import DeepAgentState
from langchain.agents.middleware import ModelRequest, dynamic_prompt
from langchain.tools import ToolRuntime, tool
from langchain_core.language_models import BaseChatModel
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command


# ── 1. 定义状态的数据结构 ──────────────────────────────────────────
# schema 可以理解为“任务记录表有哪些列，以及每一列如何更新”。
# 继承 DeepAgentState：保留框架已有的 messages 及其消息合并机制。
# 不要重新声明 messages，否则容易覆盖框架原有的配置。
class BugState(DeepAgentState):
    # 普通字段：顺序执行时，更新值替换旧值。
    ticket_id: str

    # 这是业务阶段。Literal 是类型提示，实际阶段约束由工具代码执行。
    phase: Literal["new", "diagnosed", "verified"]

    # Annotated 的第二项指定 reducer，也就是“旧值 + 更新值”的合并函数。
    # 对 list 使用 operator.add：每次提交的新证据追加到已有证据末尾。
    findings: Annotated[list[str], operator.add]

    # 这里没有 reducer：工具返回新字典时，整个字段被替换，不是逐键合并。
    test_results: dict[str, bool]

    # 由回归工具依据本地用例计算，不能仅凭模型说“成功”就设为 True。
    verified: bool


# TypedDict 风格的 schema 不会生成默认值；调用方要显式构造初始状态。
def new_task(ticket_id: str, question: str) -> dict:
    return {
        "messages": [{"role": "user", "content": question}],
        "ticket_id": ticket_id,
        "phase": "new",
        "findings": [],
        "test_results": {},
        "verified": False,
    }


# 两条教学日志：r2 后发先到，r1 最后返回，有覆盖新结果的风险。
REQUESTS = [
    {"id": "r1", "filter": "all", "started_ms": 0, "finished_ms": 900},
    {"id": "r2", "filter": "pending", "started_ms": 100, "finished_ms": 300},
]


# ── 2. 工具读取 State，并返回局部更新 ──────────────────────────────
@tool
def inspect_requests(runtime: ToolRuntime[None, BugState]) -> Command:
    """分析本地教学请求顺序，将诊断证据保存到任务 State。"""
    # ToolRuntime 的泛型顺序为 Context、State；本例没有额外 Runtime context。
    # runtime 由框架注入，不是模型自行填写的工具参数。
    state = runtime.state

    # 重复调用时不重复追加证据，也不将已完成任务退回 diagnosed。
    if state["phase"] != "new":
        return Command(update={"messages": [ToolMessage(
            content="当前任务已经诊断过，请使用已有状态。",
            tool_call_id=runtime.tool_call_id,
        )]})

    latest_request = max(REQUESTS, key=lambda row: row["started_ms"])
    last_response = max(REQUESTS, key=lambda row: row["finished_ms"])
    crossed = latest_request["id"] != last_response["id"]
    finding = (
        f"最新请求是 {latest_request['id']}，最后返回的是 {last_response['id']}；"
        f"{'存在旧响应覆盖风险，还需核对响应写入逻辑' if crossed else '本组数据未出现顺序交错'}。"
    )

    # Command 把“业务状态更新”和“给模型的工具回复”一起交给框架处理。
    # 不直接执行 runtime.state['phase'] = ...，避免绕过状态更新机制。
    return Command(update={
        "phase": "diagnosed",

        # 因为 findings 配置了追加 reducer，这里只提交本次新增的证据。
        # 如果提交 state['findings'] + [finding]，旧证据会被重复追加。
        "findings": [finding],

        # ToolMessage 是反馈给模型的工具结果；tool_call_id 关联原工具调用。
        # 只更新 findings，不返回调用结果，会破坏正常的工具消息配对。
        "messages": [ToolMessage(
            content=f"诊断已保存：{finding}",
            tool_call_id=runtime.tool_call_id,
        )],
    })


def simulate_list(guard_old_responses: bool, responses: list[dict]) -> str:
    """模拟列表更新；只运行本地教学算法，不请求网络也不修改真实代码。"""
    # 最新请求以发起顺序确定，响应则以完成顺序到达。
    latest_id = max(responses, key=lambda row: row["started_ms"])["id"]
    visible_filter = ""
    for response in sorted(responses, key=lambda row: row["finished_ms"]):
        # 教学修复：旧请求返回后不再写入当前列表。
        if guard_old_responses and response["id"] != latest_id:
            continue
        visible_filter = response["filter"]
    return visible_filter


@tool
def run_demo_regression(runtime: ToolRuntime[None, BugState]) -> Command:
    """运行本地教学回归用例，记录结果；通过后将教学任务标记为 verified。"""
    # 业务前置条件由 Python 代码执行；模型不能跳过诊断直接完成任务。
    if runtime.state["phase"] != "diagnosed":
        return Command(update={"messages": [ToolMessage(
            content="请先调用 inspect_requests 完成诊断。",
            tool_call_id=runtime.tool_call_id,
        )]})

    # 两项实际计算的检查：原逻辑能够复现问题，保护逻辑能保留最新请求结果。
    # expected 从最新发起请求导出，而不是由模型提供“预期答案”。
    expected = max(REQUESTS, key=lambda row: row["started_ms"])["filter"]
    results = {
        "旧逻辑可复现覆盖问题": simulate_list(False, REQUESTS) != expected,
        "请求保护保留最新结果": simulate_list(True, REQUESTS) == expected,
    }
    passed = all(results.values())

    return Command(update={
        "test_results": results,
        "verified": passed,
        "phase": "verified" if passed else "diagnosed",
        "findings": ["已运行本地教学回归用例；未修改真实订单项目。"],
        "messages": [ToolMessage(
            content=json.dumps({"test_results": results, "verified": passed}, ensure_ascii=False),
            tool_call_id=runtime.tool_call_id,
        )],
    })


# ── 3. 挑选 State 中需要模型知道的内容 ─────────────────────────────
@dynamic_prompt
def task_prompt(request: ModelRequest) -> str:
    # 自定义字段不会自动整包变成模型提示词，要在这里显式选择。
    # 不序列化整个 State：其中还包含 messages，以及框架维护的其他字段。
    state = request.state
    snapshot = {
        "ticket_id": state.get("ticket_id"),
        "phase": state.get("phase", "new"),
        "recent_findings": state.get("findings", [])[-3:],
        "test_results": state.get("test_results", {}),
        "verified": state.get("verified", False),
    }
    return (
        "你是教学故障排查助手，使用中文。\n"
        "用户要求诊断时调用 inspect_requests，不自行运行回归。\n"
        "用户要求验证时调用 run_demo_regression。\n"
        "依据工具结果回答，区分本地教学验证和真实项目修复。\n"
        "当前任务快照：\n" + json.dumps(snapshot, ensure_ascii=False)
    )


# ── 4. 将 schema、中间件、工具和检查点装配到 Agent ─────────────────
def build_agent(model: BaseChatModel):
    return create_deep_agent(
        model=model,
        tools=[inspect_requests, run_demo_regression],
        state_schema=BugState,
        middleware=[task_prompt],

        # 同一个 Agent 实例 + 相同 thread_id：恢复之前的消息与业务状态。
        # InMemorySaver 只保存在当前进程；进程重启后恢复需持久化 checkpointer。
        checkpointer=InMemorySaver(),
    )


# ── 5. 离线演示基础设施：可以最后再阅读这一段 ──────────────────────
class DemoModel(FakeMessagesListChatModel):
    """固定工具调用顺序，方便学习 State；不是一个会推理的真实模型。"""

    def bind_tools(self, tools, **kwargs):
        # 测试模型直接返回预设 AIMessage，因此这里只需兼容工具绑定接口。
        return self


def tool_request(name: str) -> AIMessage:
    return AIMessage(content="", tool_calls=[{
        "name": name,
        "args": {},
        "id": uuid4().hex,
    }])


def print_state(agent, config: dict, label: str) -> dict:
    # get_state 返回检查点快照；values 是当时的真实 State。
    state = agent.get_state(config).values
    selected = {key: state[key] for key in (
        "ticket_id", "phase", "findings", "test_results", "verified",
    )}
    print(f"\n{label}")
    print(json.dumps(selected, ensure_ascii=False, indent=2))
    return selected


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="改用项目配置的真实模型")
    args = parser.parse_args()
    if args.run:
        from langgraph_py.deepagent import load_model
        model = load_model()
    else:
        # 两轮对话各经历“模型请求工具 -> 执行工具 -> 模型最终回复”。
        model = DemoModel(responses=[
            tool_request("inspect_requests"),
            AIMessage(content="已诊断，尚未运行回归。"),
            tool_request("run_demo_regression"),
            AIMessage(content="本地教学回归已完成。"),
        ])

    agent = build_agent(model)
    config = {"configurable": {"thread_id": uuid4().hex}, "recursion_limit": 30}

    # 第一轮：首次调用时，显式初始化所有自定义字段。
    agent.invoke(new_task("BUG-101", "先诊断旧数据显示问题，不运行回归。"), config=config)
    first = print_state(agent, config, "第一轮：诊断后的 State")

    # 第二轮：只传一条新消息；不重新初始化 findings、verified 等字段。
    # 框架按相同 thread_id 从检查点恢复第一轮状态，工具可以直接读它。
    agent.invoke({"messages": [{"role": "user", "content": "继续，运行教学回归。"}]}, config=config)
    second = print_state(agent, config, "第二轮：验证后的 State")

    if not args.run:
        # 离线模型顺序固定，可确定性检查框架的数据流和本地算法的结果。
        assert first["phase"] == "diagnosed" and first["verified"] is False
        assert len(first["findings"]) == 1 and first["test_results"] == {}
        assert second["phase"] == "verified" and second["verified"] is True
        assert len(second["findings"]) == 2 and all(second["test_results"].values())

        # 再验证“先检查后验证”由工具执行，而不只是一句提示词。
        blocked = build_agent(DemoModel(responses=[
            tool_request("run_demo_regression"), AIMessage(content="验证被阻止。"),
        ]))
        blocked_config = {"configurable": {"thread_id": uuid4().hex}}
        blocked.invoke(new_task("BUG-102", "跳过诊断，直接验证。"), config=blocked_config)
        blocked_state = blocked.get_state(blocked_config).values
        assert blocked_state["phase"] == "new" and blocked_state["verified"] is False

        # reducer 追加列表不自动去重；工具中的阶段检查防止重复诊断追加相同观察。
        repeated = build_agent(DemoModel(responses=[
            tool_request("inspect_requests"), tool_request("inspect_requests"),
            AIMessage(content="重复诊断已经被忽略。"),
        ]))
        repeated_config = {"configurable": {"thread_id": uuid4().hex}}
        repeated.invoke(new_task("BUG-103", "诊断两次。"), config=repeated_config)
        assert len(repeated.get_state(repeated_config).values["findings"]) == 1
        print("\n检查通过：状态恢复、证据追加、回归结果、阶段约束、重复调用。")


if __name__ == "__main__":
    main()
