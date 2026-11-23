"""Chỉ số của scripts/run_eval.py: cờ đỏ, mức ưu tiên, luật, chẩn đoán phân biệt, trích xuất."""

import asyncio
from contextlib import nullcontext
from types import SimpleNamespace

import pytest

from scripts import run_eval
from scripts.run_eval import FewShotClient, clinical_metrics, extraction_metrics, input_features, unknown_codes


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
        {
            "case_id": "E1",
            "expected": {"a": "PRESENT", "b": "ABSENT"},
            "predicted": {"a": "PRESENT", "b": "PRESENT"},
            "latency_ms": 5,
        },
        {"case_id": "E2", "expected": {"c": "PRESENT"}, "predicted": {"c": "PRESENT"}, "latency_ms": 7},
        {"case_id": "E3", "expected": {"d": "PRESENT"}, "predicted": {}, "latency_ms": 31000},
        {"case_id": "E4", "expected": {}, "predicted": {}, "latency_ms": 3},
    ]
    m = extraction_metrics(rows, budget_ms=30000)
    assert (m["code_and_state"]["tp"], m["code_and_state"]["fp"], m["code_and_state"]["fn"]) == (2, 1, 2)
    assert m["exact_cases"] == 2
    assert m["empty_cases"] == ["E3"] and m["over_budget_cases"] == ["E3"]


def test_extraction_metrics_completion():
    rows = [
        {"case_id": "P1", "expected": {}, "predicted": {}, "completed": True, "failure_code": None, "latency_ms": 1},
        {
            "case_id": "P2",
            "expected": {},
            "predicted": {},
            "completed": False,
            "failure_code": "TIMEOUT",
            "latency_ms": 1,
        },
        {"case_id": "L1", "expected": {}, "predicted": {}, "completed": None, "failure_code": "X", "latency_ms": 1},
        {
            "case_id": "P3",
            "expected": {"a": "PRESENT"},
            "predicted": {},
            "completed": False,
            "failure_code": "UNMAPPED",
            "latency_ms": 1,
        },
    ]
    m = extraction_metrics(rows)
    assert m["exact_cases"] == 2  # P2 thất bại không tính khớp
    assert m["completed_cases"] == 1
    assert m["failed_cases"] == {"P2": "TIMEOUT", "P3": "UNMAPPED"}
    assert m["unclassified_cases"] == ["L1"]
    assert m["code_only"]["fn"] == 1  # ca chưa hoàn tất vẫn trong mẫu số recall


def test_inputs_and_unknown_codes():
    f = input_features({"age_years": 3, "symptoms": {"a": "PRESENT"}, "vital_signs": {"spo2_pct": 95}})
    assert f == {"symptoms": {"a": "PRESENT"}, "vital_signs": {"spo2_pct": 95}, "age_years": 3, "age_months": 36}
    cases = [{"case_id": "C1", "symptoms": {"a": "PRESENT", "q": "ABSENT"}}, {"id": "E1", "symptoms": {"a": "x"}}]
    assert unknown_codes(cases, "symptoms", {"a"}) == {"C1": ["q"]}


class _Capture:
    model = "m"

    def __init__(self):
        self.prompts = []

    async def generate_json(self, *, prompt, schema, timeout_seconds):
        self.prompts.append(prompt)
        return {}


def test_few_shot_client_only_adds_matching_examples():
    inner = _Capture()
    shots = [
        {"user_prompt": 'RULES V2\n{"text":"ví dụ"}', "assistant_json": '{"p1":[]}'},
        {"user_prompt": 'RULES COMPACT\n{"text":"khác"}', "assistant_json": '{"p1":["c1:P"]}'},
    ]
    client = FewShotClient(inner, shots)
    asyncio.run(client.generate_json(prompt='RULES V2\n{"text":"thật"}', schema={}, timeout_seconds=1))
    asyncio.run(client.generate_json(prompt='RULES LEGACY\n{"text":"thật"}', schema={}, timeout_seconds=1))
    first, second = inner.prompts
    assert first.startswith("RULES V2\nEXAMPLES")
    assert '{"text":"ví dụ"}' in first and '{"p1":[]}' in first and "khác" not in first
    assert first.endswith('NOW THE REAL INPUT:\n{"text":"thật"}')
    assert second == 'RULES LEGACY\n{"text":"thật"}'
    assert client.applied == {"with_examples": 1, "without_examples": 1}


def test_run_extraction_calls_before_each_outside_latency(monkeypatch):
    calls = []

    async def fake_dispatch(text, *args, **kwargs):
        calls.append(("extract", text))
        return SimpleNamespace(
            suggestions=[], strategy="phrases", prompt_version="v", completed=True, failure_code=None
        )

    monkeypatch.setattr(run_eval, "dispatch_extraction", fake_dispatch)
    monkeypatch.setattr(run_eval, "run_node1", lambda state, reader: {})
    monkeypatch.setattr(run_eval, "SessionLocal", nullcontext)
    cases = [
        {"id": "E1", "clinical_note": "a", "expected_symptoms": {}},
        {"id": "E2", "clinical_note": "b", "expected_symptoms": {}},
    ]
    rows = run_eval.run_extraction(cases, None, None, None, before_each=lambda: calls.append(("warm", None)))
    assert calls == [("warm", None), ("extract", "a"), ("warm", None), ("extract", "b")]
    assert [r["case_id"] for r in rows] == ["E1", "E2"]
