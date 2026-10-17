"""FR12: worker-only, tentative extraction from de-identified Vietnamese text.

The caller runs Node 1 first and supplies the remaining queue budget and all
known identifying values (name, address, DOB, phone, IDs and any aliases in the
note). Pattern masking supplements those values; it is not a general-purpose
named-entity recognizer. Nothing here logs, persists or changes clinical state.
Only a nurse's later confirmation may copy suggestions into input_features.
"""

import asyncio
from collections.abc import Sequence
import json
import math
import re
from time import monotonic
from typing import Literal, TypedDict
import unicodedata

from pydantic import TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.llm.client import LLMError
from app.ai.llm.output_schemas import ExtractionOutput, extraction_json_schema
from app.ai.llm.prompts import EXTRACTION_PROMPT_VERSION, load_prompt
from app.ai.pipeline.state import PipelineState
from app.exceptions import AppError
from app.validation import knowledge_validators

EXTRACTION_TIMEOUT_SECONDS = 30
_CODES = TypeAdapter(list[knowledge_validators.SymptomCode])
_MASK = "[REDACTED]"

# Labelled names/addresses/IDs may contain spaces, punctuation and digits. Mask
# the whole field conservatively, including commas in an address. Known values
# below also cover identifiers occurring without labels elsewhere in the note.
_IDENTITY_FIELDS = re.compile(
    r"(?i)\b(?:địa\s*chỉ|dia\s*chi|address|nơi\s*ở|noi\s*o)"
    r"\s*[:=]?\s*[^\r\n;!?]+"
    r"|\b(?:họ(?:\s+và)?\s*tên|ho(?:\s+va)?\s*ten|tên\s+bệnh\s+nhân|"
    r"bệnh\s+nhân|benh\s+nhan|bn|full_name|patient(?:\s+name)?|"
    r"ngày\s*sinh|ngay\s*sinh|sinh\s+ngày|dob|date_of_birth|"
    r"cccd|cmnd|bhyt|số\s*điện\s*thoại|sdt|sđt|phone|"
    r"mã\s*bệnh\s*nhân|patient_id|visit_id)\s*[:=]?\s*[^\r\n,;!?]+"
    r"|\b(?:tên|ten|name|email)\s*[:=]\s*[^\r\n,;!?]+"
)
_CONTACT_PATTERNS = (
    re.compile(r"[\w.+-]+@[\w.-]+\.[^\W\d_]{2,}", re.UNICODE),
    re.compile(r"\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b", re.I),
    re.compile(r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b"),
    # Phone/identity numbers, including +84, spaces, dots, hyphens or brackets.
    re.compile(r"(?<!\w)\+?\d(?:[\s().-]*\d){8,14}(?!\w)"),
)


class SymptomSuggestion(TypedDict):
    symptom_code: str
    status: Literal["PRESENT", "ABSENT", "UNKNOWN"]
    label: Literal["Reference Suggestion"]
    requires_confirmation: Literal[True]


async def extract_symptoms(
    text: str,
    knowledge_reader: KnowledgeReader,
    llm_client: LLMClient,
    db: Session,
    *,
    gate_state: PipelineState,
    identifiers: Sequence[str],
    timeout_seconds: float,
) -> list[SymptomSuggestion]:
    """Return Active suggestions, never confirmed assessment features.

    Call only from the worker via assessment_service, outside the assessment
    graph. ``gate_state`` must be the result of Node 1 on confirmed data; a red
    flag skips extraction. ``identifiers`` is required, even when empty, so the
    worker explicitly supplies every known identifying value before inference.
    Do not pass raw patient objects/metadata into the prompt.

    ``timeout_seconds`` is the time remaining since queueing, capped at 30s.
    Preparation and validation consume that same budget. Exhaustion, typed LLM
    failures and invalid output yield []; no retries. Worker cancellation and
    infrastructure/programming errors propagate. The session is only passed to
    the shared Active validator, never used for writes/commit/rollback here.
    """
    started = monotonic()
    if (
        gate_state.get("is_red_flag") is True
        or gate_state.get("ai_status") == "Skipped"
        or gate_state.get("priority_rule") == "Emergency"
        or gate_state.get("priority_final") == "Emergency"
    ):
        return []
    if (
        gate_state.get("is_red_flag") is not False
        or gate_state.get("priority_rule") not in ("Routine", "HighPriority")
        or gate_state.get("priority_final") not in ("Routine", "HighPriority")
    ):
        raise ValueError("Phải chạy Node 1 trước khi trích xuất triệu chứng")
    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, (int, float))
        or not math.isfinite(timeout_seconds)
    ):
        raise ValueError("Extraction timeout must be finite seconds.")
    deadline = started + min(timeout_seconds, EXTRACTION_TIMEOUT_SECONDS)
    if deadline <= monotonic():
        return []

    masked = _redact_identifiers(text, identifiers)
    if not masked.strip() or not masked.replace(_MASK, "").strip(" \t\r\n,;:.!?"):
        return []
    catalogue = _catalogue(knowledge_reader)
    if not catalogue:
        return []
    allowed = {row["symptom_code"] for row in catalogue}
    prompt = load_prompt(EXTRACTION_PROMPT_VERSION) + "\n" + json.dumps(
        {"catalogue": catalogue, "text": masked}, ensure_ascii=False, allow_nan=False,
    )
    remaining = deadline - monotonic()
    if remaining <= 0:
        return []
    try:
        async with asyncio.timeout(remaining):
            output = await llm_client.generate_json(
                prompt=prompt, schema=extraction_json_schema(), timeout_seconds=remaining,
            )
    except (LLMError, TimeoutError):
        return []
    if monotonic() >= deadline:
        return []

    # Extraction is a separate FR12 operation, so apply its schema/Active checks
    # here. Node 4 still validates any later, nurse-confirmed assessment output.
    suggestions = _validated_suggestions(output, allowed)
    if not suggestions:
        return []
    try:
        # Recheck after inference: a code may have been retired while waiting.
        knowledge_validators.active_symptoms(db, [row["symptom_code"] for row in suggestions])
    except AppError as exc:
        if exc.code != "UNKNOWN_SYMPTOM":
            raise
        return []
    return suggestions if monotonic() < deadline else []


