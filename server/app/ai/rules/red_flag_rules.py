"""Đánh giá cờ đỏ và mức sàn ưu tiên tất định cho Node 1.

Luật đến từ ``KnowledgeReader.active_triage_rules()``; module không đóng gói ngưỡng
lâm sàng. Mapping dùng các trường luật hiện có: ``rule_key``, ``version``,
``rule_type``, ``reason_text`` và ``condition_logic``. Cây điều kiện dùng định dạng
đặc tả mà AI-01 hỗ trợ. Mức ưu tiên được suy ra từ loại luật, không bao giờ lấy từ
``resulting_priority`` được truyền vào.
"""

from collections.abc import Mapping, Sequence
from typing import Any, Literal, TypedDict

from app.ai.rules.condition_evaluator import (
    ConditionFormatError,
    TruthValue,
    evaluate_condition,
)

Priority = Literal["Routine", "HighPriority", "Emergency"]


class RuleHit(TypedDict):
    rule_key: str
    version: int
    reason: str


class TriageResult(TypedDict):
    priority: Priority
    rule_hits: list[RuleHit]
    is_red_flag: bool
    complete_now: list[str]


def evaluate_triage_rules(
    input_features: Mapping[str, Any], rules: Sequence[Mapping[str, Any]]
) -> TriageResult:
    """Đánh giá luật Active bằng logic Kleene và áp dụng mức sàn cao nhất.

    Chỉ luật TRUE được tính là khớp. Chỉ cờ đỏ UNKNOWN bổ sung đường dẫn đặc trưng
    thiếu vào ``complete_now`` (loại trùng theo thứ tự luật/cây). Khi cờ đỏ TRUE,
    Emergency đã được xác định nên không cần hoàn thiện dữ liệu để ra quyết định.
    Luật hoặc tập luật sai định dạng phát sinh lỗi rõ ràng thay vì âm thầm trả
    Routine. Sequence rỗng hợp lệ; mapping rỗng hoặc chuỗi không phải tập luật rỗng.
    """
    if not isinstance(input_features, Mapping):
        raise ConditionFormatError("input_features phải là object")
    if not isinstance(rules, Sequence) or isinstance(rules, (str, bytes, bytearray)):
        raise ConditionFormatError("rules phải là danh sách luật")

    hits: list[RuleHit] = []
    missing: list[str] = []
    is_red_flag = False
    has_floor = False

    for rule in rules:
        _validate_rule_metadata(rule)
        result = evaluate_condition(rule.get("condition_logic"), input_features)
        rule_type = rule["rule_type"]

        if result.value is TruthValue.TRUE:
            hits.append(
                {
                    "rule_key": rule["rule_key"],
                    "version": rule["version"],
                    "reason": rule["reason_text"],
                }
            )
            if rule_type == "RED_FLAG":
                is_red_flag = True
            else:
                has_floor = True
        elif result.value is TruthValue.UNKNOWN and rule_type == "RED_FLAG":
            missing.extend(result.missing)

    priority: Priority = "Routine"
    if is_red_flag:
        priority = "Emergency"
    elif has_floor:
        priority = "HighPriority"

    return {
        "priority": priority,
        "rule_hits": hits,
        "is_red_flag": is_red_flag,
        "complete_now": [] if is_red_flag else list(dict.fromkeys(missing)),
    }


def _validate_rule_metadata(rule: Mapping[str, Any]) -> None:
    if not isinstance(rule, Mapping):
        raise ConditionFormatError("Luật phân loại phải là object")
    if rule.get("rule_type") not in ("RED_FLAG", "PRIORITY_FLOOR"):
        raise ConditionFormatError("rule_type phải là RED_FLAG hoặc PRIORITY_FLOOR")
    for key in ("rule_key", "reason_text"):
        value = rule.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ConditionFormatError(f"{key} phải là chuỗi không rỗng")
    version = rule.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise ConditionFormatError("version phải là số nguyên dương")
