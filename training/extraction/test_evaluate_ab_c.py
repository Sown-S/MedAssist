"""Unit test cho script tổng hợp 3 nhánh A/B/C và paired bootstrap 95% CI."""

from __future__ import annotations

from pathlib import Path
import sys

import pytest

TRAINING_DIR = Path(__file__).resolve().parent
if str(TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(TRAINING_DIR))

from evaluate_ab_c import (  # noqa: E402
    evaluate_deployment_decision,
    paired_bootstrap_f1_diff,
    summarize_branch,
)


def _row(
    cid: str,
    expected: dict[str, str],
    predicted: dict[str, str],
    *,
    latency_ms: float = 100.0,
    completed: bool = True,
) -> dict:
    return {
        "case_id": cid,
        "expected": expected,
        "predicted": predicted,
        "completed": completed,
        "failure_code": None if completed else "TIMEOUT",
        "latency_ms": latency_ms,
    }


def test_summarize_branch_splits_errors_negation_and_hallucinations() -> None:
    active = {"sym_a", "sym_b", "sym_c", "sym_d", "sym_other"}
    top4 = {
        "C1": {"sym_a", "sym_b", "sym_c"},
        "C2": {"sym_a"},
    }
    rows = [
        _row(
            "C1",
            expected={"sym_a": "PRESENT", "sym_b": "ABSENT", "sym_c": "PRESENT", "sym_d": "PRESENT"},
            predicted={
                "sym_a": "PRESENT",  # TP
                "sym_b": "PRESENT",  # sai trạng thái (đảo ABSENT -> PRESENT) dù có trong Top-4
                "sym_other": "PRESENT",  # FP ngoài Top-4 (vẫn trong catalog)
                "not_a_code": "ABSENT",  # FP ngoài catalog & ngoài Top-4 + FP phủ định
            },
            latency_ms=5000.0,
        ),
        _row(
            "C2",
            expected={"sym_a": "ABSENT"},
            predicted={"sym_a": "ABSENT"},
            latency_ms=35000.0,
        ),
    ]
    s = summarize_branch(rows, active, top4, budget_ms=30000.0)
    assert (s["code_and_state"]["tp"], s["code_and_state"]["fp"], s["code_and_state"]["fn"]) == (2, 3, 3)
    assert s["exact_cases"] == 1
    assert s["completed_cases"] == 2
    assert s["over_30s_cases"] == ["C2"]

    neg = s["negation_absent"]
    assert neg["expected_absent"] == 2
    assert neg["tp_absent"] == 1
    assert neg["fp_absent"] == 1
    assert neg["absent_to_present_flips"] == 1
    assert neg["present_to_absent_flips"] == 0

    hal = s["hallucination"]
    assert hal["total_predicted"] == 5
    assert hal["not_in_active_catalog"] == 1
    assert hal["not_in_top4_candidates"] == 2

    ret = s["retrieval_vs_selection"]
    assert ret["total_expected"] == 5
    assert ret["expected_in_top4"] == 4
    assert ret["retrieval_coverage_top4"] == pytest.approx(0.8)
    assert ret["fn_total"] == 3
    assert ret["fn_retrieval_miss"] == 1  # sym_d ở C1 không có trong Top-4
    assert ret["fn_selection_miss"] == 2
    assert ret["fn_selection_omitted"] == 1  # sym_c ở C1 có trong Top-4 nhưng bị bỏ sót
    assert ret["fn_selection_wrong_state"] == 1  # sym_b ở C1 sai trạng thái


