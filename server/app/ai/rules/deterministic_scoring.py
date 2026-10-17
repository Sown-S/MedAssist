"""Pure, provisional Node 2 scoring over an Active reader snapshot.

Temporary reader mapping (reconcile with OKF and the concrete reader): a
condition has ``condition_code``, ``name_vi``, optional ``icd10_code``, nested
``symptoms`` (condition-symptom rows) and ``guidelines`` (excerpt rows). Relations
use ``symptom_code``, ``polarity`` (SUPPORTS/CONTRADICTS), ``weight`` in [0, 1]
and ``is_key``. All rows must come from the reader's Active methods.

Provisional formula, to be reviewed after Sprint 3 evaluation:
* coverage = weight of PRESENT SUPPORTS / weight of all SUPPORTS;
* precision = number of PRESENT SUPPORTS / number of PRESENT catalogue symptoms;
* score = harmonic mean(coverage, precision) * (1 - contradiction ratio), where
  contradiction ratio is contradicted weight / weight of all usable relations.
PRESENT CONTRADICTS and ABSENT SUPPORTS are counter-evidence. ABSENT CONTRADICTS
is neutral: lack of counter-evidence is not evidence for a condition. UNKNOWN
(including omitted symptoms) is never evidence. Zero-weight relations are
ignored. Only conditions with positive supporting evidence are retrieved.

These scores are ranking aids, not probabilities or clinical thresholds. No
clinical facts, catalogue entries or guidelines are supplied by this module.
"""

from collections.abc import Mapping, Sequence
from copy import deepcopy
from decimal import Decimal
from fractions import Fraction
import math
from typing import Any

from app.ai.interfaces import JsonObject


class ScoringFormatError(ValueError):
    """The reader snapshot or confirmed features do not follow the mapping."""


def rank_conditions(
    input_features: JsonObject,
    conditions: Sequence[JsonObject],
    symptoms: Sequence[JsonObject],
) -> list[dict[str, Any]]:
    """Rank all supported conditions; Node 2 applies its four-candidate cap.

    Use exact fractions internally so relation order cannot affect close scores
    or ties. Export ordinary floats for serializable pipeline state. Catalogue
    intersection here restricts retrieval; shared code/Active validation remains
    the responsibility of ``validation.knowledge_validators`` at the boundaries.
    """
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

        guidelines = sorted(
            _objects(condition.get("guidelines", ()), "condition.guidelines"),
            key=lambda item: _text(item, "excerpt_key"),
        )
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
            "guidelines": deepcopy([dict(item) for item in guidelines]),
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
    # Numeric(3, 2) from the future reader may be a Decimal. Reject non-finite
    # values and booleans explicitly instead of letting them enter the sort.
    if (
        not isinstance(value, (int, float, Decimal))
        or isinstance(value, bool)
        or (isinstance(value, Decimal) and not value.is_finite())
        or (isinstance(value, float) and not math.isfinite(value))
        or not 0 <= value <= 1
    ):
        raise ScoringFormatError("weight phải là số hữu hạn trong [0, 1]")
    return Fraction(str(value))
