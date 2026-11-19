"""不需要 API Key：用脚本模型验证框架的数据流，不评估真实模型推理质量。"""

from __future__ import annotations

from copy import deepcopy
from uuid import uuid4

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.store.memory import InMemoryStore
from pydantic import Field

from examples import (
    AppContext, build_agent, build_offloading_agent, build_summary_agent,
    search_request_logs, task_input,
)


class ScriptedModel(FakeMessagesListChatModel):
    """固定回复只用于观察机制；bind_tools 不执行任何模型推理。"""

    seen: list = Field(default_factory=list)

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(deepcopy(messages))
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


def call(name: str, args: dict) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"id": uuid4().hex, "name": name, "args": args}])


def config() -> dict:
    return {"configurable": {"thread_id": str(uuid4())}}


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print("PASS", message)


def main() -> None:
    ctx = AppContext(user_id="alice", tenant_id="tenant_a")
    # 1-3：首次模型输入中有常驻规则和技能描述，但没有技能正文。
    model = ScriptedModel(responses=[
        call("read_file", {"file_path": "/skills/list-state-debugging/SKILL.md"}),
        call("search_request_logs", {"limit": 10}),
        AIMessage(content="离线测试结束"),
    ])
    result = build_agent(model, InMemoryStore()).invoke(
        task_input("排查分页问题"), config=config(), context=ctx,
    )
    system = str(model.seen[0][0].content)
    check("订单列表故障排查助手" in system, "1. system_prompt 已进入模型输入")
    check("教学项目使用 pnpm" in system, "2. 常驻 Memory 已进入系统提示词")
    check("list-state-debugging" in system and "SKILL_BODY_ONLY_123" not in system,
          "3a. 启动仅展示 Skill 元数据")
    check("SKILL_BODY_ONLY_123" in str(model.seen[1]), "3b. read_file 后技能正文进入上下文")
    schema = search_request_logs.tool_call_schema.model_json_schema()
    check(set(schema["properties"]) == {"limit"}, "4. 模型参数只有 limit，runtime 由框架注入")
    logs = next(m for m in result["messages"] if isinstance(m, ToolMessage) and m.name == "search_request_logs")
    check('"r1"' in str(logs.content) and '"b1"' not in str(logs.content), "5a. 工具按 Runtime 租户过滤")
    check("本次环境：staging" in system and "alice" not in system,
          "5b. 动态提示词只公开需要的信息")

    denied = ScriptedModel(responses=[call("search_request_logs", {}), AIMessage(content="结束")])
    denied_result = build_agent(denied, InMemoryStore()).invoke(
        task_input("查日志"), config=config(),
        context=AppContext("alice", "tenant_a", permissions=()),
    )
    check(any("权限不足" in str(m.content) for m in denied_result["messages"] if isinstance(m, ToolMessage)),
          "5c. 权限检查由工具代码执行")

    # 6：真正触发 FilesystemMiddleware 的结果卸载。
    offload_model = ScriptedModel(responses=[call("export_request_logs", {}), AIMessage(content="结束")])
    offloaded = build_offloading_agent(offload_model).invoke(
        {"messages": [HumanMessage(content="导出日志")]}, context=ctx,
    )
    files = offloaded.get("files", {})
    tool_result = next(m for m in offloaded["messages"] if isinstance(m, ToolMessage))
    check(bool(files) and len(str(tool_result.content)) < 5000, "6. 大工具结果保存为文件并返回短引用")

    # 7：单独的摘要模型只收到需要压缩的历史，主模型收到摘要和近期消息。
    summarizer = ScriptedModel(responses=[AIMessage(content="SUMMARY_MARKER：已检查页码，尚需验证竞态。")])
    main_model = ScriptedModel(responses=[AIMessage(content="继续调查")])
    history = []
    for i in range(5):
        history.extend([HumanMessage(content=f"第 {i} 轮问题"), AIMessage(content=f"第 {i} 轮回答")])
    build_summary_agent(main_model, summarizer).invoke({"messages": history})
    check(bool(summarizer.seen) and "SUMMARY_MARKER" in str(main_model.seen[0]),
          "7. 旧消息经过摘要，主模型接收摘要及近期消息")

    # 8：子模型独立可观察；它的工具轨迹不会直接复制到主消息列表。
    child = ScriptedModel(responses=[
        call("read_demo_source", {}), AIMessage(content="CHILD_REPORT：缺少响应有效性检查。"),
    ])
    parent = ScriptedModel(responses=[
        call("task", {"subagent_type": "race-researcher", "description": "检查示例源码，返回证据"}),
        AIMessage(content="主任务结束"),
    ])
    # build_agent 对两者使用同一 model 参数；此实验单独显式指定子模型。
    from deepagents import create_deep_agent
    from examples import read_demo_source
    isolated = create_deep_agent(
        model=parent,
        subagents=[{"name": "race-researcher", "description": "检查请求竞态", "model": child,
                    "system_prompt": "读取源码后返回结论。", "tools": [read_demo_source]}],
    ).invoke({"messages": [HumanMessage(content="PARENT_ONLY_MARKER：排查问题")]})
    parent_calls = [c["name"] for m in isolated["messages"] for c in getattr(m, "tool_calls", [])]
    check(bool(child.seen) and "PARENT_ONLY_MARKER" not in str(child.seen[0]),
          "8a. 子 Agent 没有自动获得主 Agent 完整历史")
    check(parent_calls == ["task"] and "CHILD_REPORT" in str(isolated["messages"]),
          "8b. 主 Agent 收到子报告，未收到子工具调用轨迹")

    # 9：同一 Store，不同 thread；再用不同用户验证作用域。
    store = InMemoryStore()
    writer = ScriptedModel(responses=[
        call("write_file", {"file_path": "/memories/preferences.md", "content": "PREFERENCE_MARKER：中文和 Python"}),
        AIMessage(content="已保存"),
    ])
    build_agent(writer, store).invoke(task_input("记住偏好"), config=config(), context=ctx)
    reader = ScriptedModel(responses=[AIMessage(content="新聊天")])
    build_agent(reader, store).invoke(task_input("解释请求竞态"), config=config(), context=ctx)
    check("PREFERENCE_MARKER" in str(reader.seen[0][0].content), "9a. 新 thread 启动时读到同一用户的记忆")
    bob = ScriptedModel(responses=[AIMessage(content="Bob 的聊天")])
    build_agent(bob, store).invoke(
        task_input("解释请求竞态"), config=config(), context=AppContext("bob", "tenant_a"),
    )
    check("PREFERENCE_MARKER" not in str(bob.seen[0]), "9b. 其他用户不会加载 Alice 的记忆")
    print("\n全部验证通过。脚本模型固定调用顺序；真实模型是否选对工具需要单独评估。")


if __name__ == "__main__":
    main()
