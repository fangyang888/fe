"""只负责读取并校验文件；失败交给调用者处理。"""

import json
from pathlib import Path


def load_messages(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("日志文件最外层必须是数组")

    messages: list[str] = []
    for item in data:
        if not isinstance(item, str):
            raise ValueError("数组中的每条日志必须是字符串")
        messages.append(item)
    return messages
