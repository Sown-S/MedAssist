"""Trạng thái dùng chung giữa các node tất định và các node chạy trong worker."""

from typing import Any, NotRequired, TypedDict


class PipelineState(TypedDict):
    """Trạng thái có thể tuần tự hóa của một lượt chạy pipeline đánh giá.

    Khi khởi tạo chỉ bắt buộc ``input_features``. Mỗi node tự bổ sung trường của
    mình, nhờ đó Node 1 vẫn dùng được mà không import hoặc gọi LLM.
    """

    input_features: dict[str, Any]
    priority_rule: NotRequired[str]
    priority_final: NotRequired[str]
    rule_hits: NotRequired[list[dict[str, Any]]]
    complete_now: NotRequired[list[str]]
    is_red_flag: NotRequired[bool]
    ai_status: NotRequired[str]
    candidates: NotRequired[list[dict[str, Any]]]
    llm_output: NotRequired[dict[str, Any]]
    validation_result: NotRequired[dict[str, Any]]
    mode: NotRequired[str]
    error: NotRequired[str]
