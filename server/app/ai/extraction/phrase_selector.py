"""Một lần Gemma chọn mã trong ứng viên từng cụm; chưa bật mặc định."""

import asyncio
import json
import math
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from time import monotonic

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.ai.extraction import compact_selection
from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.feature_extractor import SymptomSuggestion, _validated_suggestions
from app.ai.extraction.phrase_retrieval import RetrievalPlan, retrieve_phrases
from app.ai.extraction.phrase_splitter import IncompleteSegmentation
from app.ai.extraction.selection_groups import group_for_selection
from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.llm.client import LLMError
from app.ai.llm.output_schemas import ExtractionOutput
from app.ai.llm.prompts import PHRASE_EXTRACTION_PROMPT_VERSION, load_prompt
from app.ai.pipeline.state import PipelineState
from app.exceptions import AppError
from app.validation import knowledge_validators

# Giới hạn tài nguyên cục bộ; KHÔNG coi byte là tokenizer hoặc đảm bảo vừa context.
# Ollama vẫn kiểm token thực tế bằng truncate=false; đầu ra length bị từ chối.
MAX_REQUEST_BYTES = 24000
MAX_GROUPS = 12


@dataclass(frozen=True)
class SelectionResult:
    completed: bool
    failure_code: str | None = None
    suggestions: tuple[SymptomSuggestion, ...] = field(default=(), repr=False)
    prompt_version: str = PHRASE_EXTRACTION_PROMPT_VERSION


def selection_request(plan: RetrievalPlan) -> tuple[str, dict]:
    """Schema bắt buộc mọi cụm; enum riêng để không chọn mã của cụm khác."""
    if len(plan.groups) > MAX_GROUPS:
        raise IncompleteSegmentation("Extraction group count exceeds selection budget.")
    catalogue, groups, properties = {}, {}, {}
    for group in plan.groups:
        key = group.phrase.phrase_id
        codes = [candidate.symptom_code for candidate in group.candidates]
        catalogue.update({candidate.symptom_code: candidate.symptom_name for candidate in group.candidates})
        groups[key] = {"phrase": group.phrase.text, "context": group.phrase.context, "codes": codes}
        code_schema = {"type": "string", "enum": codes} if codes else {"type": "string"}
        properties[key] = {"type": "array", "maxItems": len(codes), "items": {
            "type": "object", "properties": {
                "symptom_code": code_schema,
                "status": {"type": "string", "enum": ["PRESENT", "ABSENT", "UNKNOWN"]},
            }, "required": ["symptom_code", "status"], "additionalProperties": False,
        }}
    properties["unmapped"] = {"type": "array", "items": {"type": "string", "enum": list(groups)},
                              "uniqueItems": True, "maxItems": len(groups)}
    schema = {"title": "PhraseExtractionOutput", "type": "object", "properties": properties,
              "required": list(properties), "additionalProperties": False}
    payload = {"catalogue": dict(sorted(catalogue.items())), "groups": groups, "text": plan.masked_text}
    prompt = load_prompt(PHRASE_EXTRACTION_PROMPT_VERSION) + "\n" + json.dumps(
        payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"),
    )
    if len(prompt.encode("utf-8")) + len(json.dumps(schema).encode("utf-8")) > MAX_REQUEST_BYTES:
        raise IncompleteSegmentation("Extraction request exceeds byte guard.")
    return prompt, schema


def validate_selection(output: object, plan: RetrievalPlan) -> SelectionResult:
    allowed = {group.phrase.phrase_id: {row.symptom_code for row in group.candidates} for group in plan.groups}
    if not isinstance(output, dict) or set(output) != set(allowed) | {"unmapped"}:
        return SelectionResult(False, "INVALID_SELECTION")
    unmapped = output["unmapped"]
    if (not isinstance(unmapped, list) or any(not isinstance(key, str) or key not in allowed for key in unmapped)
            or len(unmapped) != len(set(unmapped))):
        return SelectionResult(False, "INVALID_SELECTION")
    merged = []
    try:
        for key, codes in allowed.items():
            parsed = ExtractionOutput.model_validate({"symptoms": output[key]}, strict=True)
            selected = [row.symptom_code for row in parsed.symptoms]
            if len(selected) != len(set(selected)) or not set(selected) <= codes:
                return SelectionResult(False, "INVALID_SELECTION")
            merged.extend(row.model_dump() for row in parsed.symptoms)
    except ValidationError:
        return SelectionResult(False, "INVALID_SELECTION")
    if unmapped:
        return SelectionResult(False, "UNMAPPED_PHRASE")
    suggestions = _validated_suggestions({"symptoms": merged}, set().union(*allowed.values()))
    if merged and not suggestions:
        return SelectionResult(False, "CONFLICTING_SELECTION")
    return SelectionResult(True, suggestions=tuple(suggestions))


