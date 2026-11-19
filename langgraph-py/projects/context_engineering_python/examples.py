"""上下文工程 Python 学习示例；已按本项目 deepagents 0.7.29 API 编写。

从项目根目录运行：
    .venv/bin/python projects/context_engineering_python/examples.py
    .venv/bin/python projects/context_engineering_python/examples.py --run

默认只检查配置，不请求模型。--run 使用项目已有模型配置。
下面的订单日志是教学数据，不连接真实订单系统。
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from uuid import uuid4

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.backends.utils import create_file_data
from deepagents.middleware.filesystem import FilesystemMiddleware
from langchain.agents import create_agent
from langchain.agents.middleware import ModelRequest, SummarizationMiddleware, dynamic_prompt
from langchain.tools import ToolRuntime, tool
from langchain_core.language_models import BaseChatModel
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore


# 1. system_prompt：定义行为和验收标准，不用它保存大量项目资料。
SYSTEM_PROMPT = """你是订单列表故障排查助手。本例使用合成数据。
先确认请求参数和返回顺序，再提出根因假设。区分事实与推测。
遇到分页或筛选问题，先读取相关 Skill。
需要深入分析时，可委派 race-researcher；向它提供现象和证据路径。
大日志先搜索，再按行读取；不要把完整日志抄进回答。
输出：已确认事实、根因假设、修复建议、尚待验证项。
用户明确要求记住稳定偏好时，将其保存到 /memories/preferences.md；
若文件已存在，先读取再更新。不要把一次故障的临时猜测记为长期事实。
"""


# 2. memory：配置后常驻加载；文件内容由 backend 提供。
PROJECT_MEMORY = """# 项目核心约定
- 教学项目使用 pnpm。
- 订单请求统一经过 src/api/client.ts。
- 修复后验证快速切换筛选、连续翻页和请求失败。
"""


# 3. skills：启动时展示描述，相关时由模型调用 read_file 读取正文。
SKILL = """---
name: list-state-debugging
description: 排查列表筛选、分页和旧响应覆盖问题时使用。
---
1. 调用 search_request_logs，核对页码和筛选值。
2. 对比 started_ms 和 finished_ms，识别后发先到。
3. 请求顺序交错只能说明存在风险，还需检查响应写入条件。
4. 调用 read_demo_source，检查旧响应是否会更新列表。
5. 需要大日志时调用 export_request_logs，再搜索或读取结果文件。
6. 详细知识见 /skills/list-state-debugging/references/request-races.md。
本流程的教学标记：SKILL_BODY_ONLY_123。
"""
REFERENCE = """请求交错示意：
r1：0ms 发起，900ms 返回，filter=all。
r2：100ms 发起，300ms 返回，filter=pending。
若两次响应均直接写入列表，r1 将在 r2 之后覆盖结果。
可考虑取消旧请求，或在响应写入前校验请求序号。
仍需用可控延迟场景验证修复。
"""


def task_input(question: str) -> dict:
    """把教学资料预置到 StateBackend；它不会自动读本机同名文件。

    同一 thread 后续对话只传 messages 即可，不要反复用初始文件覆盖笔记。
    """
    return {
        "messages": [{"role": "user", "content": question}],
        "files": {
            "/AGENTS.md": create_file_data(PROJECT_MEMORY),
            "/skills/list-state-debugging/SKILL.md": create_file_data(SKILL),
            "/skills/list-state-debugging/references/request-races.md": create_file_data(REFERENCE),
        },
    }


# 4/5. tools + runtime：模型填写查询条件，程序注入租户与权限。
@dataclass(frozen=True)
class AppContext:
    user_id: str
    tenant_id: str
    environment: str = "staging"
    permissions: tuple[str, ...] = ("logs:read",)


DEMO_LOGS = [
    {"tenant_id": "tenant_a", "request_id": "r1", "filter": "all", "page": 1,
     "started_ms": 0, "finished_ms": 900},
    {"tenant_id": "tenant_a", "request_id": "r2", "filter": "pending", "page": 1,
     "started_ms": 100, "finished_ms": 300},
    {"tenant_id": "tenant_b", "request_id": "b1", "filter": "all", "page": 1,
     "started_ms": 0, "finished_ms": 50},
]


@tool
def search_request_logs(runtime: ToolRuntime[AppContext], limit: int = 10) -> str:
    """排查分页、筛选与请求顺序；返回当前租户的合成日志。

    Args:
        limit: 最多返回多少条，取值 1 到 20。
    """
    ctx = runtime.context
    if "logs:read" not in ctx.permissions:
        return "权限不足：需要 logs:read。"
    if not 1 <= limit <= 20:
        return "limit 必须在 1 到 20 之间。"
    rows = [row for row in DEMO_LOGS if row["tenant_id"] == ctx.tenant_id]
    return json.dumps({"environment": ctx.environment, "items": rows[:limit]}, ensure_ascii=False)


@tool
def read_demo_source() -> str:
    """读取教学源码；展示两次请求都可能直接写入同一列表的原因。"""
    return """# 这是故障示意，不是项目真实源码。
