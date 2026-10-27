"""用可运行的小实验理解 Deep Agents 的 ``create_deep_agent``。

对应文档：https://docs.langchain.com/oss/python/deepagents/customization

阅读顺序：
1. ``basic``：LangChain ``create_agent``，只有传入的业务工具。
2. ``deep``：同一个模型和业务工具，额外得到虚拟文件工具、上下文摘要、
   ``task`` 子 Agent 工具等 Deep Agents 默认能力。
3. ``planned``：显式加入 ``TodoListMiddleware``，恢复 ``write_todos``。
4. ``custom``：继续加入专用子 Agent、memory、skills 和 StateBackend。

本项目安装的 deepagents 是 0.7.29。从 0.7.0 起，``write_todos`` 不再默认安装；
0.6.x（最后一个是 0.6.12）会默认提供它。版本记录：
https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/CHANGELOG.md

先看说明，不调用模型：
    uv run python -m langgraph_py.deepagent --mode deep

实际运行（读取仓库根目录 .env 中的 OPENAI_* 设置）：
    uv run python -m langgraph_py.deepagent --mode basic --run
    uv run python -m langgraph_py.deepagent --mode deep --run
    uv run python -m langgraph_py.deepagent --mode planned --run
    uv run python -m langgraph_py.deepagent --mode custom --run

实际调用需要可用的模型和密钥，会产生模型请求。默认只打印说明。
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from uuid import uuid4

from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from deepagents.backends.utils import create_file_data
from deepagents.middleware.filesystem import FilesystemPermission
from langchain.agents import create_agent
from langchain.agents.middleware import TodoListMiddleware
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver


def get_order_status(order_id: str) -> str:
    """查询演示订单的状态；这是业务工具，不是 Deep Agents 内置工具。"""
    orders = {"A100": "已签收，支付金额 199 元", "A200": "运输中，支付金额 89 元"}
    return orders.get(order_id, f"没有找到订单 {order_id}")


def get_refund_policy(topic: str) -> str:
    """读取演示退款规则，供退款专员子 Agent 使用。"""
    return f"关于「{topic}」的演示规则：签收后 7 天内可申请退款；请勿把此示例当作真实商家政策。"


def build_basic_agent(model: str | BaseChatModel):
    """基础对照组：模型可以反复调用 ``tools`` 中的工具。"""
    return create_agent(model=model, tools=[get_order_status])


def build_default_deep_agent(model: str | BaseChatModel):
    """默认 Deep Agent：无需自己组装文件、摘要和子 Agent 中间件。

    默认文件系统是 StateBackend，文件存在图状态中，不等于本机项目目录。
    默认 ``execute`` 无法运行 shell；需要支持执行的 backend 才能使用。
    """
    return create_deep_agent(model=model, tools=[get_order_status])


def build_planned_deep_agent(model: str | BaseChatModel):
    """0.7+ 版本要显式添加 TodoListMiddleware 才有 ``write_todos``。"""
    return create_deep_agent(
        model=model,
        tools=[get_order_status],
        middleware=[TodoListMiddleware()],
    )


def build_custom_deep_agent(model: str | BaseChatModel):
    """逐项展示 customization 文档中的关键参数。

    ``tools`` 是主 Agent 的业务动作；``subagents`` 让 ``task`` 能把详细工作
    交给专用 Agent；``memory`` 会加载 AGENTS.md 作为常驻指令；``skills`` 先
    展示技能摘要，在需要时再读取 SKILL.md 正文。
    """
    refund_expert = {
        "name": "refund-expert",
        "description": "查询退款规则并给出简短结论",
        "system_prompt": "你是退款规则专员。先调用规则工具，再给主 Agent 简短结论。",
        "tools": [get_refund_policy],
        "model": model,  # 省略时通常继承主 Agent 的模型；这里写出来便于观察。
    }

    return create_deep_agent(
        model=model,
        system_prompt="你是订单客服。只依据工具和规则回答，规则不明确时说明不确定。",
        tools=[get_order_status],
        backend=StateBackend(),
        subagents=[refund_expert],
        middleware=[TodoListMiddleware()],
        memory=["/AGENTS.md"],
        skills=["/skills/"],
        checkpointer=InMemorySaver(),
    )


def custom_input(question: str) -> dict:
    """给虚拟文件系统预置文件；StateBackend 不会自动读取本机同名文件。"""
    memory = "# 客服规则\n回答订单问题时先查订单状态；不要编造退款政策。\n"
    skill = """---
