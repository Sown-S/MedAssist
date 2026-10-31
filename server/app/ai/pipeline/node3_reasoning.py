"""Node 3: lập luận LLM trên danh sách ứng viên đóng của Node 2.

Chỉ truyền mã ứng viên, điểm và bằng chứng cấu trúc vào prompt; không truyền PII.
"""

import json
from typing import Any

from app.ai.interfaces import LLMClient
from app.ai.llm.client import LLMConfigurationError
from app.ai.llm.output_schemas import reasoning_json_schema
from app.ai.llm.prompts import REASONING_PROMPT_VERSION, load_prompt
from app.ai.pipeline.node2_graph_retrieval import MAX_CANDIDATES
from app.ai.pipeline.state import PipelineState

_EVIDENCE_FIELDS = ("symptom_code", "status", "polarity", "weight", "is_key")


async def run_node3(
    state: PipelineState,
    llm_client: LLMClient,
    *,
    timeout_seconds: float,
) -> PipelineState:
    """Yêu cầu xếp hạng/giải thích ứng viên và đề nghị nâng ưu tiên trong ngân sách còn lại."""
    result = state.copy()
    for key in ("llm_output", "validation_result", "error"):
        result.pop(key, None)
    if (
        state.get("is_red_flag") is True
        or state.get("ai_status") == "Skipped"
        or state.get("priority_rule") == "Emergency"
        or state.get("priority_final") == "Emergency"
    ):
        result.pop("candidates", None)
        return result
    if (
        state.get("is_red_flag") is not False
        or state.get("priority_rule") not in ("Routine", "HighPriority")
        or state.get("priority_final") not in ("Routine", "HighPriority")
    ):
        raise ValueError("Phải chạy Node 1 trước Node 3")
    candidates = state.get("candidates")
    if not isinstance(candidates, list) or len(candidates) > MAX_CANDIDATES:
        raise ValueError("Phải chạy Node 2 trước Node 3 (tối đa 4 ứng viên)")
    if not candidates:
        return result

    prompt = _reasoning_prompt(state, candidates)
    result["llm_output"] = await llm_client.generate_json(
        prompt=prompt,
        schema=reasoning_json_schema([c["condition_code"] for c in candidates]),
        timeout_seconds=timeout_seconds,
    )
    return result


def _reasoning_prompt(state: PipelineState, candidates: list[dict[str, Any]]) -> str:
    # Node 2 cung cấp mã catalog đã chuẩn hóa và xác nhận. Chỉ chiếu các trường cần
    # thiết của từng ứng viên/hàng bằng chứng để văn bản tự do thừa không lọt vào.
    try:
        data = {
            "priority_rule": state["priority_rule"],
            "priority_final": state["priority_final"],
            "candidates": [
                {
                    "condition_code": candidate["condition_code"],
                    "score": candidate["score"],
                    "coverage": candidate["coverage"],
                    "precision": candidate["precision"],
                    "supporting_evidence": [
                        {key: row[key] for key in _EVIDENCE_FIELDS}
                        for row in candidate["supporting_evidence"]
                    ],
                    "contradicting_evidence": [
                        {key: row[key] for key in _EVIDENCE_FIELDS}
                        for row in candidate["contradicting_evidence"]
                    ],
                    "unknown_key_symptoms": candidate["unknown_key_symptoms"],
                }
                for candidate in candidates
            ],
        }
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False)
    except (KeyError, TypeError, ValueError, RecursionError):
        # Không đưa giá trị lỗi/ngữ cảnh parser vì có thể chứa dữ liệu y tế cá nhân.
        raise LLMConfigurationError("Invalid Node 2 reasoning input.") from None
    return load_prompt(REASONING_PROMPT_VERSION) + "\n" + payload
