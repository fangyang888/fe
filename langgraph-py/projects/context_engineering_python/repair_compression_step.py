"""报修助手：比较同一段历史在压缩前后如何送给模型。

运行：.venv/bin/python projects/context_engineering_python/repair_compression_step.py
离线测试模型只负责记录输入并返回固定文本，不评估真实摘要质量。
"""

import json

from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from deepagents.middleware.summarization import SummarizationMiddleware
from langchain.agents.middleware import ModelRequest, dynamic_prompt
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import InMemorySaver

from repair_address_step import RepairState
from verify import ScriptedModel


# 1. 保存了很多轮历史，但这次用户只需要继续当前报修。
# 注意最后三条中发生了地址更正，不可以把旧地址当成当前地址。
HISTORY = [
    HumanMessage(content="我要报修。"),
    AIMessage(content="是什么设备？"),
    HumanMessage(content="电脑。"),
    AIMessage(content="具体是什么故障？"),
    HumanMessage(content="无法联网。"),
    AIMessage(content="请提供上门地址。"),
    HumanMessage(content="幸福路10号。"),
    AIMessage(content="地址已记录，报修尚未提交。"),
    HumanMessage(content="地址改成建设路20号。"),
    AIMessage(content="已更正地址，报修尚未提交。"),
    HumanMessage(content="现在还缺什么信息？"),
]


# 2. 摘要应该保留哪些信息，由任务需要决定。
# {messages} 会由摘要中间件替换成待总结的旧消息；近期消息保留原文。
SUMMARY_PROMPT = """为继续报修登记提炼历史信息。
保留设备、故障、用户约束、地址变化和是否已提交。
明确区分旧地址与当前确认的地址，不把计划写成已执行。
不要保留重复问候或逐句复述。
待总结旧消息：
{messages}
"""


@dynamic_prompt
def repair_prompt(request: ModelRequest) -> str:
    # 业务字段不自动进入提示词，因此显式提供当前确认的信息。
    # 它们由正常业务工具更新，摘要中间件不会自动重写这些字段。
    current = {key: request.state.get(key) for key in ("device", "problem", "address")}
    return "你是报修助手。当前确认信息：" + json.dumps(current, ensure_ascii=False)


def run_case(threshold: int) -> dict:
    # 主模型：记录框架实际送来的消息，便于观察压缩是否生效。
    model = ScriptedModel(responses=[AIMessage(content="资料已齐，等待用户确认提交。")])

    # 摘要模型：模拟对前八条旧消息的总结。
    # 旧历史只包含幸福路10号；地址更正在被保留的近期消息中。
    summarizer = ScriptedModel(responses=[AIMessage(
        content="历史摘要：用户报修电脑，故障无法联网；此前地址为幸福路10号，报修尚未提交。",
    )])
    backend = StateBackend()
    agent = create_deep_agent(
        model=model,
        state_schema=RepairState,
        backend=backend,
        middleware=[
            # 使用 Deep Agents 的摘要类：保留原始消息并归档历史。
            # 同名中间件替换默认项，这里降低阈值只是为了方便教学。
            SummarizationMiddleware(
                model=model,
                summarizer=summarizer,
                backend=backend,
                trigger=("messages", threshold),
                keep=("messages", 3),
                trim_tokens_to_summarize=None,
                summary_prompt=SUMMARY_PROMPT,
            ),
            repair_prompt,
        ],
        checkpointer=InMemorySaver(),
    )
    config = {"configurable": {"thread_id": f"repair-threshold-{threshold}"}}
    agent.invoke({
        "messages": HISTORY,
        "device": "电脑",
        "problem": "无法联网",
        # 模拟先前的业务工具已经保存了用户更正后的地址。
        "address": "建设路20号",
    }, config=config)
    saved = agent.get_state(config).values
    return {
        "model_input": model.seen[0],
        "summary_called": bool(summarizer.seen),
        "saved": saved,
    }


def main() -> None:
    # 同样的 11 条历史，只改变摘要触发阈值进行对照。
    before = run_case(threshold=100)
    after = run_case(threshold=6)
    print("原始历史：", len(HISTORY), "条")
    print("不触发摘要，主模型输入：", len(before["model_input"]), "条（含系统消息）")
    print("触发摘要后，主模型输入：", len(after["model_input"]), "条（含系统消息）")
    print("\n压缩后主模型实际收到：")
    for msg in after["model_input"]:
        # 系统消息还包含框架工具说明，这里避免打印整段，只展示其存在。
        content = "当前业务快照 + 框架说明" if isinstance(msg, SystemMessage) else msg.content
        print(f"  {msg.type}: {content}")

    saved = after["saved"]
    print("\nState 中的原始历史：", len(saved["messages"]), "条（包含新回答）")
    print("当前地址：", saved["address"])
    archives = [p for p in saved.get("files", {}) if p.startswith("/conversation_history/")]
    print("历史归档：", archives)

    # 检查实际机制：摘要执行、模型输入减少、原文保留、业务地址保持最新。
    assert before["summary_called"] is False and after["summary_called"] is True
    assert len(after["model_input"]) < len(before["model_input"])
    assert len(saved["messages"]) == len(HISTORY) + 1
    assert any("请提供上门地址" in str(m.content) for m in saved["messages"])
    assert not any("请提供上门地址" in str(m.content) for m in after["model_input"])
    assert saved["address"] == "建设路20号" and archives
    assert "建设路20号" in str(after["model_input"])
    print("检查通过：模型上下文变短，原始历史和业务字段仍保留。")


if __name__ == "__main__":
    main()
