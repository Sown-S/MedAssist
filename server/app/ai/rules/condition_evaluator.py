"""Đánh giá cây ``condition_logic`` bằng logic ba giá trị Kleene mạnh (TRUE/FALSE/UNKNOWN).

Đặc tả nút nhóm (``AND``/``OR``) và lá (``symptom``, ``vital``, ``age``) theo ``knowledge/_spec/okf_format.md``.
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
    """Phát sinh khi cây điều kiện không theo định dạng được hỗ trợ."""


@dataclass(frozen=True)
class EvaluationResult:
    value: TruthValue
    missing: tuple[str, ...] = ()


_COMPARATORS: dict[str, Callable[[Any, Any], bool]] = {
    "<": operator.lt,
    "<=": operator.le,
    ">": operator.gt,
    ">=": operator.ge,
    "==": operator.eq,
}
_SYMPTOM_STATES = frozenset({"PRESENT", "ABSENT", "UNKNOWN"})
_MAX_DEPTH = 5


def evaluate_condition(
    condition_logic: Mapping[str, Any], input_features: Mapping[str, Any]
) -> EvaluationResult:
    """Đánh giá một cây điều kiện trên đặc trưng lượt khám đã chuẩn hóa."""

    if not isinstance(input_features, Mapping):
        raise ConditionFormatError("input_features phải là object")
    result = _evaluate_node(condition_logic, input_features, depth=1)
    if result.value is not TruthValue.UNKNOWN:
        return EvaluationResult(result.value)
    return EvaluationResult(result.value, tuple(dict.fromkeys(result.missing)))


def _evaluate_node(
    node: Mapping[str, Any], features: Mapping[str, Any], *, depth: int
) -> EvaluationResult:
    if depth > _MAX_DEPTH:
        raise ConditionFormatError("condition_logic chỉ được lồng tối đa 5 tầng")
    if not isinstance(node, Mapping):
        raise ConditionFormatError("Mỗi nút condition_logic phải là object")
    if "op" in node:
        return _evaluate_group(node, features, depth=depth)

    leaf_type = node.get("type")
    if leaf_type == "symptom":
        return _evaluate_symptom(node, features)
    if leaf_type == "vital":
        return _evaluate_numeric_leaf(node, features, "vital_signs")
    if leaf_type == "age":
        return _evaluate_numeric_leaf(node, features, "age_years")
    raise ConditionFormatError(f"Loại điều kiện không được hỗ trợ: {leaf_type!r}")


def _evaluate_group(
    node: Mapping[str, Any], features: Mapping[str, Any], *, depth: int
) -> EvaluationResult:
    logical_operator = node.get("op")
    children = node.get("args")
    if logical_operator not in {"AND", "OR"}:
        raise ConditionFormatError(f"Toán tử logic không hợp lệ: {logical_operator!r}")
    if (
        not isinstance(children, Sequence)
        or isinstance(children, (str, bytes))
        or not children
    ):
        raise ConditionFormatError("args phải là danh sách không rỗng")

    # Đánh giá mọi node con để khóa sinh hiệu sai không thể ẩn sau short-circuit
    # của giá trị logic.
    results = [_evaluate_node(child, features, depth=depth + 1) for child in children]
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
    code = node.get("symptom_code")
    expected = node.get("state")
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
    comparator_name = node.get("cmp")
    comparator = _COMPARATORS.get(comparator_name)
    threshold = node.get("value")
    if comparator is None:
        raise ConditionFormatError(f"Toán tử so sánh không hợp lệ: {comparator_name!r}")
    if not _is_number(threshold):
        raise ConditionFormatError("Ngưỡng so sánh phải là số")

    if feature_type == "vital_signs":
        key = node.get("vital")
        if key not in vital_sign_keys():
            raise ConditionFormatError(f"Khóa sinh hiệu không hợp lệ: {key!r}")
        vitals = features.get("vital_signs", {})
        if not isinstance(vitals, Mapping):
            raise ConditionFormatError("input_features.vital_signs phải là object")
        actual = vitals.get(key)
        missing_key = f"vital_signs.{key}"
    else:
        unit = node.get("unit")
        if unit not in ("years", "months"):
            raise ConditionFormatError("unit của tuổi phải là years hoặc months")
        missing_key = "age_years" if unit == "years" else "age_months"
        actual = features.get(missing_key)

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
