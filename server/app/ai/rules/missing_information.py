"""Tổng hợp triệu chứng then chốt còn ``UNKNOWN`` từ tối đa 3 ứng viên dẫn đầu của Node 2 (FR14)."""

from collections.abc import Mapping, Sequence

from app.ai.interfaces import JsonObject

MAX_RELEVANT_CANDIDATES = 3


class MissingInformationFormatError(ValueError):
    """Đặc trưng đã xác nhận hoặc snapshot Node 2/reader có hình dạng không hợp lệ."""


def find_missing_information(
    input_features: JsonObject,
    candidates: Sequence[JsonObject],
    symptoms: Sequence[JsonObject],
) -> list[str]:
    """Trả danh sách mã triệu chứng key đang ``UNKNOWN`` (không trùng, chỉ thuộc catalog Active)."""
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
