"""阶段 1：把安全、简短的源码搜索封装成 LangChain 工具。"""

from __future__ import annotations

import argparse
from pathlib import Path

from langchain_core.tools import tool


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = PROJECT_ROOT / "src" / "langgraph_py"
MAX_RESULTS = 30


@tool
def search_code(query: str) -> str:
    """搜索项目 Python 源码，返回命中的相对路径、行号与单行内容。"""
    # TODO(任务 1)：校验查询词；遍历允许的 .py 文件；返回最多 MAX_RESULTS 行。
    # 提示：Path.rglob("*.py")、Path.relative_to(...)、str.find(...) 都可用。
    raise NotImplementedError("请先完成 search_code；任务约定见 README.md")


def main() -> None:
    parser = argparse.ArgumentParser(description="仓库问题调查助手：源码搜索练习")
    parser.add_argument("--query", help="搜索普通文本，例如 call_model")
    args = parser.parse_args()
    if args.query is None:
        parser.print_help()
        return
    print(search_code.invoke({"query": args.query}))


if __name__ == "__main__":
    main()