def _normalise(value: str) -> str:
    # Normalise decomposed Vietnamese/full-width text; remove invisible format
    # characters so they cannot defeat an exact identifying-value match.
    return "".join(
        char for char in unicodedata.normalize("NFKC", value)
        if unicodedata.category(char) != "Cf"
    )


def _redact_identifiers(text: str, identifiers: Sequence[str]) -> str:
    if (
        not isinstance(text, str)
        or not isinstance(identifiers, Sequence)
        or isinstance(identifiers, (str, bytes))
        or any(not isinstance(value, str) or not value.strip() for value in identifiers)
    ):
        raise ValueError("Invalid extraction text or identifying values.")
    masked = _normalise(text)
    values = sorted({_normalise(value).strip() for value in identifiers}, key=len, reverse=True)
    if any(not value for value in values):
        raise ValueError("Invalid extraction identifying values.")
    if values:
        # Escape literal identifiers, match flexible whitespace/case, and mask
        # overlaps in one pass. No identifier is treated as a regex or logged.
        pattern = "|".join(r"\s+".join(re.escape(part) for part in value.split()) for value in values)
        masked = re.sub(pattern, _MASK, masked, flags=re.IGNORECASE)
    masked = _IDENTITY_FIELDS.sub(_MASK, masked)
    for pattern in _CONTACT_PATTERNS:
        masked = pattern.sub(_MASK, masked)
    return masked


def _catalogue(reader: KnowledgeReader) -> list[dict[str, str]]:
    rows = reader.active_symptoms()
    try:
        codes = _CODES.validate_python([row["symptom_code"] for row in rows], strict=True)
        names = [row.get("symptom_name", code) for row, code in zip(rows, codes, strict=True)]
        if len(set(codes)) != len(codes) or any(
            not isinstance(name, str) or not name.strip() for name in names
        ):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        # Shared code validators own slug/length rules; suppress input-bearing
        # Pydantic details. Reader/infrastructure failures otherwise propagate.
        raise ValueError("Invalid Active symptom catalogue.") from None
    # The current Symptom model uses symptom_name. Missing names fall back to
    # codes until the concrete reader mapping is integrated; no other metadata
    # (IDs, audit fields, notes, etc.) is copied into the prompt.
    return [
        {"symptom_code": code, "symptom_name": name}
        for code, name in sorted(zip(codes, names, strict=True))
    ]


def _validated_suggestions(output: object, allowed: set[str]) -> list[SymptomSuggestion]:
    if not isinstance(output, dict):
        return []
    try:
        proposal = ExtractionOutput.model_validate(output, strict=True)
        _CODES.validate_python([row.symptom_code for row in proposal.symptoms], strict=True)
    except ValidationError:
        return []
    statuses: dict[str, Literal["PRESENT", "ABSENT", "UNKNOWN"]] = {}
    for row in proposal.symptoms:
        if row.symptom_code not in allowed:
            continue
        if row.symptom_code in statuses and statuses[row.symptom_code] != row.status:
            # Conflicting generated statuses must not silently select one.
            return []
        statuses[row.symptom_code] = row.status
    return [
        {"symptom_code": code, "status": status,
         "label": "Reference Suggestion", "requires_confirmation": True}
        for code, status in sorted(statuses.items())
    ]
