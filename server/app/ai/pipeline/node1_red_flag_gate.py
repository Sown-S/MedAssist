"""Node 1: cổng an toàn đồng bộ, không phụ thuộc LLM hay tình trạng worker."""

from app.ai.interfaces import KnowledgeReader
from app.ai.pipeline.state import PipelineState
from app.ai.rules.red_flag_rules import evaluate_triage_rules


def run_node1(state: PipelineState, knowledge_reader: KnowledgeReader) -> PipelineState:
    """Đánh giá cờ đỏ và mức sàn ưu tiên từ đặc trưng đã xác nhận; cờ đỏ dừng ở ``Skipped``."""
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
