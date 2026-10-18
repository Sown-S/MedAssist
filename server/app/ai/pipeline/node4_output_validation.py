"""Ranh giới trong worker giữa reasoning chưa tin cậy và kết quả được hiển thị.

LLM v1 chỉ được sắp xếp lại ứng viên Node 2, giải thích và đề nghị nâng ưu tiên.
Bằng chứng, mã ICD và hướng dẫn được sao chép từ Node 2, không lấy từ model.
Validator tri thức dùng chung chịu trách nhiệm kiểm tra slug và catalog Active.
Không log/lưu dữ liệu bệnh nhân, đầu ra model hoặc exception validation.
"""

from copy import deepcopy
import re
from typing import Any, Literal
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from app.ai.llm.output_schemas import OUTPUT_SCHEMA_VERSION, ReasoningOutput
from app.ai.pipeline.node2_graph_retrieval import MAX_CANDIDATES
from app.ai.pipeline.state import PipelineState
from app.exceptions import AppError
from app.validation import knowledge_validators

MAX_DISPLAY_CANDIDATES = 3


class _Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    symptom_code: knowledge_validators.SymptomCode
    status: Literal["PRESENT", "ABSENT"]
    polarity: Literal["SUPPORTS", "CONTRADICTS"]
    weight: float = Field(gt=0, le=1, allow_inf_nan=False)
    is_key: bool


class _Candidate(BaseModel):
    """Mapping Node 2 hiện có, không gồm trường nào do LLM sở hữu."""

    model_config = ConfigDict(extra="forbid", strict=True)

    condition_code: knowledge_validators.ConditionCode
    name_vi: str = Field(min_length=1)
    icd10_code: str | None
    score: float = Field(ge=0, le=1, allow_inf_nan=False)
    coverage: float = Field(ge=0, le=1, allow_inf_nan=False)
    precision: float = Field(ge=0, le=1, allow_inf_nan=False)
    supporting_evidence: list[_Evidence] = Field(min_length=1)
    contradicting_evidence: list[_Evidence]
    guidelines: list[dict[str, Any]]
    unknown_key_symptoms: list[knowledge_validators.SymptomCode]
    label: Literal["Reference Suggestion"]


_CANDIDATES = TypeAdapter(list[_Candidate])
_CONDITION_CODES = TypeAdapter(list[knowledge_validators.ConditionCode])
_VIETNAMESE_MARKS = frozenset("\u0300\u0301\u0302\u0303\u0306\u0309\u031b\u0323")


def run_node4(state: PipelineState, db: Session) -> PipelineState:
    """Kiểm tra một proposal Node 3 và trả state mới với tối đa ba kết quả.

    Thành công là Completed/Full. Reasoning sai trở thành Degraded/RuleOnly với
    ứng viên tất định và mức sàn ưu tiên hiện có. Dữ liệu bằng chứng/catalog
    baseline sai sẽ không trả gợi ý. ``validation_result`` và ``error`` chỉ chứa
    mã cố định, phù hợp metadata audit về sau. Lỗi database/hạ tầng được truyền lên
    worker; hàm này không ghi, commit, rollback, gọi reader hoặc gọi LLM.
    """
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
        result.update(ai_status="Skipped", mode="RuleOnly")
        return result
    if (
        state.get("is_red_flag") is not False
        or state.get("priority_rule") not in ("Routine", "HighPriority")
        or state.get("priority_final") not in ("Routine", "HighPriority")
    ):
        raise ValueError("Phải chạy Node 1 trước Node 4")

    # Giữ cả mức sàn tất định và mức ưu tiên cao hơn đang có.
    result["priority_final"] = (
        "HighPriority" if "HighPriority" in (state["priority_rule"], state["priority_final"])
        else "Routine"
    )
    candidates = _retrieved_candidates(state.get("candidates"))
    result["candidates"] = _display(candidates)
    if not candidates:
        return _reject(result, "NO_CANDIDATES")

    if not _evidence_matches_input(candidates, state["input_features"]):
        result["candidates"] = []
        return _reject(result, "INVALID_EVIDENCE")
    symptom_codes = list(dict.fromkeys(
        code
        for candidate in candidates
        for code in (
            [row.symptom_code for row in candidate.supporting_evidence]
            + [row.symptom_code for row in candidate.contradicting_evidence]
            + candidate.unknown_key_symptoms
        )
    ))
    try:
        # Kiểm tra cả ứng viên thứ tư bị ẩn để việc cắt danh sách hiển thị không che
        # mất mã sai. Đây là các lần đọc catalog duy nhất.
        knowledge_validators.active_condition_codes(db, [c.condition_code for c in candidates])
        knowledge_validators.active_symptoms(db, symptom_codes)
    except AppError as exc:
        if exc.code not in ("UNKNOWN_CONDITION", "UNKNOWN_SYMPTOM"):
            raise
        result["candidates"] = []
        return _reject(result, "INACTIVE_KNOWLEDGE")

    if state["priority_rule"] == "HighPriority" and state["priority_final"] == "Routine":
        return _reject(result, "SAFETY_FLOOR")
    if not isinstance(state.get("llm_output"), dict):
        return _reject(result, "INVALID_SCHEMA")
    try:
        # Client đã giải mã JSON. Từ chối chuỗi, object sai, trường bằng chứng/ưu
        # tiên thừa hoặc boolean bị ép kiểu tại đây.
        proposal = ReasoningOutput.model_validate(state.get("llm_output"), strict=True)
        codes = _CONDITION_CODES.validate_python(
            [row.condition_code for row in proposal.ranking], strict=True
        )
    except ValidationError:
        return _reject(result, "INVALID_SCHEMA")

    expected = {candidate.condition_code: candidate for candidate in candidates}
    if len(codes) != len(set(codes)):
        return _reject(result, "DUPLICATE_CANDIDATE")
    if any(code not in expected for code in codes):
        return _reject(result, "OUTSIDE_CANDIDATES")
    if set(codes) != set(expected):
        return _reject(result, "INCOMPLETE_RANKING")
    for row in proposal.ranking:
        if not row.reason.strip():
            return _reject(result, "INVALID_REASON")
        if not _contains_vietnamese_text(row.reason):
            return _reject(result, "INVALID_REASON_LANGUAGE")
        if not _reason_cites_candidate_evidence(row.reason, expected[row.condition_code]):
            return _reject(result, "UNGROUNDED_REASON")

    displayed = _display([expected[code] for code in codes])
    for candidate, ranked in zip(displayed, proposal.ranking):
        # Văn bản tự do chỉ là giải thích, không bao giờ là nguồn bằng chứng chuẩn.
        candidate["reason"] = ranked.reason
    result["candidates"] = displayed
    if proposal.raise_priority:
        result["priority_final"] = "HighPriority"
    result.update(ai_status="Completed", mode="Full")
    result["validation_result"] = _validation_result(True, [])
    return result


