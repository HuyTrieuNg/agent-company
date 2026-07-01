"""LangGraph StateGraph definition for Follow-up Agent."""
from langgraph.graph import StateGraph, END

from .followup_state import FollowUpState
from .followup_nodes import load_context_node, answer_node

def build_followup_graph() -> StateGraph:
    """Build and compile the Follow-up Agent LangGraph."""
    graph = StateGraph(FollowUpState)

    graph.add_node("load_context", load_context_node)
    graph.add_node("answer", answer_node)

    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "answer")
    graph.add_edge("answer", END)

    return graph.compile()

# Compiled graph singleton
followup_graph = build_followup_graph()
