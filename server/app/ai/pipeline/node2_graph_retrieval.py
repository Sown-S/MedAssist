"""Node 2: truy vấn và chấm điểm tất định tối đa 4 ứng viên nội bộ sau Node 1."""

from app.ai.interfaces import KnowledgeReader
from app.ai.pipeline.state import PipelineState
from app.ai.rules.deterministic_scoring import rank_conditions

MAX_CANDIDATES = 4


def run_node2(state: PipelineState, knowledge_reader: KnowledgeReader) -> PipelineState:
    """Trả tối đa 4 ứng viên bệnh từ đặc trưng đã xác nhận và tri thức Active."""
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
