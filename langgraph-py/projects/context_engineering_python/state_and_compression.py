"""自定义 State 与 Deep Agents 压缩的离线实验，不调用外部模型。

运行：.venv/bin/python projects/context_engineering_python/state_and_compression.py
脚本模型固定回复用于观察框架机制，不代表真实模型的工具选择和摘要质量。
"""

from __future__ import annotations

import json
import operator
from dataclasses import dataclass
from typing import Annotated, Literal

from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from deepagents.graph import DeepAgentState
from deepagents.middleware.summarization import SummarizationMiddleware
from langchain.agents.middleware import ModelRequest, dynamic_prompt
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from examples import DEMO_LOGS
from verify import ScriptedModel, call, check, config


# 保留 DeepAgentState 继承的 messages / DeltaChannel，避免重定义 messages。
# TypedDict 声明类型，不生成默认值，也不自动做运行时业务校验。
class InvestigationState(DeepAgentState):
    task_id: str
    phase: Literal["investigating", "verifying", "done"]
    findings: Annotated[list[str], operator.add]
    report_path: str
    verification_passed: bool


@dataclass(frozen=True)
class RunContext:
    tenant_id: str


@tool
def inspect_demo_request(
    request_id: str,
    runtime: ToolRuntime[RunContext, InvestigationState],
) -> Command:
    """读取一条当前租户的教学日志，将确定性观察追加到任务 State。

    Args:
        request_id: 教学请求 ID，例如 r1、r2。
    """
    row = next((row for row in DEMO_LOGS
                if row["tenant_id"] == runtime.context.tenant_id
                and row["request_id"] == request_id), None)
    if row is None:
        return Command(update={"messages": [ToolMessage(
            content="没有找到该租户的请求。", tool_call_id=runtime.tool_call_id,
        )]})
    finding = (f"{request_id}: {row['filter']}, page={row['page']}, "
               f"start={row['started_ms']}ms, finish={row['finished_ms']}ms")
    return Command(update={
        "phase": "investigating",  # 普通字段：覆盖旧值。
        "findings": [finding],  # reducer 字段：只返回增量，框架合并。
        "messages": [ToolMessage(
            content=f"已记录观察：{finding}", tool_call_id=runtime.tool_call_id,
        )],
    })


@dynamic_prompt
def task_prompt(request: ModelRequest) -> str:
    # State 不会整包自动发给模型；这里只选择三个紧凑字段。
    state = request.state
    visible = {
        "task_id": state.get("task_id"),
        "phase": state.get("phase"),
        "recent_findings": state.get("findings", [])[-3:],
    }
    return "你是故障调查助手。当前任务快照：\n" + json.dumps(visible, ensure_ascii=False)


def initial_state(messages: list) -> dict:
    return {
        "messages": messages,
        "task_id": "bug-101",
        "phase": "investigating",
        "findings": [],
        "report_path": "/reports/STATE_ONLY_MARKER.md",
        "verification_passed": False,
    }


def demo_state() -> None:
    print("\n实验一：State 的读取、更新、reducer 和同线程恢复")
    model = ScriptedModel(responses=[
        call("inspect_demo_request", {"request_id": "r1"}),
        call("inspect_demo_request", {"request_id": "r2"}),
        AIMessage(content="已有两条观察，尚未验证修复。"),
        AIMessage(content="继续当前任务。"),
    ])
    agent = create_deep_agent(
        model=model,
        tools=[inspect_demo_request],
        state_schema=InvestigationState,
        context_schema=RunContext,
        middleware=[task_prompt],
        checkpointer=InMemorySaver(),
    )
    thread = config()
    ctx = RunContext(tenant_id="tenant_a")
    agent.invoke(initial_state([HumanMessage(content="检查 r1 和 r2")]), config=thread, context=ctx)
    state = agent.get_state(thread).values
    check(len(state["findings"]) == 2, "两次 Command 更新通过 reducer 累积两条观察")
    check(state["verification_passed"] is False, "工具未更新的字段保持原值")
    check("STATE_ONLY_MARKER" not in str(model.seen), "未显式注入的字段不会自动进入模型输入")
    check("r2:" in str(model.seen[2][0].content), "动态提示词按需投影最新 State")

    # 模拟应用收到外部执行事件：只更新阶段，仍不声称验证通过。
    agent.update_state(thread, {"phase": "verifying"})
    agent.invoke({"messages": [HumanMessage(content="继续")]}, config=thread, context=ctx)
    restored = agent.get_state(thread).values
    check(restored["phase"] == "verifying" and len(restored["findings"]) == 2,
          "同一 thread 仅传新消息，仍恢复之前的业务字段")
    print("业务 State：", {k: restored[k] for k in ["task_id", "phase", "findings", "verification_passed"]})


def demo_compression() -> None:
    print("\n实验二：压缩模型输入，保留原始历史与业务 State")
    model = ScriptedModel(responses=[AIMessage(content="继续检查请求响应写入条件。")])
    summarizer = ScriptedModel(responses=[AIMessage(
        content="SUMMARY_MARKER：目标是排查旧响应覆盖；已排除页码问题；修复尚未验证。",
    )])
    backend = StateBackend()
    agent = create_deep_agent(
        model=model,
        state_schema=InvestigationState,
        backend=backend,
        checkpointer=InMemorySaver(),
        # 相同 .name 替换默认的摘要中间件，保留 Deep Agents 的历史归档能力。
        middleware=[SummarizationMiddleware(
            model=model,
            summarizer=summarizer,
            backend=backend,
            trigger=("messages", 6),
            keep=("messages", 2),
            trim_tokens_to_summarize=None,
            summary_prompt="保留目标、事实、推测、证据路径和下一步。\n{messages}",
        )],
    )
    history = [HumanMessage(content="OLD_DETAIL_MARKER：完整复现条件只在旧消息中。")]
    history.append(AIMessage(content="开始排查"))
    for i in range(4):
        history.extend([HumanMessage(content=f"问题 {i}"), AIMessage(content=f"进展 {i}")])
    data = initial_state(history)
    data["findings"] = ["页码重置已验证"]
    thread = config()
    agent.invoke(data, config=thread)
    state = agent.get_state(thread).values
    actual_model_input = model.seen[0]
    archive_paths = [p for p in state.get("files", {}) if p.startswith("/conversation_history/")]
    check(bool(summarizer.seen), "摘要模型实际被调用")
    check("SUMMARY_MARKER" in str(actual_model_input), "主模型接收摘要")
    check("OLD_DETAIL_MARKER" not in str(actual_model_input), "旧细节未直接进入本次模型请求")
    check("OLD_DETAIL_MARKER" in str(state["messages"]), "原始 state.messages 仍保留旧细节")
    check(state["findings"] == ["页码重置已验证"] and state["verification_passed"] is False,
          "业务字段不被消息摘要修改")
    check(bool(archive_paths), "被摘要历史另存 conversation_history 文件")
    print("初始历史消息数：", len(history))
    print("主模型实际输入消息数（含系统消息，如有）：", len(actual_model_input))
    print("执行后 State 历史消息数：", len(state["messages"]))
    print("历史归档：", archive_paths)
    # 私有字段仅用于观察实现；业务代码不要依赖这个字段名。
    print("压缩事件 cutoff_index：", state.get("_summarization_event", {}).get("cutoff_index"))


if __name__ == "__main__":
    demo_state()
    demo_compression()
