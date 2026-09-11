"""命令行入口：用 python -m log_search 运行。"""

import argparse
import json
from pathlib import Path

# 一个点表示当前包：从 log_search 内的两个模块导入函数。
from .reader import load_messages
from .search import search_messages


def main() -> int:
    parser = argparse.ArgumentParser(description="第 6 课：多文件日志查询")
    parser.add_argument("--keyword", default="超时", help="搜索关键词")
    parser.add_argument("--file", type=Path, default=Path(__file__).parent / "data/logs.json")
    args = parser.parse_args()

    try:
        messages = load_messages(args.file)
    except (OSError, ValueError) as error:
        print(f"读取失败：{error}")
        return 1

    # 在下一行打断点，按 F11 跨文件进入 search.py。
    results = search_messages(messages, args.keyword)
    print(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"找到 {len(results)} 条日志")
    return 0


# 被 import 时不启动 CLI；作为入口运行时才调用 main。
if __name__ == "__main__":
    raise SystemExit(main())
