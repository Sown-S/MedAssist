"""Worker-side boundary between untrusted reasoning and displayable results.

LLM v1 can only reorder Node 2 candidates, explain them, and propose an
upgrade. Evidence, ICD codes and guidelines are copied from Node 2, never from
the model. Shared knowledge validators own slug and Active catalogue checks.
No patient data, model output or validation exception is logged or persisted.
"""

from copy import deepcopy
from typing import Any, Literal

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
    """The existing Node 2 mapping, without any LLM-owned fields."""

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


def run_node4(state: PipelineState, db: Session) -> PipelineState:
    """Validate one Node 3 proposal, returning a fresh state with <= 3 results.

    Success is Completed/Full. Invalid reasoning is Degraded/RuleOnly with
    deterministic candidates and the existing priority floor. Invalid baseline
    evidence/catalogue data yields no suggestions. ``validation_result`` and
    ``error`` contain fixed codes only, suitable for later audit metadata.
    Database/infrastructure failures propagate to the worker; this function
    never writes, commits, rolls back, calls a reader or invokes an LLM.
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

    # Preserve both the deterministic floor and any existing higher priority.
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
        # Including the fourth, hidden candidate prevents display truncation
        # from masking an invalid code. These are the only catalogue reads.
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
        # The client already decodes JSON. A string, malformed object, extra
        # evidence/priority field or coerced boolean is rejected here.
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
    if any(not row.reason.strip() for row in proposal.ranking):
        return _reject(result, "INVALID_REASON")

    displayed = _display([expected[code] for code in codes])
    for candidate, ranked in zip(displayed, proposal.ranking):
        # Free text is an explanation, never an authoritative evidence source.
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
        # Never propagate Pydantic's input-bearing error details.
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


def _validation_result(valid: bool, errors: list[str]) -> dict[str, Any]:
    return {"valid": valid, "errors": errors, "schema_version": OUTPUT_SCHEMA_VERSION}


def _reject(result: PipelineState, code: str) -> PipelineState:
    result.update(ai_status="Degraded", mode="RuleOnly", error=code)
    result["validation_result"] = _validation_result(False, [code])
    return result
