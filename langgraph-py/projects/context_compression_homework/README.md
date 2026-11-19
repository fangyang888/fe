# 上下文压缩练习：报修助手

这是你自己手写的作业目录，没有提供核心实现答案。
你负责修改 `homework.py`，完成后让助手审阅这个文件和运行结果。

## 文件

- `homework.py`：你要填写的作业，中文注释标出了 TODO 1～7。
- `support.py`：准备好的测试数据与离线模型，暂时不需要修改。

## 运行

从项目根目录 `/Users/yang/fe/fe/langgraph-py` 执行：

```bash
.venv/bin/python projects/context_compression_homework/homework.py
```

也可以先进入本目录：

```bash
cd /Users/yang/fe/fe/langgraph-py/projects/context_compression_homework
../../.venv/bin/python homework.py
```

初始运行会提示某个 TODO 尚未完成，这是预期行为。
不需要安装新依赖，不需要 API Key。当前项目 deepagents 版本为 0.7.29。

## 业务

用户报修电脑，故障为无法联网，最初地址是幸福路10号，后来改成建设路20号。
现在问“还缺什么信息”。报修尚未提交。

9 条历史已经在 `support.py` 中准备好。

## 按顺序完成

1. 定义 `RepairState`：设备、故障、当前地址，三个字段都可为空。
2. 创建文件后端。
3. 配置摘要：达到 6 条消息触发，最近 3 条保留原文，全部选中的旧历史参与摘要。
4. 创建 Agent，连接 schema、backend、摘要中间件与 checkpointer。
5. 构造调用输入：history 加上当前业务数据。
6. 打印观察结果，加入自己的验收检查。
7. 用注释回答文件末尾的两个问题。

## 验收

| 检查项 | 预期 |
| --- | --- |
| 摘要模型是否被调用 | 是 |
| 主模型对话输入（不含系统消息） | 一条摘要 + 最近三条原文 |
| 最近的地址更正 | 在模型输入中保留 |
| State 中的旧问答 | 仍保留原文 |
| 执行后的 State 历史数量 | 9 条原始消息 + 1 条新回答 |
| 当前业务地址 | 建设路20号 |

系统消息与对话消息分开计数。判断实际模型输入可使用 `model.seen[0]`，
不要只查看 State 的 messages 数量。

`support.py` 固定返回摘要，仅用于验证框架的数据流；它不会根据你写的提示词
改变摘要措辞。真实摘要模型能否遵守提示词，需要另外评估。

本练习只压缩历史，不负责从消息提取和更新业务字段，因此你需要在首次输入中
显式填写更正后的地址。摘要不会自动将 address 改为新地址。

## 写完后

告诉助手：“帮我检查 projects/context_compression_homework/homework.py。”
如果遇到报错，可以同时贴出堆栈；不需要先把所有错误都解决。
