"""AI-04: FR14 chỉ dùng triệu chứng UNKNOWN đã xác nhận từ dữ liệu Node 2 Active."""

from copy import deepcopy
from itertools import permutations
import os
from pathlib import Path
import subprocess
import sys
import textwrap

import pytest

from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.pipeline.node2_graph_retrieval import run_node2
from app.ai.rules.missing_information import (
    MissingInformationFormatError,
    find_missing_information,
)
from tests.unit.ai.fakes import FakeKnowledgeReader


def catalogue(*codes):
    return [{"symptom_code": code, "status": "Active"} for code in codes]


def candidate(code="condition_a", *unknown):
    return {"condition_code": code, "unknown_key_symptoms": list(unknown)}


@pytest.mark.parametrize("features", [{}, {"symptoms": {}}, {"symptoms": {"signal_a": "UNKNOWN"}}])
def test_omitted_and_explicit_unknown_symptoms_are_requested(features):
    assert find_missing_information(
        features, [candidate("condition_a", "signal_a")], catalogue("signal_a")
    ) == ["signal_a"]


@pytest.mark.parametrize("status", ["PRESENT", "ABSENT"])
def test_confirmed_symptoms_are_not_requested_even_if_candidate_list_is_stale(status):
    assert find_missing_information(
        {"symptoms": {"signal_a": status}},
        [candidate("condition_a", "signal_a", "signal_b")],
        catalogue("signal_a", "signal_b"),
    ) == ["signal_b"]


def test_unknown_symptoms_must_belong_to_catalogue_and_leading_candidates():
    assert find_missing_information(
        {"symptoms": {"unrelated_signal": "UNKNOWN", "outside_catalogue": "UNKNOWN"}},
        [candidate("condition_a", "outside_catalogue", "signal_a")],
        catalogue("signal_a", "unrelated_signal"),
    ) == ["signal_a"]


def test_suggestions_follow_supplied_candidate_order_with_only_the_first_three_contributing():
    # Không sắp xếp lại theo mã hoặc điểm tạm: thứ hạng đã kiểm tra về sau có thể
    # khác Node 2. Ứng viên thứ tư chỉ dùng nội bộ.
    candidates = [
        {**candidate("condition_z", "signal_z"), "score": 0.1},
        {**candidate("condition_b", "signal_b"), "score": 0.2},
        {**candidate("condition_a", "signal_a"), "score": 0.3},
        {**candidate("condition_d", "signal_d"), "score": 1},
    ]

    assert find_missing_information(
        {}, candidates, catalogue("signal_a", "signal_b", "signal_d", "signal_z")
    ) == ["signal_z", "signal_b", "signal_a"]


def test_no_replacement_with_fourth_candidate_when_leading_candidates_have_no_missing_data():
    candidates = [candidate(code) for code in ("condition_a", "condition_b", "condition_c")]
    candidates.append(candidate("condition_d", "signal_d"))

    assert find_missing_information({}, candidates, catalogue("signal_d")) == []


def test_shared_and_repeated_symptoms_are_requested_once_with_stable_order():
    candidates = [
        candidate("condition_a", "signal_z", "signal_b", "signal_b"),
        candidate("condition_b", "signal_a", "signal_b"),
    ]
    symptoms = catalogue("signal_z", "signal_a", "signal_b")

    for keys in permutations(candidates[0]["unknown_key_symptoms"]):
        for rows in permutations(symptoms):
            supplied = [{**candidates[0], "unknown_key_symptoms": keys}, candidates[1]]
            assert find_missing_information({}, supplied, rows) == ["signal_b", "signal_z", "signal_a"]


@pytest.mark.parametrize("candidates,symptoms", [
    ([], catalogue("signal_a")),
    ([candidate("condition_a", "signal_a")], []),
    ([candidate()], catalogue("signal_a")),
])
def test_empty_candidates_catalogue_or_key_symptoms_return_no_suggestions(candidates, symptoms):
    assert find_missing_information({}, candidates, symptoms) == []


def test_unconfirmed_extraction_free_text_vitals_and_age_do_not_resolve_missing_symptoms():
    features = {
        "raw_text": "signal_a",
        "extracted_symptoms": {"signal_a": "PRESENT"},
        "vital_signs": {"temperature_c": 37},
        "age_years": 30,
    }

    assert find_missing_information(
        features, [candidate("condition_a", "signal_a")], catalogue("signal_a")
    ) == ["signal_a"]


