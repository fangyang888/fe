

from langgraph.runtime import Runtime

from langchain_core.messages import SystemMessage
from langgraph_py.core.create_model import create_model
from langgraph_py.states.core_agent_state import CoreAgentState
from langgraph_py.states.model_config import AssistantConfig, ModelConfig
from langgraph_py.tools.opr import add
from langgraph_py.core.config import openai_settings





async def call_model(state: CoreAgentState, runtime: Runtime[ModelConfig],) -> dict:
    """调用模型节点"""
    messages = state["messages"]  # 取出messages，不包含系统提示词
    value = state.get("model_config")
    assistant = runtime.context or {}
    if value is None:
        model_config = ModelConfig(
            provider=assistant.get("provider", "openai"),
            model_name=assistant.get(
                "model_name", openai_settings.default_model
            ),
        )
    elif isinstance(value, dict):
        model_config = ModelConfig(**value)
    else:
        model_config = value
    template_name = '用简洁、准确的语言回答用户问题，计算时使用工具'
    model = create_model(**model_config.to_kwargs())
    model_with_tools = model.bind_tools([add])
    response = await model_with_tools.ainvoke([SystemMessage(content=template_name), *messages])
    return {"messages": [response]}