def _retrieved_candidates(value: object) -> list[_Candidate]:
    if not isinstance(value, list) or len(value) > MAX_CANDIDATES:
        raise ValueError("Phải chạy Node 2 trước Node 4 (tối đa 4 ứng viên)")
    try:
        candidates = _CANDIDATES.validate_python(value, strict=True)
    except ValidationError:
        # Không truyền chi tiết lỗi Pydantic có chứa đầu vào.
        raise ValueError("Dữ liệu Node 2 không hợp lệ") from None
    codes = [candidate.condition_code for candidate in candidates]
    if len(codes) != len(set(codes)):
        raise ValueError("Dữ liệu Node 2 có ứng viên trùng")
    return candidates


def _evidence_matches_input(candidates: list[_Candidate], features: dict[str, Any]) -> bool:
    if not isinstance(features, dict) or not isinstance(features.get("symptoms", {}), dict):
        return False
    observed = features.get("symptoms", {})
    for candidate in candidates:
        seen: set[str] = set()
        for rows, supporting in (
            (candidate.supporting_evidence, True), (candidate.contradicting_evidence, False)
        ):
            for row in rows:
                pair = (row.status, row.polarity)
                allowed = {("PRESENT", "SUPPORTS")} if supporting else {
                    ("ABSENT", "SUPPORTS"), ("PRESENT", "CONTRADICTS")
                }
                if (
                    row.symptom_code in seen or pair not in allowed
                    or observed.get(row.symptom_code, "UNKNOWN") != row.status
                ):
                    return False
                seen.add(row.symptom_code)
        for code in candidate.unknown_key_symptoms:
            if code in seen or observed.get(code, "UNKNOWN") != "UNKNOWN":
                return False
            seen.add(code)
    return True


def _display(candidates: list[_Candidate]) -> list[dict[str, Any]]:
    return [deepcopy(candidate.model_dump()) for candidate in candidates[:MAX_DISPLAY_CANDIDATES]]


def _contains_vietnamese_text(reason: str) -> bool:
    """Yêu cầu chữ viết tiếng Việt thay vì chỉ tin vào prompt."""
    decomposed = unicodedata.normalize("NFD", reason)
    return "đ" in decomposed.casefold() or any(char in _VIETNAMESE_MARKS for char in decomposed)


def _reason_cites_candidate_evidence(reason: str, candidate: _Candidate) -> bool:
    """Chỉ nhận lý do dẫn chính xác một mã bằng chứng từ Node 2."""
    codes = {
        row.symptom_code
        for row in candidate.supporting_evidence + candidate.contradicting_evidence
    }
    codes.update(candidate.unknown_key_symptoms)
    return any(
        re.search(
            rf"(?<![A-Za-z0-9_]){re.escape(code)}(?![A-Za-z0-9_])",
            reason,
        )
        for code in codes
    )


def _validation_result(valid: bool, errors: list[str]) -> dict[str, Any]:
    return {"valid": valid, "errors": errors, "schema_version": OUTPUT_SCHEMA_VERSION}


def _reject(result: PipelineState, code: str) -> PipelineState:
    result.update(ai_status="Degraded", mode="RuleOnly", error=code)
    result["validation_result"] = _validation_result(False, [code])
    return result
