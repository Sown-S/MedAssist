"""AI-01: bộ đánh giá điều kiện theo logic Kleene mạnh."""

import pytest

from app.ai.rules.condition_evaluator import (
    ConditionFormatError,
    TruthValue,
    evaluate_condition,
)


def symptom(code: str, status: str = "PRESENT") -> dict:
    return {"type": "symptom", "code": code, "status": status}


@pytest.mark.parametrize(
    "logical_operator,left,right,expected",
    [
        ("AND", "PRESENT", "PRESENT", TruthValue.TRUE),
        ("AND", "PRESENT", "UNKNOWN", TruthValue.UNKNOWN),
        ("AND", "PRESENT", "ABSENT", TruthValue.FALSE),
        ("AND", "UNKNOWN", "UNKNOWN", TruthValue.UNKNOWN),
        ("AND", "UNKNOWN", "ABSENT", TruthValue.FALSE),
        ("AND", "ABSENT", "ABSENT", TruthValue.FALSE),
        ("OR", "PRESENT", "PRESENT", TruthValue.TRUE),
        ("OR", "PRESENT", "UNKNOWN", TruthValue.TRUE),
        ("OR", "PRESENT", "ABSENT", TruthValue.TRUE),
        ("OR", "UNKNOWN", "UNKNOWN", TruthValue.UNKNOWN),
        ("OR", "UNKNOWN", "ABSENT", TruthValue.UNKNOWN),
        ("OR", "ABSENT", "ABSENT", TruthValue.FALSE),
    ],
)
def test_strong_kleene_truth_tables(logical_operator, left, right, expected):
    tree = {
        "op": logical_operator,
        "conditions": [symptom("left"), symptom("right")],
    }

    result = evaluate_condition(tree, {"symptoms": {"left": left, "right": right}})

    assert result.value is expected


def test_nested_tree_evaluates_symptom_vital_sign_and_age():
    tree = {
        "op": "AND",
        "conditions": [
            symptom("kho_tho"),
            {
                "op": "OR",
                "conditions": [
                    {"type": "vital_sign", "key": "spo2_pct", "operator": "lt", "value": 92},
                    {"type": "age", "operator": "gte", "value": 65},
                ],
            },
        ],
    }

    result = evaluate_condition(
        tree,
        {
            "symptoms": {"kho_tho": "PRESENT"},
            "vital_signs": {"spo2_pct": 97},
            "age_years": 70,
        },
    )

    assert result.value is TruthValue.TRUE
    assert result.missing == ()


def test_unmeasured_vital_sign_returns_unknown_and_complete_data_key():
    tree = {"type": "vital_sign", "key": "spo2_pct", "operator": "lt", "value": 92}

    result = evaluate_condition(tree, {"vital_signs": {}})

    assert result.value is TruthValue.UNKNOWN
    assert result.missing == ("vital_signs.spo2_pct",)


def test_unknown_result_deduplicates_missing_data_in_stable_order():
    tree = {
        "op": "OR",
        "conditions": [symptom("dau_nguc"), symptom("dau_nguc"), symptom("kho_tho")],
    }

    result = evaluate_condition(tree, {"symptoms": {}})

    assert result.value is TruthValue.UNKNOWN
    assert result.missing == ("symptoms.dau_nguc", "symptoms.kho_tho")


def test_decisive_result_does_not_report_irrelevant_missing_data():
    tree = {"op": "AND", "conditions": [symptom("sot"), symptom("ho")]}

    result = evaluate_condition(tree, {"symptoms": {"sot": "ABSENT"}})

    assert result.value is TruthValue.FALSE
    assert result.missing == ()


def test_unknown_vital_sign_key_is_rejected_even_behind_true_or_branch():
    tree = {
        "op": "OR",
        "conditions": [
            symptom("sot"),
            {"type": "vital_sign", "key": "oxygen", "operator": "lt", "value": 92},
        ],
    }

    with pytest.raises(ConditionFormatError, match="Khóa sinh hiệu không hợp lệ"):
        evaluate_condition(tree, {"symptoms": {"sot": "PRESENT"}})


@pytest.mark.parametrize(
    "tree",
    [
        {"op": "NOT", "conditions": [symptom("sot")]},
        {"op": "AND", "conditions": []},
        {"type": "symptom", "code": "sot", "status": "UNKNOWN"},
        {"type": "age", "operator": "lt", "value": True},
        {"type": "vital_sign", "key": "spo2_pct", "operator": "lt", "value": float("nan")},
        {"type": "vital_sign", "key": "spo2_pct", "operator": "lt", "value": float("inf")},
    ],
)
def test_malformed_rule_is_rejected(tree):
    with pytest.raises(ConditionFormatError):
        evaluate_condition(tree, {"symptoms": {}})


def test_condition_evaluator_does_not_import_llm_or_routers():
    import app.ai.rules.condition_evaluator as evaluator_module

    imported_names = set(evaluator_module.__dict__)
    assert "llm" not in imported_names
    assert "routers" not in imported_names
