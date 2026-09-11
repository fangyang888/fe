"""只负责筛选：不读文件、不解析参数、不打印。"""


def search_messages(messages: list[str], keyword: str) -> list[str]:
    results: list[str] = []
    for message in messages:
        if keyword.casefold() in message.casefold():
            results.append(message)
    return results
