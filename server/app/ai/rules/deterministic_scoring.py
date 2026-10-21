"""Chấm điểm tất định Node 2 trên tập bệnh và triệu chứng Active.

Điểm dựa trên trung bình điều hòa của ``coverage`` và ``precision`` trừ tỷ lệ bằng chứng phản bác.
"""

from collections.abc import Mapping, Sequence
from copy import deepcopy
from decimal import Decimal
from fractions import Fraction
import math
from typing import Any

from app.ai.interfaces import JsonObject


class ScoringFormatError(ValueError):
    """Snapshot reader hoặc đặc trưng đã xác nhận không theo mapping."""


def rank_conditions(
    input_features: JsonObject,
    conditions: Sequence[JsonObject],
    symptoms: Sequence[JsonObject],
) -> list[dict[str, Any]]:
    """Xếp hạng các bệnh có bằng chứng ủng hộ dương; tính nội bộ bằng ``Fraction`` để tránh lệch thứ tự."""
    if not isinstance(input_features, Mapping):
        raise ScoringFormatError("input_features phải là object")
    observed = input_features.get("symptoms", {})
    if not isinstance(observed, Mapping):
        raise ScoringFormatError("input_features.symptoms phải là object")
    for status in observed.values():
        if not isinstance(status, str) or status not in ("PRESENT", "ABSENT", "UNKNOWN"):
            raise ScoringFormatError("Trạng thái triệu chứng không hợp lệ")

    catalogue: set[str] = set()
    for symptom in _objects(symptoms, "symptoms"):
        code = _text(symptom, "symptom_code")
        if code in catalogue:
            raise ScoringFormatError("Catalog Active có mã triệu chứng trùng")
        catalogue.add(code)
    present_count = sum(observed.get(code) == "PRESENT" for code in catalogue)

    seen: set[str] = set()
    ranked = []
    for condition in _objects(conditions, "conditions"):
        code = _text(condition, "condition_code")
        if code in seen:
            raise ScoringFormatError("Danh sách Active có mã bệnh trùng")
        seen.add(code)
        name = _text(condition, "name_vi")
        icd10 = condition.get("icd10_code")
        if icd10 is not None and not isinstance(icd10, str):
            raise ScoringFormatError("icd10_code phải là chuỗi hoặc null")

        supporting = []
        contradicting = []
        unknown = []
        support_total = Fraction(0)
        relation_total = Fraction(0)
        matched_weight = Fraction(0)
        contradicted_weight = Fraction(0)
        linked: set[str] = set()
        for relation in _objects(condition.get("symptoms", ()), "condition.symptoms"):
            symptom_code = _text(relation, "symptom_code")
            if symptom_code in linked:
                raise ScoringFormatError("Bệnh có quan hệ triệu chứng trùng")
            linked.add(symptom_code)
            polarity = relation.get("polarity")
            if polarity not in ("SUPPORTS", "CONTRADICTS"):
                raise ScoringFormatError("polarity phải là SUPPORTS hoặc CONTRADICTS")
            weight = _weight(relation.get("weight"))
            is_key = relation.get("is_key", False)
            if not isinstance(is_key, bool):
                raise ScoringFormatError("is_key phải là boolean")
            if symptom_code not in catalogue or not weight:
                continue

            relation_total += weight
            if polarity == "SUPPORTS":
                support_total += weight
            status = observed.get(symptom_code, "UNKNOWN")
            if status == "UNKNOWN":
                if is_key:
                    unknown.append(symptom_code)
                continue
            evidence = {
                "symptom_code": symptom_code,
                "status": status,
                "polarity": polarity,
                "weight": float(weight),
                "is_key": is_key,
            }
            if polarity == "SUPPORTS" and status == "PRESENT":
                supporting.append(evidence)
                matched_weight += weight
            elif (polarity == "SUPPORTS" and status == "ABSENT") or (
                polarity == "CONTRADICTS" and status == "PRESENT"
            ):
                contradicting.append(evidence)
                contradicted_weight += weight

        guidelines = _guidelines(condition.get("guidelines", ()))
        if not matched_weight:
            continue
        coverage = matched_weight / support_total
        precision = Fraction(len(supporting), present_count)
        score = 2 * coverage * precision / (coverage + precision)
        score *= 1 - contradicted_weight / relation_total
        candidate = {
            "condition_code": code,
            "name_vi": name,
            "icd10_code": icd10,
            "score": float(score),
            "coverage": float(coverage),
            "precision": float(precision),
            "supporting_evidence": sorted(supporting, key=lambda item: item["symptom_code"]),
            "contradicting_evidence": sorted(contradicting, key=lambda item: item["symptom_code"]),
            "guidelines": deepcopy(guidelines),
            "unknown_key_symptoms": sorted(unknown),
            "label": "Reference Suggestion",
        }
        ranked.append((score, coverage, precision, code, candidate))

    ranked.sort(key=lambda item: (-item[0], -item[1], -item[2], item[3]))
    return [item[4] for item in ranked]


def _objects(value: object, label: str) -> Sequence[JsonObject]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise ScoringFormatError(f"{label} phải là danh sách object")
    if any(not isinstance(item, Mapping) for item in value):
        raise ScoringFormatError(f"{label} phải là danh sách object")
    return value


def _text(value: JsonObject, key: str) -> str:
    text = value.get(key)
    if not isinstance(text, str) or not text.strip():
        raise ScoringFormatError(f"{key} phải là chuỗi không rỗng")
    return text


def _weight(value: object) -> Fraction:
    # Numeric(3, 2) từ reader tương lai có thể là Decimal. Từ chối rõ giá trị không
    # hữu hạn và boolean thay vì để chúng đi vào phép sắp xếp.
    if (
        not isinstance(value, (int, float, Decimal))
        or isinstance(value, bool)
        or (isinstance(value, Decimal) and not value.is_finite())
        or (isinstance(value, float) and not math.isfinite(value))
        or not 0 <= value <= 1
    ):
        raise ScoringFormatError("weight phải là số hữu hạn trong [0, 1]")
    return Fraction(str(value))


def _guidelines(value: object) -> list[dict[str, str | None]]:
    """Chiếu guideline của reader về đúng hợp đồng ổn định mà Node 2 công bố."""
    projected: list[dict[str, str | None]] = []
    seen: set[str] = set()
    for item in _objects(value, "condition.guidelines"):
        excerpt_key = _text(item, "excerpt_key")
        if excerpt_key in seen:
            raise ScoringFormatError("Bệnh có guideline trùng excerpt_key")
        seen.add(excerpt_key)
        source_locator = item.get("source_locator")
        if source_locator is not None and (
            not isinstance(source_locator, str) or not source_locator.strip()
        ):
            raise ScoringFormatError("source_locator phải là chuỗi không rỗng hoặc null")
        projected.append(
            {
                "excerpt_key": excerpt_key,
                "title": _text(item, "title"),
                "content": _text(item, "content"),
                "source_title": _text(item, "source_title"),
                "source_locator": source_locator,
            }
        )
    projected.sort(key=lambda item: item["excerpt_key"] or "")
    return projected
