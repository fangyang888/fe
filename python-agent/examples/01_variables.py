"""第 1 课：变量、字符串、数字和条件判断。直接运行这个文件。"""

# JS: const service = "order-api"; Python 不写 let/const，也不需要分号。
service = "order-api"
level = "ERROR"
duration_ms = 1500
enabled = False  # JS 的 true；Python 必须大写首字母。
trace_id = None  # 类似 JS 的 null。

# JS: console.log(`服务：${service}`); Python 用 f"...{变量}..."。
print(f"服务：{service}")
print(f"级别：{level}")
print(f"耗时：{duration_ms} 毫秒")

# JS: if (level === "ERROR") { ... }
# Python 用 == 比较，用冒号和 4 个空格缩进表示代码块。
if level == "ERROR" and enabled:
    print("发现错误日志")
else:
    print("无需告警")

if duration_ms >= 1000:
    print("请求较慢")

# 没有缩进：无论上面的条件成立与否，都执行。
print("检查结束")

# 练习：把 level 改为 INFO、duration_ms 改为 200，先猜输出，再运行。
# 练习：添加 retry_count = 3，大于 2 时打印“重试次数过多”。
