"""Evaluate triage ``condition_logic`` with strong Kleene three-valued logic.

Temporary AI-01 format assumption (reconcile with ``okf_format.md`` when it is
available):

* groups: ``{"op": "AND" | "OR", "conditions": [node, ...]}``
* symptom leaves: ``{"type": "symptom", "code": str, "status":
  "PRESENT" | "ABSENT"}``
* vital leaves: ``{"type": "vital_sign", "key": str, "operator": comparator,
  "value": number}``
* age leaves: ``{"type": "age", "operator": comparator, "value": number}``

Input features use ``symptoms`` (code -> PRESENT/ABSENT/UNKNOWN),
``vital_signs`` (key -> number), and optional ``age_years``. Missing values
produce UNKNOWN; malformed rules raise :class:`ConditionFormatError`.
"""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from enum import Enum
import math
import operator
from typing import Any

from app.validation.schema_validators import vital_sign_keys


class TruthValue(str, Enum):
    TRUE = "TRUE"
    FALSE = "FALSE"
    UNKNOWN = "UNKNOWN"


class ConditionFormatError(ValueError):
    """Raised when a condition tree does not follow the supported format."""


@dataclass(frozen=True)
class EvaluationResult:
    value: TruthValue
    missing: tuple[str, ...] = ()


_COMPARATORS: dict[str, Callable[[Any, Any], bool]] = {
    "eq": operator.eq,
    "ne": operator.ne,
    "gt": operator.gt,
    "gte": operator.ge,
    "lt": operator.lt,
    "lte": operator.le,
}
_SYMPTOM_STATES = frozenset({"PRESENT", "ABSENT", "UNKNOWN"})


def evaluate_condition(
    condition_logic: Mapping[str, Any], input_features: Mapping[str, Any]
) -> EvaluationResult:
    """Evaluate one condition tree against normalized visit features."""

    if not isinstance(input_features, Mapping):
        raise ConditionFormatError("input_features phải là object")
    result = _evaluate_node(condition_logic, input_features)
    if result.value is not TruthValue.UNKNOWN:
        return EvaluationResult(result.value)
    return EvaluationResult(result.value, tuple(dict.fromkeys(result.missing)))


def _evaluate_node(node: Mapping[str, Any], features: Mapping[str, Any]) -> EvaluationResult:
    if not isinstance(node, Mapping):
        raise ConditionFormatError("Mỗi nút condition_logic phải là object")
    if "op" in node:
        return _evaluate_group(node, features)

    leaf_type = node.get("type")
    if leaf_type == "symptom":
        return _evaluate_symptom(node, features)
    if leaf_type == "vital_sign":
        return _evaluate_numeric_leaf(node, features, "vital_signs")
    if leaf_type == "age":
        return _evaluate_numeric_leaf(node, features, "age_years")
    raise ConditionFormatError(f"Loại điều kiện không được hỗ trợ: {leaf_type!r}")


def _evaluate_group(node: Mapping[str, Any], features: Mapping[str, Any]) -> EvaluationResult:
    logical_operator = node.get("op")
    children = node.get("conditions")
    if logical_operator not in {"AND", "OR"}:
        raise ConditionFormatError(f"Toán tử logic không hợp lệ: {logical_operator!r}")
    if (
        not isinstance(children, Sequence)
        or isinstance(children, (str, bytes))
        or not children
    ):
        raise ConditionFormatError("conditions phải là danh sách không rỗng")

    # Evaluate every child so an invalid vital-sign key cannot hide behind a
    # truth-value short circuit.
    results = [_evaluate_node(child, features) for child in children]
    values = [result.value for result in results]
    missing = tuple(item for result in results for item in result.missing)

    if logical_operator == "AND":
        if TruthValue.FALSE in values:
            return EvaluationResult(TruthValue.FALSE)
        if TruthValue.UNKNOWN in values:
            return EvaluationResult(TruthValue.UNKNOWN, missing)
        return EvaluationResult(TruthValue.TRUE)

    if TruthValue.TRUE in values:
        return EvaluationResult(TruthValue.TRUE)
    if TruthValue.UNKNOWN in values:
        return EvaluationResult(TruthValue.UNKNOWN, missing)
    return EvaluationResult(TruthValue.FALSE)


def _evaluate_symptom(
    node: Mapping[str, Any], features: Mapping[str, Any]
) -> EvaluationResult:
    code = node.get("code")
    expected = node.get("status")
    if not isinstance(code, str) or not code:
        raise ConditionFormatError("Mã triệu chứng phải là chuỗi không rỗng")
    if expected not in {"PRESENT", "ABSENT"}:
        raise ConditionFormatError("Trạng thái luật phải là PRESENT hoặc ABSENT")

    symptoms = features.get("symptoms", {})
    if not isinstance(symptoms, Mapping):
        raise ConditionFormatError("input_features.symptoms phải là object")
    actual = symptoms.get(code, "UNKNOWN")
    if actual not in _SYMPTOM_STATES:
        raise ConditionFormatError(f"Trạng thái triệu chứng không hợp lệ: {actual!r}")
    if actual == "UNKNOWN":
        return EvaluationResult(TruthValue.UNKNOWN, (f"symptoms.{code}",))
    return EvaluationResult(TruthValue.TRUE if actual == expected else TruthValue.FALSE)


def _evaluate_numeric_leaf(
    node: Mapping[str, Any], features: Mapping[str, Any], feature_type: str
) -> EvaluationResult:
    comparator_name = node.get("operator")
    comparator = _COMPARATORS.get(comparator_name)
    threshold = node.get("value")
    if comparator is None:
        raise ConditionFormatError(f"Toán tử so sánh không hợp lệ: {comparator_name!r}")
    if not _is_number(threshold):
        raise ConditionFormatError("Ngưỡng so sánh phải là số")

    if feature_type == "vital_signs":
        key = node.get("key")
        if key not in vital_sign_keys():
            raise ConditionFormatError(f"Khóa sinh hiệu không hợp lệ: {key!r}")
        vitals = features.get("vital_signs", {})
        if not isinstance(vitals, Mapping):
            raise ConditionFormatError("input_features.vital_signs phải là object")
        actual = vitals.get(key)
        missing_key = f"vital_signs.{key}"
    else:
        actual = features.get("age_years")
        missing_key = "age_years"

    if actual is None:
        return EvaluationResult(TruthValue.UNKNOWN, (missing_key,))
    if not _is_number(actual):
        raise ConditionFormatError(f"Giá trị {missing_key} phải là số")
    return EvaluationResult(TruthValue.TRUE if comparator(actual, threshold) else TruthValue.FALSE)


def _is_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )
