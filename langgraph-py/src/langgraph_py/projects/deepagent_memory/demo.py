"""真实模型演示：Alice 写入偏好，新聊天读取，Bob 保持隔离。

只看配置（不请求模型）：
    uv run python projects/deepagent_memory/demo.py
实际运行，沿用项目 .env 的模型配置：
    uv run python projects/deepagent_memory/demo.py --run

记忆保存到本目录 coding-helper/<用户>/preferences.md，重启后仍然保留。
"""

from __future__ import annotations

import argparse
from pathlib import Path
from uuid import uuid4

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver

from langgraph_py.deepagent import load_model


# Agent 使用虚拟路径；FilesystemBackend 将它映射到本地目录。
MEMORY_PATH = "/memories/preferences.md"
MEMORY_ROOT = Path("/Users/yang/fe/fe/langgraph-py/src/langgraph_py/projects/deepagent_memory") / "coding-helper"
EMPTY_MEMORY = "# 用户偏好\n\n尚未记录长期偏好。\n"

# 这是开发者制定的保存规则；不是从用户聊天中生成的记忆内容。
MEMORY_RULES = """你是一个编程学习助手。
记忆规则：
1. 用户明确要求记住的长期偏好，保存到 /memories/preferences.md。
2. 只保存回答语言、示例编程语言、解释详略等稳定偏好。
3. 一次性任务和临时安排不要保存。
4. 更新前先读取文件；用 edit_file 合并内容，避免重复并替换过时偏好。
5. 若文件不存在，使用 write_file 创建。只有工具成功后才说已保存。
6. 后续回答应用已加载的偏好；没有记录时，不要猜测用户偏好。
保持回复简短；这个演示不需要委派子 Agent。
"""


def memory_file(user_id: str) -> Path:
    return MEMORY_ROOT / user_id / "preferences.md"


def seed_empty_memory(user_id: str) -> None:
    """首次创建空白笔记，已有文件不覆盖，保留上次运行的记忆。"""
    path = memory_file(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(EMPTY_MEMORY)
    except FileExistsError:
        pass


def build_agent(model, user_id: str):
    # FilesystemBackend 没有 namespace 参数，程序按用户选择 root_dir。
    # 一个实例固定服务一个用户；切换用户时使用另一个实例。
    return create_deep_agent(
        model=model,
        system_prompt=MEMORY_RULES,         # 保存什么、怎样更新
        memory=[MEMORY_PATH],               # 启动时加载哪份笔记
        backend=CompositeBackend(
            default=StateBackend(),         # 其他文件留在当前线程
            routes={
                "/memories/": FilesystemBackend(
                    root_dir=memory_file(user_id).parent,
                    virtual_mode=True,
                ),
            },
        ),
        # checkpointer=InMemorySaver(),       # 当前会话的消息历史
    )


def show_memory(user_id: str) -> str:
    path = memory_file(user_id)
    content = path.read_text(encoding="utf-8")
    print(f"真实文件：{path}")
    print(content)
    return content


def chat(agent, user_id: str, question: str):
    # 每次都创建新 thread，故意不携带前一次的聊天历史。
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 30}
    print(f"\n用户：{user_id}；新 thread_id：{thread_id}")
    print(f"提问：{question}")
    result = agent.invoke(
        {"messages": [{"role": "user", "content": question}]},
        config=config,
    )
    # memory_contents 是私有 state，不在 invoke 的普通输出中。
    # 这里只为教学，通过 checkpointer 快照观察加载结果。
    result["loaded_memory"] = agent.get_state(config).values.get("memory_contents", {})
    print("本次启动加载的记忆：")
    print(result["loaded_memory"].get(MEMORY_PATH, "（未加载）"))
    for message in result["messages"]:
        if isinstance(message, AIMessage):
            for call in message.tool_calls:
                print(f"工具调用：{call['name']} {call['args']}")
        elif isinstance(message, ToolMessage):
            print(f"工具结果：{message.name} / {message.status} / {message.content}")
    print("助手回复：", result["messages"][-1].content)
    return result

test_model = load_model()
memory_graph = build_agent(test_model, "test_user")
# def main() -> None:
#     parser = argparse.ArgumentParser(description=__doc__)
#     parser.add_argument("--run", action="store_true", help="请求项目配置的真实模型")
#     args = parser.parse_args()
#     if not args.run:
#         print(MEMORY_RULES)
#         print("\nmemory 路径：", MEMORY_PATH)
#         print("真实目录：", MEMORY_ROOT)
#         print("加 --run 可观察三次真实聊天；记忆写入各用户的本地文件并保留。")
#         return

#     for user_id in ("alice", "bob"):
#         seed_empty_memory(user_id)
#     before_alice = memory_file("alice").read_text(encoding="utf-8")
#     before_bob = memory_file("bob").read_text(encoding="utf-8")
#     model = load_model()
#     alice_agent = build_agent(model, "alice")
#     bob_agent = build_agent(model, "bob")

#     print("实验 1：Alice 要求保存偏好，同时提到临时安排。", flush=True)
#     first = chat(
#         alice_agent, "alice",
#         "请记住我的长期偏好：用中文回答，使用 Python 举例，解释时先讲原理再给例子。"
#         "我今晚打算吃火锅，这只是今天的临时安排。请保存长期偏好。",
#     )
#     saved = show_memory("alice")
#     if saved != before_alice and not any(
#         isinstance(message, ToolMessage)
#         and message.name in {"edit_file", "write_file"}
#         and message.status == "success"
#         for message in first["messages"]
#     ):
#         raise RuntimeError("模型没有成功调用记忆写入工具，请查看上面的工具输出。")
#     if saved == EMPTY_MEMORY:
#         raise RuntimeError("Alice 的记忆仍为空，不能视为保存成功。")
#     if saved == before_alice:
#         print("记忆与启动前一致；已有偏好无需重复写入。")

#     print("\n实验 2：Alice 新开聊天，不再重复偏好。", flush=True)
#     second = chat(alice_agent, "alice", "解释闭包，控制在 200 字以内。")
#     if second["loaded_memory"].get(MEMORY_PATH) != saved:
#         raise RuntimeError("新会话加载的内容与已保存记忆不一致。")
#     print("核对通过：新 thread 加载了上一次实际保存的笔记。")

#     print("\n实验 3：Bob 的 Agent 配置相同，但绑定另一个本地目录。", flush=True)
#     third = chat(bob_agent, "bob", "你记得我偏好什么回答语言和示例语言吗？")
#     if third["loaded_memory"].get(MEMORY_PATH) != before_bob:
#         raise RuntimeError("Bob 没有加载到自己的记忆文件。")
#     if show_memory("bob") != before_bob:
#         raise RuntimeError("Bob 的记忆被意外修改。")
#     print("核对通过：Bob 加载的是自己的独立笔记。")


# if __name__ == "__main__":
#     main()
