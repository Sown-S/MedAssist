"""Worker-side deterministic retrieval after the Node 1 safety gate.

The four candidates are an internal closed list for later reasoning/validation,
not a display result. The final output layer must limit display to three. This
node performs no database writes, logging, priority changes or LLM calls.
"""

from app.ai.interfaces import KnowledgeReader
from app.ai.pipeline.state import PipelineState
from app.ai.rules.deterministic_scoring import rank_conditions

MAX_CANDIDATES = 4


def run_node2(state: PipelineState, knowledge_reader: KnowledgeReader) -> PipelineState:
    """Return fresh retrieval state using confirmed features and Active data.

    Node 1 must already have populated its safety result. Terminal red-flag
    states return without reading knowledge or retaining diagnosis suggestions.
    Persistence of the Rule-only Preliminary result belongs to AI-09's service.
    """
    result = state.copy()
    for key in ("candidates", "llm_output", "validation_result", "error"):
        result.pop(key, None)
    if (
        state.get("is_red_flag") is True
        or state.get("ai_status") == "Skipped"
        or state.get("priority_rule") == "Emergency"
        or state.get("priority_final") == "Emergency"
    ):
        return result
    if (
        state.get("is_red_flag") is not False
        or state.get("priority_rule") not in ("Routine", "HighPriority")
        or state.get("priority_final") not in ("Routine", "HighPriority")
    ):
        raise ValueError("Phải chạy Node 1 trước Node 2")

    result["candidates"] = rank_conditions(
        state["input_features"],
        knowledge_reader.active_conditions(),
        knowledge_reader.active_symptoms(),
    )[:MAX_CANDIDATES]
    return result