def test_paired_bootstrap_f1_diff_bounds_and_determinism() -> None:
    perfect = [_row(f"C{i}", {"a": "PRESENT"}, {"a": "PRESENT"}) for i in range(10)]
    weak = [_row(f"C{i}", {"a": "PRESENT"}, {}) for i in range(10)]
    mixed = [
        _row("C0", {"a": "PRESENT"}, {"a": "PRESENT"}),
        _row("C1", {"a": "PRESENT"}, {}),
        _row("C2", {"a": "PRESENT"}, {"a": "PRESENT"}),
    ]
    mixed_alt = [
        _row("C0", {"a": "PRESENT"}, {}),
        _row("C1", {"a": "PRESENT"}, {"a": "PRESENT"}),
        _row("C2", {"a": "PRESENT"}, {"a": "PRESENT"}),
    ]

    pos = paired_bootstrap_f1_diff(perfect, weak, n_boot=500, seed=7)
    pos_repeat = paired_bootstrap_f1_diff(perfect, weak, n_boot=500, seed=7)
    assert pos == pos_repeat
    assert pos["delta"] == pytest.approx(1.0)
    assert pos["ci_low"] > 0.0 and "CI > 0" in pos["interpretation"]

    neg = paired_bootstrap_f1_diff(weak, perfect, n_boot=500, seed=7)
    assert neg["delta"] == pytest.approx(-1.0)
    assert neg["ci_high"] < 0.0 and "CI < 0" in neg["interpretation"]

    tied = paired_bootstrap_f1_diff(mixed, mixed_alt, n_boot=1000, seed=7)
    assert tied["delta"] == pytest.approx(0.0)
    assert tied["ci_low"] <= 0.0 <= tied["ci_high"]
    assert "CI chứa 0" in tied["interpretation"]


def test_evaluate_deployment_decision_rules() -> None:
    def _sum(f1: float, hal_top4: int, hal_cat: int = 0) -> dict:
        return {
            "code_and_state": {"f1": f1},
            "hallucination": {"not_in_top4_candidates": hal_top4, "not_in_active_catalog": hal_cat},
        }

    def _il(ext_a: float, ext_c: float, pair_a: float = 14000.0, pair_c: float = 16000.0) -> dict:
        return {
            "branches": {
                "A": {"extraction_latency": {"p95_ms": ext_a}, "pair_total_latency": {"p95_ms": pair_a}},
                "C": {"extraction_latency": {"p95_ms": ext_c}, "pair_total_latency": {"p95_ms": pair_c}},
            }
        }

    ok = evaluate_deployment_decision(_sum(0.65, 2), _sum(0.68, 1), _sum(0.72, 2), _il(10000.0, 11800.0))
    assert ok["c_ge_b"] is True and ok["hallucination_not_worse"] is True and ok["interleaved_p95_ok"] is True
    assert ok["recommendation"] == "DÙNG NHÁNH C"

    pending = evaluate_deployment_decision(_sum(0.65, 2), _sum(0.68, 1), _sum(0.72, 2), None)
    assert pending["recommendation"] == "CHỜ ĐO ĐỘ TRỄ XEN KẼ"

    slow = evaluate_deployment_decision(_sum(0.65, 2), _sum(0.68, 1), _sum(0.72, 2), _il(10000.0, 12500.0))
    assert slow["interleaved_p95_ok"] is False and slow["recommendation"] == "GIỮ NHÁNH A HOẶC B"

    hal_worse = evaluate_deployment_decision(_sum(0.65, 1), _sum(0.68, 1), _sum(0.72, 2), _il(10000.0, 10000.0))
    assert hal_worse["hallucination_not_worse"] is False and hal_worse["recommendation"] == "GIỮ NHÁNH A HOẶC B"

    f1_worse = evaluate_deployment_decision(_sum(0.65, 2), _sum(0.75, 1), _sum(0.72, 1), _il(10000.0, 10000.0))
    assert f1_worse["c_ge_b"] is False and f1_worse["recommendation"] == "GIỮ NHÁNH A HOẶC B"

    ir_ok = evaluate_deployment_decision(
        _sum(0.65, 2),
        _sum(0.68, 1),
        _sum(0.72, 2),
        interleave_runs={
            "A": {"latency": {"p95_ms": 15000.0}},
            "B": {"latency": {"p95_ms": 25000.0}},
            "C": {"latency": {"p95_ms": 17500.0}},
        },
    )
    assert ir_ok["interleaved_p95_ok"] is True
    assert ir_ok["interleaved_detail"]["source"] == "run_eval --interleave"
    assert ir_ok["recommendation"] == "DÙNG NHÁNH C"

    ir_slow = evaluate_deployment_decision(
        _sum(0.65, 2),
        _sum(0.68, 1),
        _sum(0.72, 2),
        interleave_runs={
            "A": {"latency": {"p95_ms": 15000.0}},
            "B": {"latency": {"p95_ms": 25000.0}},
            "C": {"latency": {"p95_ms": 19000.0}},
        },
    )
    assert ir_slow["interleaved_p95_ok"] is False
    assert ir_slow["recommendation"] == "GIỮ NHÁNH A HOẶC B"