@pytest.mark.parametrize("inactive_status", ["Draft", "PendingApproval", "Retired"])
def test_end_to_end_uses_only_active_key_relations_from_node2(inactive_status):
    def relation(code, **extra):
        return {
            "symptom_code": code, "polarity": "SUPPORTS", "weight": 1,
            "is_key": True, "status": "Active", **extra,
        }

    reader = FakeKnowledgeReader(
        conditions=[
            {
                "condition_code": "condition_a", "name_vi": "Bệnh thử nghiệm A",
                "symptoms": [
                    relation("known_signal"),
                    relation("signal_b"),
                    relation("signal_c", polarity="CONTRADICTS"),
                    relation("ordinary_signal", is_key=False),
                    relation("zero_weight_signal", weight=0),
                    relation("inactive_relation", status=inactive_status),
                    relation("inactive_signal"),
                    relation("outside_catalogue"),
                ],
            },
            {
                "condition_code": "inactive_condition", "name_vi": "Bệnh thử nghiệm B",
                "status": inactive_status,
                "symptoms": [relation("known_signal"), relation("inactive_condition_signal")],
            },
        ],
        symptoms=catalogue(
            "known_signal", "signal_b", "signal_c", "ordinary_signal",
            "zero_weight_signal", "inactive_relation", "inactive_condition_signal",
        ) + [{"symptom_code": "inactive_signal", "status": inactive_status}],
    )
    state = run_node2(run_node1({
        "input_features": {"symptoms": {"known_signal": "PRESENT", "signal_c": "UNKNOWN"}},
    }, reader), reader)
    before = deepcopy(state)

    assert find_missing_information(
        state["input_features"], state["candidates"], reader.active_symptoms()
    ) == ["signal_b", "signal_c"]
    assert state == before


def test_catalogue_is_rechecked_before_suggesting_codes_from_a_previous_candidate_snapshot():
    reader = FakeKnowledgeReader(symptoms=[
        {"symptom_code": "signal_a", "status": "Active"},
        {"symptom_code": "signal_b", "status": "Retired"},
    ])

    assert find_missing_information(
        {}, [candidate("condition_a", "signal_a", "signal_b")], reader.active_symptoms()
    ) == ["signal_a"]


def test_red_flag_pipeline_has_no_missing_diagnosis_suggestions():
    reader = FakeKnowledgeReader(triage_rules=[{
        "rule_key": "rf_test", "version": 1, "rule_type": "RED_FLAG",
        "reason_text": "Luật thử nghiệm",
        "condition_logic": {"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": 90},
    }])
    state = run_node2(run_node1({
        "input_features": {"vital_signs": {"spo2_pct": 80}},
    }, reader), reader)

    assert state["is_red_flag"] is True
    assert find_missing_information(
        state["input_features"], state.get("candidates", []), reader.active_symptoms()
    ) == []


def test_function_does_not_mutate_confirmed_features_candidates_or_catalogue():
    features = {"symptoms": {"signal_a": "UNKNOWN"}, "extracted_symptoms": {"signal_b": "PRESENT"}}
    candidates = [candidate("condition_a", "signal_b", "signal_a", "signal_a")]
    symptoms = catalogue("signal_b", "signal_a")
    before = deepcopy((features, candidates, symptoms))

    result = find_missing_information(features, candidates, symptoms)
    result.append("caller_owned")

    assert (features, candidates, symptoms) == before
    assert find_missing_information(features, candidates, symptoms) == ["signal_a", "signal_b"]


@pytest.mark.parametrize("features", [
    None, [], {"symptoms": None}, {"symptoms": []},
    {"symptoms": {"signal_a": None}}, {"symptoms": {"signal_a": True}},
    {"symptoms": {"signal_a": "present"}}, {"symptoms": {"signal_a": []}},
])
def test_malformed_confirmed_symptoms_are_rejected_without_treating_them_as_unknown(features):
    with pytest.raises(MissingInformationFormatError):
        find_missing_information(features, [candidate("condition_a", "signal_a")], catalogue("signal_a"))


@pytest.mark.parametrize("candidates", [
    None, {}, "condition_a", [None], [{"unknown_key_symptoms": None}],
    [{"unknown_key_symptoms": "signal_a"}], [{"unknown_key_symptoms": {"signal_a": True}}],
    [candidate("condition_a", None)], [candidate("condition_a", [])], [candidate("condition_a", " ")],
])
def test_malformed_candidate_data_is_rejected(candidates):
    with pytest.raises(MissingInformationFormatError):
        find_missing_information({}, candidates, catalogue("signal_a"))


@pytest.mark.parametrize("symptoms", [None, {}, "signal_a", [None], [{}], [{"symptom_code": ""}]])
def test_malformed_catalogue_data_is_rejected(symptoms):
    with pytest.raises(MissingInformationFormatError):
        find_missing_information({}, [candidate("condition_a", "signal_a")], symptoms)


def test_missing_information_runs_without_llm_database_or_network_dependencies():
    program = textwrap.dedent(
        """
        import importlib.abc
        import sys
        blocked = (
            "app.ai.llm", "app.routers", "app.models", "app.core",
            "sqlalchemy", "ollama", "langgraph", "httpx", "requests", "socket",
        )
        class BlockImports(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname, path=None, target=None):
                if any(fullname == name or fullname.startswith(name + ".") for name in blocked):
                    raise AssertionError("Forbidden FR14 dependency: " + fullname)
        sys.meta_path.insert(0, BlockImports())
        from app.ai.rules.missing_information import find_missing_information
        assert find_missing_information(
            {}, [{"unknown_key_symptoms": ["signal_a"]}], [{"symptom_code": "signal_a"}],
        ) == ["signal_a"]
        """
    )
    completed = subprocess.run(
        [sys.executable, "-B", "-c", program],
        cwd=Path(__file__).resolve().parents[3],
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True, text=True, timeout=20,
    )

    assert completed.returncode == 0, completed.stderr
