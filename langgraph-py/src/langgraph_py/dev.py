

from langgraph_py.graphs.core_agent_graph import build_graph
from langgraph_py.graphs.demo import demo_parallel_graph,demo_loop_graph



graph = build_graph().compile()

parallel_graph = demo_parallel_graph.build_graph().compile()

loop_graph = demo_loop_graph.build_graph().compile()

