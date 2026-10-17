"""Node 1: synchronous safety gate, independent of LLM and worker availability."""

from app.ai.interfaces import KnowledgeReader
from app.ai.pipeline.state import PipelineState
from app.ai.rules.red_flag_rules import evaluate_triage_rules


def run_node1(state: PipelineState, knowledge_reader: KnowledgeReader) -> PipelineState:
    """Start an assessment using only confirmed, normalized input features.

    Return a fresh state so a repeated assessment cannot retain old diagnoses or
    LLM output. Both priorities start at the deterministic rule floor. A red flag
    is terminal (``is_red_flag=True``, ``ai_status=Skipped``); the caller must
    return this result without scheduling or running subsequent AI nodes.
    Otherwise ``Pending`` is the visit status; queue creation belongs to the
    assessment service/router, not this pure gate.
    """
    result = evaluate_triage_rules(
        state["input_features"], knowledge_reader.active_triage_rules()
    )
    return {
        "input_features": state["input_features"],
        "priority_rule": result["priority"],
        "priority_final": result["priority"],
        "rule_hits": [dict(hit) for hit in result["rule_hits"]],
        "is_red_flag": result["is_red_flag"],
        "complete_now": result["complete_now"],
        "ai_status": "Skipped" if result["is_red_flag"] else "Pending",
    }
