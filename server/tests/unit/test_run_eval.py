"""Chỉ số của scripts/run_eval.py: cờ đỏ, mức ưu tiên, luật, chẩn đoán phân biệt, trích xuất."""

import pytest

from scripts.run_eval import clinical_metrics, extraction_metrics, input_features, unknown_codes


def _row(case_id, exp_p, got_p, exp_rules=(), got_rules=(), exp_top=(), got_top=(), ms=10.0):
    return {
        "case_id": case_id,
        "expected_priority": exp_p,
        "predicted_priority": got_p,
        "expected_rules": list(exp_rules),
        "predicted_rules": list(got_rules),
        "expected_top": list(exp_top),
        "predicted_top": list(got_top),
        "latency_ms": ms,
    }


def test_clinical_metrics():
    rows = [
        _row("C1", "Emergency", "Emergency", ["rf_a"], ["rf_a"]),
        _row("C2", "Emergency", "HighPriority", ["rf_b"], []),
        _row("C3", "Routine", "Emergency", [], ["rf_a"]),
        _row("C4", "Routine", "Routine", exp_top=["x", "y"], got_top=["x", "z", "w", "y"]),
        _row("C5", "HighPriority", "Routine", ["pf_a"], [], exp_top=["y"], got_top=["z"]),
    ]
    m = clinical_metrics(rows)
    rf = m["red_flag"]
    assert (rf["cases"], rf["recall"], rf["missed"], rf["false_alarms"]) == (2, 0.5, ["C2"], 1)
    assert rf["enough_cases"] is False and rf["meets_target"] is False
    assert m["priority"]["accuracy"] == pytest.approx(0.4)
    assert m["priority"]["under_triage"] == ["C2", "C5"]
    assert (m["rules"]["tp"], m["rules"]["fp"], m["rules"]["fn"]) == (1, 1, 2)
    dx = m["differential"]
    assert dx["cases"] == 2 and dx["top1_accuracy"] == 0.5 and dx["top3_accuracy"] == 0.5
    assert dx["macro_recall"] == pytest.approx(0.25)  # C4: 1/2 (y ngoài top-3), C5: 0
    assert m["latency"]["p50_ms"] == 10.0


def test_extraction_metrics():
    rows = [
        {"expected": {"a": "PRESENT", "b": "ABSENT"}, "predicted": {"a": "PRESENT", "b": "PRESENT"}, "latency_ms": 5},
        {"expected": {"c": "PRESENT"}, "predicted": {"c": "PRESENT"}, "latency_ms": 7},
    ]
    m = extraction_metrics(rows)
    assert (m["code_and_state"]["tp"], m["code_and_state"]["fp"], m["code_and_state"]["fn"]) == (2, 1, 1)
    assert m["code_only"]["f1"] == 1.0 and m["exact_cases"] == 1


def test_inputs_and_unknown_codes():
    f = input_features({"age_years": 3, "symptoms": {"a": "PRESENT"}, "vital_signs": {"spo2_pct": 95}})
    assert f == {"symptoms": {"a": "PRESENT"}, "vital_signs": {"spo2_pct": 95}, "age_years": 3, "age_months": 36}
    cases = [{"case_id": "C1", "symptoms": {"a": "PRESENT", "q": "ABSENT"}}, {"id": "E1", "symptoms": {"a": "x"}}]
    assert unknown_codes(cases, "symptoms", {"a"}) == {"C1": ["q"]}
