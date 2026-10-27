"""A script entry point for debugging the graph.ipynb example with F5."""

from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import StateGraph


class State(TypedDict):
    count: int


def increment(state: State) -> State:
    return {"count": state["count"] + 1}


def main() -> None:
    builder = StateGraph(State)
    builder.add_node("increment", increment)
    builder.set_entry_point("increment")
    builder.set_finish_point("increment")

    graph = builder.compile(checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": "debug_001"}}

    for count in (0, 10, 12):
        print(graph.invoke({"count": count}, config=config))

    snapshot = graph.get_state(config)
    print("最新状态：", snapshot.values)

    history = list(graph.get_state_history(config))
    for state in history:
        print("历史状态：", state.values)


if __name__ == "__main__":
    main()
