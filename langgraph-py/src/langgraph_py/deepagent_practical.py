"""实战：用 Deep Agent 分析当前仓库的代码，并给出可核对的文件行号。

这是一个可以直接迁移到真实项目的模式：

用户问题 ──> 主 Agent 制定步骤 ──> 只读源码工具 / code-researcher 子 Agent
         ──> 虚拟工作区保存中间笔记 ──> 带证据的最终回答

配置和能力的对应关系：
* ``tools``：接入业务环境。本例是安全、限量的源码搜索与读取工具；换成数据库、
  工单或内部 API，就是另一个业务 Agent。
* ``subagents``：把跨文件查找交给专门的 Agent，减少主 Agent 的上下文负担。
* ``TodoListMiddleware``：复杂任务显式开启 ``write_todos``。deepagents 0.7+
  不再默认安装这个计划工具。
* ``StateBackend``：给 Agent 临时的虚拟文件工作区；不会直接写当前仓库。
* ``InMemorySaver``：同一进程、同一 thread_id 下继续对话。真实服务应换成
  持久化的 checkpointer，并为不同用户分配不同 thread_id。

先试本地工具，不调用模型：
    uv run python -m langgraph_py.deepagent_practical

实际分析（使用项目根目录 .env 中的 OPENAI_* 配置）：
    uv run python -m langgraph_py.deepagent_practical --run
    uv run python -m langgraph_py.deepagent_practical --run \
      --question "解释 src/langgraph_py/nodes/call_model.py 怎样选择模型"

实现只读取 src 下的 .py 文件和两个项目配置文件，不读取 .env、.venv，
也排除含有密钥默认值的 core/config.py。实际运行需使用支持工具调用的模型；
模型加载函数复用上一课的 deepagent.py。
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from uuid import uuid4

from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from langchain.agents.middleware import TodoListMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

from langgraph_py.deepagent import load_model


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = PROJECT_ROOT / "src"
CONFIG_FILES = {PROJECT_ROOT / "pyproject.toml", PROJECT_ROOT / "langgraph.json"}
BLOCKED_FILES = {PROJECT_ROOT / "src/langgraph_py/core/config.py"}
DEFAULT_QUESTION = (
    "解释这个项目的 Agent 如何从模型调用走到工具调用、再回到模型。"
    "请找到相关源码，引用文件路径和行号；区分代码事实与建议。"
)


def _allowed_file(path: Path) -> bool:
    """仅允许读取明确列出的项目文件，阻止 ../ 和软链接越界。"""
    resolved = path.resolve()
    if resolved in BLOCKED_FILES:
        return False
    return (resolved.is_relative_to(SOURCE_ROOT) and resolved.suffix == ".py") or resolved in CONFIG_FILES


@tool
def search_source(query: str) -> str:
    """在项目的 Python 源码和配置中搜索固定文本，返回文件路径与行号。"""
    if not query.strip() or len(query) > 120:
        return "搜索词必须是 1 到 120 个字符。"

    try:
        completed = subprocess.run(
            [
                "rg", "--line-number", "--fixed-strings", "--max-count", "12",
                "--glob", "*.py", "--glob", "!**/__pycache__/**",
                "--glob", "!**/core/config.py", "--",
                query, "src", "pyproject.toml", "langgraph.json",
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"搜索失败：{type(exc).__name__}。请检查 rg 是否已安装。"

    if completed.returncode == 1:
        return f"没有找到包含 {query!r} 的代码。"
    if completed.returncode != 0:
        return f"搜索失败（退出码 {completed.returncode}）：{completed.stderr[:500]}"

    # 工具结果保持简短，避免把整仓库内容塞入模型上下文。
    lines = completed.stdout.splitlines()
    shown = "\n".join(lines[:80])
    suffix = f"\n…还有 {len(lines) - 80} 行，请缩小搜索词。" if len(lines) > 80 else ""
    return shown[:12_000] + suffix


@tool
def read_source(file_path: str, start_line: int = 1, line_count: int = 80) -> str:
    """按行读取一个项目源码文件；file_path 必须是相对项目根目录的路径。"""
    if Path(file_path).is_absolute():
        return "file_path 必须是相对项目根目录的路径。"
    path = PROJECT_ROOT / file_path
    if not _allowed_file(path):
        return "只允许读取 src 下的 .py 文件、pyproject.toml 或 langgraph.json。"
    if not path.is_file():
        return f"文件不存在：{file_path}"
    if start_line < 1 or not 1 <= line_count <= 120:
        return "start_line 必须 >= 1，line_count 必须在 1 到 120 之间。"

    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    selected = lines[start_line - 1 : start_line - 1 + line_count]
    if not selected:
        return f"{file_path} 只有 {len(lines)} 行，指定范围为空。"
    return "\n".join(f"{number}: {text}" for number, text in enumerate(selected, start_line))


def build_repository_agent(model: str | BaseChatModel):
    """把通用 Deep Agent 装配成当前仓库的只读代码分析助手。"""
    researcher = {
        "name": "code-researcher",
        "description": "跨多个源码文件定位实现，并返回简短的文件行号证据",
        "system_prompt": (
            "你负责定位代码证据。先 search_source，再按需 read_source。"
            "返回少量关键路径和行号，不推测未读到的代码。"
        ),
        "tools": [search_source, read_source],
    }

    return create_deep_agent(
        model=model,
        system_prompt=(
            "你是这个仓库的代码分析助手。多文件问题先列步骤，可以把定位工作交给 "
            "code-researcher。只能依据 search_source/read_source 的结果陈述代码事实；"
            "回答时引用相对路径和行号。你可用虚拟文件保存中间笔记，但不要声称已经修改仓库。"
        ),
        tools=[search_source, read_source],
        subagents=[researcher],
        middleware=[TodoListMiddleware()],
        backend=StateBackend(),
        checkpointer=InMemorySaver(),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Deep Agent 实战：分析当前仓库")
    parser.add_argument("--run", action="store_true", help="调用模型；缺省只演示本地工具")
    parser.add_argument("--question", default=DEFAULT_QUESTION)
    args = parser.parse_args()

    if not args.run:
        print("本地工具示例：search_source('call_model')")
        print(search_source.invoke({"query": "call_model"}))
        print("\n加 --run 可让 Deep Agent 完成多步分析。")
        return

    agent = build_repository_agent(load_model())
    # 服务中应从已认证的会话读取 thread_id；这里每次命令运行创建一个新会话。
    config = {"configurable": {"thread_id": str(uuid4())}}
    result = agent.invoke(
        {"messages": [{"role": "user", "content": args.question}]},
        config=config,
    )

    calls = [
        call["name"]
        for message in result["messages"]
        for call in getattr(message, "tool_calls", [])
    ]
    print("主 Agent 工具调用：", " -> ".join(calls) if calls else "无")
    print("\n分析结果：\n", result["messages"][-1].content)


if __name__ == "__main__":
    main()
