"""作业基础设施：准备测试数据和离线模型，暂时不需要修改本文件。

固定摘要只用于观察框架压缩机制，不代表模型真实生成摘要的质量。
不读取 .env，不请求外部服务，不需要 API Key。
"""

from copy import deepcopy
from uuid import uuid4

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langgraph_py.deepagent import load_model
from pydantic import Field



model = load_model()

   


def prepare_experiment():
    """每次准备一组新的历史、主模型、摘要模型和 thread_id。"""
    history = [
        HumanMessage(content="我要报修电脑。"),
        AIMessage(content="具体是什么故障？"),
        HumanMessage(content="无法联网。"),
        AIMessage(content="上门地址在哪里？"),
        HumanMessage(content="幸福路10号。"),
        AIMessage(content="地址已记录，报修尚未提交。"),
        HumanMessage(content="地址改成建设路20号。"),
        AIMessage(content="已更正地址。"),
        HumanMessage(content="现在还缺什么信息？"),
    ]
    model = load_model()
    summarizer =load_model()
    config = {"configurable": {"thread_id": f"homework-{uuid4().hex}"}}
    return history, model, summarizer, config