name: refund-guide
description: 回答退款问题时使用，先核对订单状态，再核对退款规则。
---
# 退款答复步骤
1. 查询订单状态。
2. 查询退款规则；可以委派 refund-expert。
3. 说明结论以及还需要用户提供的信息。
"""
    return {
        "messages": [{"role": "user", "content": question}],
        "files": {
            "/AGENTS.md": create_file_data(memory),
            "/skills/refund-guide/SKILL.md": create_file_data(skill),
        },
    }


def build_approval_example(model: str | BaseChatModel):
    """权限和人工审批示意：调用方需处理中断后恢复运行。

    此函数不在命令行演示中自动调用。``interrupt_on`` 必须搭配 checkpointer
    和固定的 thread_id；否则暂停后无法恢复。这里仍使用 StateBackend，审批
    针对的是虚拟文件写入，不会直接修改仓库文件。``permissions`` 先按路径
    拒绝敏感区写入；其他路径的写入交给 ``interrupt_on`` 请求人工确认。
    """
    return create_deep_agent(
        model=model,
        backend=StateBackend(),
        permissions=[
            FilesystemPermission(operations=["write"], paths=["/protected/**"], mode="deny")
        ],
        interrupt_on={"write_file": True, "edit_file": True},
        checkpointer=InMemorySaver(),
    )


MODE_NOTES = {
    "basic": "仅有 get_order_status。文件工具、task、摘要和 write_todos 均未加入。",
    "deep": "增加虚拟文件工具、自动摘要和默认 general-purpose 子 Agent；没有 write_todos。",
    "planned": "在 deep 的基础上通过 TodoListMiddleware 加回 write_todos。",
    "custom": "进一步加入专用 refund-expert、memory、按需加载的 skill 和内存检查点。",
}

DEFAULT_QUESTIONS = {
    "basic": "查询订单 A100 的状态。",
    "deep": "查询订单 A100 的状态，并把查询结果写到虚拟文件 /order.txt。",
    "planned": "先用 write_todos 列出步骤，再查询订单 A100 的状态并回答。",
    "custom": "先用 task 委派 refund-expert 查询退款规则，再查询订单 A100 的状态，按退款技能给出答复。",
}


def load_model():
    """优先沿用本项目的 OPENAI_* 环境变量，也支持 DEEPAGENT_MODEL。"""
    # 不从 core.config 导入：这里不依赖其代码中的默认密钥或默认服务地址。
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    model_name = os.getenv("DEEPAGENT_MODEL") or os.getenv("OPENAI_DEFAULT_MODEL")
    if not model_name:
        raise RuntimeError("请设置 DEEPAGENT_MODEL=provider:model 或 OPENAI_DEFAULT_MODEL")

    if ":" in model_name and not model_name.startswith("openai:"):
        return init_chat_model(model_name)

    base_url = os.getenv("OPENAI_BASE_URL")
    if base_url:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("使用 OPENAI_BASE_URL 时，还需设置 OPENAI_API_KEY")
        # OpenAI 兼容服务通常只有模型名，如 deepseek-v4.1-flash。
        return ChatOpenAI(model=model_name.removeprefix("openai:"), base_url=base_url, api_key=api_key)
    # 标准 provider:model 路径由 LangChain 选择相应的模型实现。
    return init_chat_model(model_name if ":" in model_name else f"openai:{model_name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="逐级理解 create_deep_agent 的自定义参数")
    parser.add_argument("--mode", choices=MODE_NOTES, default="deep")
    parser.add_argument("--run", action="store_true", help="真正调用模型；缺省只打印说明")
    parser.add_argument("--question", help="覆盖该模式的示例问题")
    args = parser.parse_args()

    print(f"{args.mode}: {MODE_NOTES[args.mode]}")
    if not args.run:
        return

    model = load_model()
    builders = {
        "basic": build_basic_agent,
        "deep": build_default_deep_agent,
        "planned": build_planned_deep_agent,
        "custom": build_custom_deep_agent,
    }
    agent = builders[args.mode](model)
    question = args.question or DEFAULT_QUESTIONS[args.mode]
    agent_input = custom_input(question) if args.mode == "custom" else {
        "messages": [{"role": "user", "content": question}]
    }
    # 同一个 thread_id 下的后续调用可从内存检查点继续；重启进程后不保留。
    config = {"configurable": {"thread_id": str(uuid4())}}
    result = agent.invoke(agent_input, config=config)
    print("\n主 Agent 工具调用轨迹（是否使用由模型决定）：")
    tool_calls = [
        call["name"]
        for message in result["messages"]
        for call in getattr(message, "tool_calls", [])
    ]
    print(" -> ".join(tool_calls) if tool_calls else "本次没有调用工具")
    print("\n最终回答：")
    print(result["messages"][-1].content)
    if "files" in result:
        print("\n虚拟文件：", ", ".join(sorted(result["files"])))


if __name__ == "__main__":
    main()
