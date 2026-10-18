"""AI-01: bộ đánh giá điều kiện theo logic Kleene mạnh."""

import pytest

from app.ai.rules.condition_evaluator import (
    ConditionFormatError,
    TruthValue,
    evaluate_condition,
)


def symptom(code: str, status: str = "PRESENT") -> dict:
    return {"type": "symptom", "symptom_code": code, "state": status}


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
        "args": [symptom("left"), symptom("right")],
    }

    result = evaluate_condition(tree, {"symptoms": {"left": left, "right": right}})

    assert result.value is expected


def test_nested_tree_evaluates_symptom_vital_sign_and_age():
    tree = {
        "op": "AND",
        "args": [
            symptom("kho_tho"),
            {
                "op": "OR",
                "args": [
                    {"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": 92},
                    {"type": "age", "unit": "years", "cmp": ">=", "value": 65},
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
    tree = {"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": 92}

    result = evaluate_condition(tree, {"vital_signs": {}})

    assert result.value is TruthValue.UNKNOWN
    assert result.missing == ("vital_signs.spo2_pct",)


def test_age_months_leaf_uses_age_months_feature():
    tree = {"type": "age", "unit": "months", "cmp": "<", "value": 12}

    result = evaluate_condition(tree, {"age_years": 5, "age_months": 6})

    assert result.value is TruthValue.TRUE
    assert result.missing == ()


def test_missing_age_months_returns_unknown_with_exact_feature_key():
    tree = {"type": "age", "unit": "months", "cmp": "<", "value": 12}

    result = evaluate_condition(tree, {"age_years": 5})

    assert result.value is TruthValue.UNKNOWN
    assert result.missing == ("age_months",)


def test_unknown_result_deduplicates_missing_data_in_stable_order():
    tree = {
        "op": "OR",
        "args": [symptom("dau_nguc"), symptom("dau_nguc"), symptom("kho_tho")],
    }

    result = evaluate_condition(tree, {"symptoms": {}})

    assert result.value is TruthValue.UNKNOWN
    assert result.missing == ("symptoms.dau_nguc", "symptoms.kho_tho")


def test_decisive_result_does_not_report_irrelevant_missing_data():
    tree = {"op": "AND", "args": [symptom("sot"), symptom("ho")]}

    result = evaluate_condition(tree, {"symptoms": {"sot": "ABSENT"}})

    assert result.value is TruthValue.FALSE
    assert result.missing == ()


def test_unknown_vital_sign_key_is_rejected_even_behind_true_or_branch():
    tree = {
        "op": "OR",
        "args": [
            symptom("sot"),
            {"type": "vital", "vital": "oxygen", "cmp": "<", "value": 92},
        ],
    }

    with pytest.raises(ConditionFormatError, match="Khóa sinh hiệu không hợp lệ"):
        evaluate_condition(tree, {"symptoms": {"sot": "PRESENT"}})


@pytest.mark.parametrize(
    "tree",
    [
        {"op": "NOT", "args": [symptom("sot")]},
        {"op": "AND", "args": []},
        {"type": "symptom", "symptom_code": "sot", "state": "UNKNOWN"},
        {"type": "age", "cmp": "<", "value": 12},
        {"type": "age", "unit": "days", "cmp": "<", "value": 30},
        {"type": "age", "unit": "years", "cmp": "<", "value": True},
        {"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": float("nan")},
        {"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": float("inf")},
        {"type": "age", "unit": "years", "cmp": "!=", "value": 18},
        {"type": "age", "unit": "years", "cmp": "lt", "value": 18},
        # Định dạng cũ phải bị từ chối thay vì được chấp nhận âm thầm.
        {"op": "AND", "conditions": [symptom("sot")]},
        {"type": "symptom", "code": "sot", "status": "PRESENT"},
        {"type": "vital_sign", "key": "spo2_pct", "operator": "lt", "value": 92},
        {"type": "age", "unit": "months", "operator": "lt", "value": 12},
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


@pytest.mark.parametrize(
    "comparator,actual,threshold,expected",
    [
        ("<", 1, 2, TruthValue.TRUE),
        ("<=", 2, 2, TruthValue.TRUE),
        (">", 3, 2, TruthValue.TRUE),
        (">=", 2, 2, TruthValue.TRUE),
        ("==", 2, 2, TruthValue.TRUE),
        ("<", 2, 1, TruthValue.FALSE),
    ],
)
def test_symbolic_comparators(comparator, actual, threshold, expected):
    tree = {
        "type": "age",
        "unit": "years",
        "cmp": comparator,
        "value": threshold,
    }

    result = evaluate_condition(tree, {"age_years": actual})

    assert result.value is expected


def _nested_tree(depth: int) -> dict:
    tree = symptom("sot")
    for _ in range(depth - 1):
        tree = {"op": "AND", "args": [tree]}
    return tree


def test_root_leaf_is_allowed():
    result = evaluate_condition(symptom("sot"), {"symptoms": {"sot": "PRESENT"}})

    assert result.value is TruthValue.TRUE


def test_condition_tree_allows_exactly_five_levels():
    result = evaluate_condition(
        _nested_tree(5), {"symptoms": {"sot": "PRESENT"}}
    )

    assert result.value is TruthValue.TRUE


def test_condition_tree_rejects_more_than_five_levels():
    with pytest.raises(ConditionFormatError, match="tối đa 5 tầng"):
        evaluate_condition(_nested_tree(6), {"symptoms": {"sot": "PRESENT"}})