async def reload_orders(filters):
    response = await fetch_orders(filters)
    state.orders = response  # 没有确认 filters 是否仍属于当前查询
"""


@dynamic_prompt
def context_prompt(request: ModelRequest) -> str:
    """只有模型需要知道的信息才转成提示词；不把完整 context 序列化。"""
    ctx = request.runtime.context
    return SYSTEM_PROMPT + f"\n本次环境：{ctx.environment}。只进行故障分析。"


# 6. offloading：返回足够大的工具结果，让框架保存文件并替换为引用。
@tool
def export_request_logs(runtime: ToolRuntime[AppContext]) -> str:
    """导出当前租户的大量合成请求日志；输出会由文件中间件自动卸载。"""
    if "logs:read" not in runtime.context.permissions:
        return "权限不足：需要 logs:read。"
    rows = [row for row in DEMO_LOGS if row["tenant_id"] == runtime.context.tenant_id]
    return "\n".join(json.dumps({"sample": i, **row}) for i in range(1500) for row in rows)


def build_offloading_agent(model: BaseChatModel):
    """拆开默认能力做小实验：使用低阈值方便观察，不另加一套重复中间件。"""
    return create_agent(
        model=model,
        tools=[export_request_logs],
        context_schema=AppContext,
        middleware=[FilesystemMiddleware(backend=StateBackend(), tool_token_limit_before_evict=200)],
    )


# 7. summarization：独立使用 create_agent 展示摘要配置。
# create_deep_agent 已自带摘要；不需要再叠加这个示例中间件。
SUMMARY_PROMPT = """将对话压缩为可交接的工作记录。
保留：目标、已验证事实、未验证推测、已排除方案及原因、改动、证据路径、下一步。
不要把尚待验证写成已经完成。
待总结对话：
{messages}
"""


def build_summary_agent(model: BaseChatModel, summarizer: BaseChatModel):
    return create_agent(
        model=model,
        middleware=[SummarizationMiddleware(
            model=summarizer,
            trigger=("messages", 6),  # 教学阈值：输入消息达到 6 条时触发。
            keep=("messages", 2),
            summary_prompt=SUMMARY_PROMPT,
        )],
    )


# 8/9. subagents + long-term memory：完整装配。
def build_agent(model: BaseChatModel, store: InMemoryStore):
    # /memories/preferences.md 转发给 StoreBackend 后，路径为 /preferences.md。
    backend = CompositeBackend(
        default=StateBackend(),
        routes={"/memories/": StoreBackend(
            namespace=lambda rt: ("users", rt.context.tenant_id, rt.context.user_id),
        )},
    )
    researcher = {
        "name": "race-researcher",
        "description": "分析分页请求竞态，返回简短结论、证据与待验证项",
        "model": model,
        "system_prompt": (
            "你负责请求竞态分析。先读取提供的证据，必要时查询日志和示例源码。"
            "不假定自己拥有主 Agent 的聊天记录。只返回事实、推测、证据路径和验证建议。"
            "如需保存长报告，写到 /reports/race.md。"
        ),
        "tools": [search_request_logs, read_demo_source],
    }
    return create_deep_agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[search_request_logs, read_demo_source, export_request_logs],
        context_schema=AppContext,
        middleware=[context_prompt],
        memory=["/AGENTS.md", "/memories/preferences.md"],
        skills=["/skills/"],
        subagents=[researcher],
        backend=backend,
        store=store,
        checkpointer=InMemorySaver(),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="发起真实模型请求")
    args = parser.parse_args()
    if not args.run:
        print("默认不调用模型。先运行 verify.py，查看九种机制的离线验证。")
        print("模型可见业务参数：", search_request_logs.tool_call_schema.model_json_schema())
        print("注意：runtime、user_id、tenant_id 均不在模型填写的参数中。")
        return

    from langgraph_py.deepagent import load_model

    store = InMemoryStore()  # 同一进程内跨 thread；进程重启后不保留。
    agent = build_agent(load_model(), store)
    ctx = AppContext(user_id="alice", tenant_id="tenant_a")
    questions = [
        "请记住：以后用中文和 Python 解释问题。",
        "订单列表快速切换筛选后偶尔显示旧数据。请先读相关 Skill，再用工具排查。",
    ]
    for question in questions:
        # 每次新 thread，只传当前问题和静态项目资料。
        # 第二次不会重新传第一次的聊天记录，偏好只能来自共享 Store。
        result = agent.invoke(
            task_input(question),
            config={"configurable": {"thread_id": str(uuid4())}, "recursion_limit": 60},
            context=ctx,
        )
        calls = [c["name"] for m in result["messages"] for c in getattr(m, "tool_calls", [])]
        print("\n工具轨迹：", " -> ".join(calls) or "无")
        print(result["messages"][-1].content)
        print("虚拟文件：", sorted(result.get("files", {})))


if __name__ == "__main__":
    main()
