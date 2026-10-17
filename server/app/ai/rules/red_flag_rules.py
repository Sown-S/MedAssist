"""Deterministic red-flag and priority-floor evaluation for Node 1.

Rules come from ``KnowledgeReader.active_triage_rules()``; no clinical thresholds
are bundled here. The mapping uses the existing triage-rule fields ``rule_key``,
``version``, ``rule_type``, ``reason_text`` and ``condition_logic``. The condition
tree follows AI-01's temporary format until the OKF specification is available.
Priority is derived from rule type, never from a supplied ``resulting_priority``.
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
    """Evaluate Active rules with Kleene logic and apply the highest rule floor.

    Only TRUE rules count as hits. Only UNKNOWN red flags contribute missing
    feature paths to ``complete_now`` (deduplicated in rule/tree order). Once a
    red flag is TRUE, Emergency is already determined and completion is not
    required to make that decision. Malformed rules or a malformed collection
    propagate an explicit error instead of silently producing Routine. An empty
    sequence is valid; an empty mapping or string is not an empty ruleset.
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
