"""第 5 课：定位一个故意保留的逻辑错误。程序可运行，但结果不对。"""


def count_errors(levels: list[str]) -> int:
    count = 0
    for level in levels:  # noqa: B007 - 故意漏掉级别判断，留给断点调试练习。
        # 在下一行打断点：第二条是 INFO，为什么 count 也增加了？
        count += 1
    return count


if __name__ == "__main__":
    levels = ["ERROR", "INFO", "ERROR"]
    actual = count_errors(levels)
    print("预期错误数：2")
    print(f"实际错误数：{actual}")

# 练习：只有 level == "ERROR" 时才增加 count。
# 这是故意留下的调试题，先单步观察，再修改。
