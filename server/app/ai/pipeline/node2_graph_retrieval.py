"""Retrieval tất định trong worker sau cổng an toàn Node 1.

Bốn ứng viên là danh sách đóng nội bộ cho reasoning/validation sau đó, không phải
kết quả hiển thị. Lớp đầu ra cuối phải giới hạn còn ba. Node này không ghi database,
không log, không đổi ưu tiên và không gọi LLM.
"""

from app.ai.interfaces import KnowledgeReader
from app.ai.pipeline.state import PipelineState
from app.ai.rules.deterministic_scoring import rank_conditions

MAX_CANDIDATES = 4


def run_node2(state: PipelineState, knowledge_reader: KnowledgeReader) -> PipelineState:
    """Trả trạng thái retrieval mới từ đặc trưng đã xác nhận và dữ liệu Active.

    Node 1 phải điền xong kết quả an toàn. Trạng thái cờ đỏ kết thúc sẽ trả ngay,
    không đọc tri thức hoặc giữ gợi ý chẩn đoán. Việc lưu kết quả Preliminary
    Rule-only thuộc service của AI-09.
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
