


from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph_py.nodes.call_model import call_model
from langgraph_py.states.core_agent_state import CoreAgentState
from langgraph_py.states.model_config import AssistantConfig
from langgraph_py.tools.opr import tools


def build_graph():
    "生成核心agent 图"
    workflow = StateGraph(CoreAgentState,context_schema=AssistantConfig)
    workflow.add_node("call_model", call_model)
    workflow.add_edge(START, "call_model")
    workflow.add_node("tools", ToolNode(tools))
    workflow.add_conditional_edges( "call_model",
        tools_condition,
        {
            "tools": "tools",
            END: END,
        })
    workflow.add_edge("tools", "call_model")
    
    return workflow
