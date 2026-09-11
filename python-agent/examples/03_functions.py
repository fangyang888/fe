"""第 3 课：函数、参数、返回值、类型提示和程序入口。"""


# JS: function containsKeyword(message, keyword = "超时") { ... }
# str 和 -> bool 是类型提示，类似 TypeScript；不会自动转换或校验输入。
def contains_keyword(message: str, keyword: str = "超时") -> bool:
    # 在 return 行打断点，观察 message、keyword，试试“单步进入”。
    return keyword.casefold() in message.casefold()


def find_messages(messages: list[str], keyword: str) -> list[str]:
    matches = []
    for message in messages:
        if contains_keyword(message, keyword):
            matches.append(message)
    return matches

def say_hello(name: str) -> None:
    print(f"Hello, {name}!")


def main() -> None:
    # messages = ["数据库连接超时", "登录成功", "HTTP TIMEOUT"]
    # result = find_messages(messages, keyword="超时")
    # print(result)
    # print(contains_keyword("HTTP TIMEOUT", "timeout"))
    say_hello("Alice")

# 直接运行时执行 main；被其他文件 import 时不执行演示。
if __name__ == "__main__":
    main()

# 练习：把 keyword 改为“登录”；再改成不存在的词，观察返回的空列表。
