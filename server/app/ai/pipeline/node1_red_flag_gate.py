"""Node 1: cổng an toàn đồng bộ, không phụ thuộc LLM hay tình trạng worker."""

from app.ai.interfaces import KnowledgeReader
from app.ai.pipeline.state import PipelineState
from app.ai.rules.red_flag_rules import evaluate_triage_rules


def run_node1(state: PipelineState, knowledge_reader: KnowledgeReader) -> PipelineState:
    """Bắt đầu đánh giá chỉ bằng đặc trưng đã xác nhận và chuẩn hóa.

    Trả trạng thái mới để lượt đánh giá lặp lại không giữ chẩn đoán hoặc đầu ra LLM
    cũ. Hai mức ưu tiên đều bắt đầu từ mức sàn do luật tất định đặt ra. Cờ đỏ là
    trạng thái kết thúc (``is_red_flag=True``, ``ai_status=Skipped``); bên gọi phải
    trả kết quả ngay, không xếp lịch hoặc chạy các node AI sau. Nếu không có cờ đỏ,
    trạng thái lượt khám là ``Pending``; việc tạo hàng đợi thuộc service/router đánh
    giá, không thuộc cổng thuần này.
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
