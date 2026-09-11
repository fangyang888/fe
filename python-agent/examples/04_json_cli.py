"""第 4 课：标准库、模块导入、JSON 文件、命令行参数、异常处理。"""

import argparse  # Python 自带的命令行参数解析器。
import json  # 类似 JS 的 JSON.parse / JSON.stringify。
from pathlib import Path  # 用于处理文件路径。

# 模块名不能以数字开头，所以综合例子在本文件内定义筛选逻辑。


def load_messages(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")  # 类似 fs.readFileSync。
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("日志文件最外层必须是数组")
    messages: list[str] = []
    for item in data:
        if not isinstance(item, str):
            raise ValueError("数组中的每条日志必须是字符串")
        messages.append(item)
    return messages


def main() -> int:
    parser = argparse.ArgumentParser(description="在本地日志中搜索关键词")
    parser.add_argument("--keyword", default="超时", help="搜索关键词，默认：超时")
    # __file__ 是当前脚本路径；不用依赖终端当前在哪个目录。
    parser.add_argument("--file", type=Path, default=Path(__file__).parent / "data/logs.json")
    args = parser.parse_args()

    try:  # JS 的 try/catch 在 Python 中写成 try/except。
        messages = load_messages(args.file)
    except (OSError, ValueError) as error:
        print(f"读取失败：{error}")
        return 1

    matches = []
    for message in messages:
        if args.keyword.casefold() in message.casefold():
            matches.append(message)

    print(json.dumps(matches, ensure_ascii=False, indent=2))
    print(f"找到 {len(matches)} 条日志")
    return 0


if __name__ == "__main__":
    # 0 表示成功，1 表示失败；类似 Node 的 process.exitCode。
    raise SystemExit(main())

# 练习：--keyword 登录；--file missing.json；--help。
