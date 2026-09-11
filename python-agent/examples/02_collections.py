"""第 2 课：dict 类似 JS 的数据对象，list 类似 JS 的数组。"""

# 字典的键要加引号；读取用 log["level"]，不能用 log.level。
logs = [
    {"service": "order-api", "level": "ERROR", "message": "数据库连接超时"},
    {"service": "user-api", "level": "INFO", "message": "登录成功"},
    {"service": "order-api", "level": "ERROR", "message": "支付请求失败"},
]

print(f"一共有 {len(logs)} 条日志")  # JS: logs.length
print(f"第一条：{logs[0]['message']}")  # 索引也从 0 开始。

errors = []
# JS: for (const log of logs) { ... }
for log in logs:
    if log["level"] == "ERROR":
        errors.append(log)  # JS: errors.push(log)

for index, log in enumerate(errors, start=1):
    print(f"{index}. {log['service']}：{log['message']}")

# get 在字段缺失时返回默认值；直接用 [] 访问不存在的键会抛 KeyError。
print(logs[0].get("trace_id", "没有 trace_id"))

# 练习：追加一条 WARN 日志，再筛选出 service 为 order-api 的所有日志。

new_logs = ['a','b','c']

new_logs.append('d')

new_logs.extend([0,[1,2], 'e'])

print(new_logs)