async def select_phrase_symptoms(
    text: str, knowledge_reader: KnowledgeReader, llm_client: LLMClient, db: Session, *,
    gate_state: PipelineState, identifiers: Sequence[str], timeout_seconds: float,
    cache: CandidateIndexCache, per_phrase_limit: int,
) -> SelectionResult:
    """Node 1 -> truy xuất -> một generate_json -> validation Active/HITL, chung deadline."""
    started = monotonic()
    prompt_version = PHRASE_EXTRACTION_PROMPT_VERSION
    compact = False
    if (gate_state.get("is_red_flag") is True or gate_state.get("ai_status") == "Skipped"
            or gate_state.get("priority_rule") == "Emergency" or gate_state.get("priority_final") == "Emergency"):
        return SelectionResult(False, "RED_FLAG_SKIPPED")
    if (gate_state.get("is_red_flag") is not False
            or gate_state.get("priority_rule") not in ("Routine", "HighPriority")
            or gate_state.get("priority_final") not in ("Routine", "HighPriority")):
        raise ValueError("Node 1 must run before phrase extraction.")
    if (isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, (int, float))
            or not math.isfinite(timeout_seconds)):
        raise ValueError("Extraction timeout must be finite seconds.")
    deadline = started + min(timeout_seconds, 30)
    if deadline <= monotonic():
        return SelectionResult(False, "EXTRACTION_TIMEOUT")
    try:
        plan = retrieve_phrases(text, knowledge_reader, cache, identifiers=identifiers,
                                per_phrase_limit=per_phrase_limit, deadline=deadline)
        plan = group_for_selection(plan)
        if not plan.masked_text.replace("[REDACTED]", "").strip(" \t\r\n,;:.!?"):
            return SelectionResult(True)
        if not plan.groups:
            return SelectionResult(True)
        # Với nhiều nhóm, ID ngắn giảm token sinh. Kết quả vẫn giải mã về
        # đúng mã ứng viên của từng nhóm trước validator hiện có.
        compact = len(plan.groups) >= 4
        if compact:
            prompt_version = compact_selection.PROMPT_VERSION
            prompt, schema = compact_selection.selection_request(plan)
        else:
            prompt, schema = selection_request(plan)
        remaining = deadline - monotonic()
        if remaining <= 0:
            return SelectionResult(False, "EXTRACTION_TIMEOUT", prompt_version=prompt_version)
        async with asyncio.timeout(remaining):
            output = await llm_client.generate_json(prompt=prompt, schema=schema, timeout_seconds=remaining)
            if compact:
                output = compact_selection.decode_selection(output, plan)
    except IncompleteSegmentation:
        return SelectionResult(False, "REQUEST_BUDGET_EXCEEDED", prompt_version=prompt_version)
    except TimeoutError:
        return SelectionResult(False, "EXTRACTION_TIMEOUT", prompt_version=prompt_version)
    except LLMError as exc:
        return SelectionResult(False, type(exc).__name__, prompt_version=prompt_version)
    if monotonic() >= deadline:
        return SelectionResult(False, "EXTRACTION_TIMEOUT", prompt_version=prompt_version)
    if cache.get(knowledge_reader).snapshot_key != plan.snapshot_key:
        return SelectionResult(False, "KNOWLEDGE_SNAPSHOT_CHANGED", prompt_version=prompt_version)
    result = replace(validate_selection(output, plan), prompt_version=prompt_version)
    if not result.completed:
        return result
    if result.suggestions:
        try:
            knowledge_validators.active_symptoms(db, [row["symptom_code"] for row in result.suggestions])
        except AppError as exc:
            if exc.code != "UNKNOWN_SYMPTOM":
                raise
            return SelectionResult(False, "UNKNOWN_SYMPTOM", prompt_version=prompt_version)
    return result if monotonic() < deadline else SelectionResult(
        False, "EXTRACTION_TIMEOUT", prompt_version=prompt_version,
    )
