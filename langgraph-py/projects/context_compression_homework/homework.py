"""上下文压缩作业：你自己填写 TODO，我之后帮你检查。

从项目根目录运行：
    .venv/bin/python projects/context_compression_homework/homework.py

先阅读同目录 README.md。基础设施已经准备好，下面留出核心实现。
"""

# 这些是本次练习会用到的 API，先提供导入，减少准备工作。
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend, StateBackend
from deepagents.graph import DeepAgentState
from deepagents.middleware.summarization import SummarizationMiddleware
from langchain_core.messages import SystemMessage
from langgraph.checkpoint.memory import InMemorySaver
from pathlib import Path
from support import prepare_experiment


class RepairState(DeepAgentState):
    # TODO 1：声明 device、problem、address 三个字段。
    # 三个字段都允许为 None；保留父类的 messages 定义，不重新声明它。
    device: str | None
    problem: str | None
    address: str | None


def build_backend():
    # TODO 2：创建并返回 StateBackend 实例，用于保存历史归档。
   # __file__：当前 homework.py 的路径
    # resolve()：转成绝对路径
    # parent：取得 homework.py 所在的文件夹
    root_dir = Path(__file__).resolve().parent / "data"

    # 目录不存在就创建；已经存在也可以继续使用
    root_dir.mkdir(parents=True, exist_ok=True)

    return FilesystemBackend(
        # 本机真实保存文件的位置
        root_dir=root_dir,

        # Agent 使用的 /xxx 路径，映射到上述目录内部
        virtual_mode=True,
    )


def build_compression(model, summarizer, backend):
    # TODO 3：创建并返回 Deep Agents 的 SummarizationMiddleware。
    # 要求：
    # - 主模型、摘要模型、backend 使用函数收到的参数。
    # - 达到 6 条消息时触发摘要，近期保留 3 条消息原文。
    # - 选中的旧历史全部参与摘要。
    # - 自己写 summary_prompt，保留设备、故障、地址变化和提交状态。
    # - 提示词中要包含框架用来放入旧消息的占位符。
    return  SummarizationMiddleware(
                    model=model,
                    summarizer=summarizer,
                    backend=backend,
                    trigger=("messages", 6),
                    keep=("messages", 3),
                    trim_tokens_to_summarize=None,
                    summary_prompt="保留设备、故障、地址变化和提交状态。待总结旧消息：{messages}",
                )


def build_agent(model, backend, compression):

  return create_deep_agent( 
        model=model,
        system_prompt="你是报修助手，负责记录用户报修信息。",
        memory=["/memories/preferences.md"],
        backend=backend,
        middleware=[compression],
        checkpointer=InMemorySaver(),
        state_schema=RepairState,
    )


def build_input(history):
    # TODO 5：返回首次调用所需的输入字典。
    # 消息使用 history；业务数据为电脑、无法联网、建设路20号。
    return {
        "messages": history,
        "device": "电脑",
        "problem": "无法联网",
        "address": "建设路20号",
    }


def inspect_result(agent, config, model, summarizer):
    # TODO 6：打印证据，自己验证压缩是否生效。
    # 可用入口：
    # - model.seen[0]：主模型第一次实际收到的消息。
    # - summarizer.seen：摘要模型调用时收到的消息记录。
    # - agent.get_state(config).values：框架保存的真实状态。
    # 输出要求：
    # 1. 摘要模型是否被调用。
    # 2. 主模型实际收到的每条消息；注意区分 SystemMessage。
    # 3. State 中保存的历史消息数量，以及旧原文是否还在。
    # 4. State 中当前地址。
    # 5. 最好用 assert 加入你自己的验收检查。
    result = agent.get_state(config).values
    print("摘要模型是否被调用：", bool(summarizer.seen))
    print("主模型实际收到的消息：")
    for msg in model.seen[0]:
        if isinstance(msg, SystemMessage):
            print("  SystemMessage: 当前业务快照 + 框架说明")
        else:
            print(f"  {msg.type}: {msg.content}")
    print("State 中保存的历史消息数量：", len(result["messages"]))
    print("State 中当前地址：", result["address"])  


def main():
    # 已准备好 9 条历史和两个离线模型，不需要 API Key。
    history, model, summarizer, config = prepare_experiment()
    print("实验开始，原始历史消息数：", len(history))

    # 执行顺序已经串好，你负责填上每个函数的实现。
    backend = build_backend()
    compression = build_compression(model, summarizer, backend)
    agent = build_agent(model, backend, compression)
    agent.invoke(build_input(history), config=config)
    inspect_result(agent, config, model, summarizer)


# TODO 7：写下你的理解，不需要长篇解释。
# 为什么不能仅看 State 中消息的数量判断压缩是否成功？
# 答：
#
# 为什么历史摘要中有幸福路10号，当前 address 却应是建设路20号？
# 答：


if __name__ == "__main__":
    try:
        main()
    except NotImplementedError as exc:
        # 尚未填写完时给出提示；其他真实运行错误仍会显示堆栈，方便排查。
        print("尚未完成：", exc)
