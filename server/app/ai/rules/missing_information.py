"""Deterministic FR14 suggestions from the leading Node 2 candidates.

Consume Node 2's ``unknown_key_symptoms`` and the reader's Active symptom
catalogue from the same assessment snapshot. Only the first three candidates
contribute, in their supplied ranking order. Within a candidate, sort codes and
omit duplicates already suggested for a higher-ranked candidate.

Omitted confirmed symptoms mean UNKNOWN, as in Node 2. Recheck their state so a
symptom subsequently marked PRESENT/ABSENT is never requested again. Free text,
unconfirmed extraction, vital signs and age do not contribute FR14 suggestions.
This helper returns internal symptom codes, not diagnoses or a display payload;
the output layer supplies the "Reference Suggestion" label. It performs no LLM
calls, knowledge queries, logging, writes or priority changes.
"""

from collections.abc import Mapping, Sequence

from app.ai.interfaces import JsonObject

MAX_RELEVANT_CANDIDATES = 3


class MissingInformationFormatError(ValueError):
    """Confirmed features or the Node 2/reader snapshot have an invalid shape."""


def find_missing_information(
    input_features: JsonObject,
    candidates: Sequence[JsonObject],
    symptoms: Sequence[JsonObject],
) -> list[str]:
    """List unique UNKNOWN key symptoms relevant to the leading candidates.

    ``candidates`` must be the ranked closed list produced by Node 2, after the
    Node 1 gate; pass an empty list for terminal red-flag states. ``symptoms``
    must come from ``KnowledgeReader.active_symptoms()``. Catalogue intersection
    restricts suggestions here; shared Active/code validation at the application
    boundaries remains in ``validation.knowledge_validators``.
    """
    if not isinstance(input_features, Mapping):
        raise MissingInformationFormatError("input_features phải là object")
    observed = input_features.get("symptoms", {})
    if not isinstance(observed, Mapping):
        raise MissingInformationFormatError("input_features.symptoms phải là object")
    for status in observed.values():
        if not isinstance(status, str) or status not in ("PRESENT", "ABSENT", "UNKNOWN"):
            raise MissingInformationFormatError("Trạng thái triệu chứng không hợp lệ")

    catalogue = {
        _code(symptom.get("symptom_code"))
        for symptom in _objects(symptoms, "symptoms")
    }
    missing: list[str] = []
    seen: set[str] = set()
    for candidate in _objects(candidates, "candidates")[:MAX_RELEVANT_CANDIDATES]:
        codes = candidate.get("unknown_key_symptoms", ())
        if not isinstance(codes, Sequence) or isinstance(codes, (str, bytes, bytearray)):
            raise MissingInformationFormatError("unknown_key_symptoms phải là danh sách mã")
        for code in sorted({_code(value) for value in codes}):
            if code in catalogue and observed.get(code, "UNKNOWN") == "UNKNOWN" and code not in seen:
                missing.append(code)
                seen.add(code)
    return missing


def _objects(value: object, label: str) -> Sequence[JsonObject]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise MissingInformationFormatError(f"{label} phải là danh sách object")
    if any(not isinstance(item, Mapping) for item in value):
        raise MissingInformationFormatError(f"{label} phải là danh sách object")
    return value


def _code(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MissingInformationFormatError("Mã triệu chứng phải là chuỗi không rỗng")
    return value
