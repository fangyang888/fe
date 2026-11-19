"""Expose the visual QA workflow to ``langgraph dev`` and Studio.

Input uses ``visual_qa_graph.workflow.RunState``; see README.md for an example.
The server manages checkpoints, so this entry point does not open a SQLite saver.
"""

from visual_qa_graph.workflow import build_graph


# build_graph already returns a compiled graph, including preparation/QA subgraphs.
visual_qa = build_graph()
