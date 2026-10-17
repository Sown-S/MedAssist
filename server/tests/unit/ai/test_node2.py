"""AI-03: synthetic graph retrieval/scoring with in-memory collaborators."""

from copy import deepcopy
from decimal import Decimal
from itertools import permutations
import os
from pathlib import Path
import subprocess
import sys
import textwrap

import pytest

from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.pipeline.node2_graph_retrieval import run_node2
from app.ai.rules.deterministic_scoring import ScoringFormatError, rank_conditions
from tests.unit.ai.fakes import FakeKnowledgeReader


def relation(code="signal_a", *, polarity="SUPPORTS", weight=1, is_key=False, **extra):
    return {
        "symptom_code": code,
        "polarity": polarity,
        "weight": weight,
        "is_key": is_key,
        "status": "Active",
        **extra,
    }


def condition(code="condition_a", *, relations=None, guidelines=(), **extra):
    return {
        "condition_code": code,
        "name_vi": f"Bệnh thử nghiệm {code}",
        "icd10_code": "TEST",
        "symptoms": [relation()] if relations is None else relations,
        "guidelines": list(guidelines),
        "status": "Active",
        **extra,
    }


def catalogue(*codes):
    return [{"symptom_code": code, "status": "Active"} for code in codes]


def retrieve(conditions, observed=None, *, symptoms=None, **features):
    reader = FakeKnowledgeReader(
        conditions=conditions,
        symptoms=catalogue("signal_a", "signal_b", "signal_c") if symptoms is None else symptoms,
    )
    input_features = {
        "symptoms": {"signal_a": "PRESENT"} if observed is None else observed,
        **features,
    }
    state = run_node1({"input_features": input_features}, reader)
    return run_node2(state, reader)


def test_weighted_coverage_and_precision_have_an_explicit_provisional_formula():
    item = condition(relations=[relation(weight=Decimal("0.75")), relation("signal_b", weight=0.25)])

    candidate = retrieve([item])["candidates"][0]

    assert candidate["coverage"] == pytest.approx(0.75)
    assert candidate["precision"] == 1
    assert candidate["score"] == pytest.approx(6 / 7)
    assert candidate["label"] == "Reference Suggestion"


def test_unrelated_present_catalogue_symptoms_reduce_precision():
    exact = retrieve([condition()])["candidates"][0]
    unrelated = retrieve(
        [condition()], {"signal_a": "PRESENT", "signal_b": "PRESENT"}
    )["candidates"][0]

    assert exact["coverage"] == unrelated["coverage"] == 1
    assert exact["precision"] == 1
    assert unrelated["precision"] == 0.5
    assert unrelated["score"] == pytest.approx(2 / 3)
    assert exact["score"] > unrelated["score"]


@pytest.mark.parametrize("polarity,status", [("SUPPORTS", "ABSENT"), ("CONTRADICTS", "PRESENT")])
def test_counter_evidence_is_retained_and_penalizes_score(polarity, status):
    item = condition(relations=[relation(), relation("signal_b", polarity=polarity)])
    candidate = retrieve(
        [item], {"signal_a": "PRESENT", "signal_b": status}
    )["candidates"][0]

    assert candidate["supporting_evidence"] == [
        {
            "symptom_code": "signal_a", "status": "PRESENT", "polarity": "SUPPORTS",
            "weight": 1.0, "is_key": False,
        }
    ]
    assert candidate["contradicting_evidence"] == [
        {"symptom_code": "signal_b", "status": status, "polarity": polarity, "weight": 1.0, "is_key": False}
    ]
    assert candidate["score"] == pytest.approx(1 / 3)


def test_counter_evidence_changes_order_even_when_condition_codes_favor_the_other():
    conditions = [
        condition("condition_a", relations=[relation(), relation("signal_b", polarity="CONTRADICTS")]),
        condition("condition_z"),
    ]
    result = retrieve(conditions, {"signal_a": "PRESENT", "signal_b": "PRESENT"})

    assert [item["condition_code"] for item in result["candidates"]] == ["condition_z", "condition_a"]


def test_absent_counter_signal_is_neutral_and_cannot_retrieve_a_diagnosis():
    item = condition(relations=[relation(), relation("signal_b", polarity="CONTRADICTS")])
    candidate = retrieve([item], {"signal_a": "PRESENT", "signal_b": "ABSENT"})["candidates"][0]

    assert candidate["score"] == 1
    assert candidate["contradicting_evidence"] == []
    assert len(candidate["supporting_evidence"]) == 1
    assert retrieve([item], {"signal_a": "ABSENT", "signal_b": "ABSENT"})["candidates"] == []


def test_key_unknowns_include_omitted_active_symptoms_without_becoming_evidence():
    item = condition(relations=[
        relation(is_key=True),
        relation("signal_b", is_key=True),
        relation("signal_c", is_key=True, polarity="CONTRADICTS"),
        relation("ordinary_unknown"),
        relation("inactive_key", is_key=True),
        relation("zero_weight_key", weight=0, is_key=True),
    ])
    symptoms = catalogue("signal_a", "signal_b", "signal_c", "ordinary_unknown", "zero_weight_key")
    symptoms.append({"symptom_code": "inactive_key", "status": "Retired"})
    result = retrieve(
        [item], {"signal_a": "PRESENT", "signal_c": "UNKNOWN"}, symptoms=symptoms
    )["candidates"][0]

    assert result["unknown_key_symptoms"] == ["signal_b", "signal_c"]
    assert [item["symptom_code"] for item in result["supporting_evidence"]] == ["signal_a"]
    assert result["contradicting_evidence"] == []


@pytest.mark.parametrize("observed", [{}, {"signal_a": "UNKNOWN"}, {"signal_a": "ABSENT"}])
def test_no_positive_evidence_returns_no_candidates(observed):
    assert retrieve([condition()], observed)["candidates"] == []


@pytest.mark.parametrize("relations", [[], [relation(weight=0)], [relation(polarity="CONTRADICTS")]])
def test_empty_zero_weight_and_counter_only_graphs_do_not_divide_by_zero(relations):
    assert retrieve([condition(relations=relations)])["candidates"] == []


def test_empty_knowledge_returns_no_candidates():
    assert retrieve([])["candidates"] == []
    assert retrieve([condition()], symptoms=[])["candidates"] == []


def test_retrieval_is_limited_to_four_after_ranking_all_candidates():
    conditions = [condition(f"condition_{letter}") for letter in "fedcba"]

    result = retrieve(conditions)

    assert [item["condition_code"] for item in result["candidates"]] == [
        "condition_a", "condition_b", "condition_c", "condition_d"
    ]


def test_score_precedes_lexical_tie_break():
    conditions = [
        condition("condition_a", relations=[relation(), relation("signal_b")]),
        condition("condition_z"),
    ]

    result = retrieve(conditions)

    assert [item["condition_code"] for item in result["candidates"]] == ["condition_z", "condition_a"]


def test_equal_scores_use_coverage_then_precision_before_condition_code():
    # Both F1 values are 2/3: (coverage=1, precision=1/2) versus (1/2, 1).
    conditions = [
        condition("condition_a", relations=[
            relation(weight=0.25),
            relation("signal_b", weight=0.25),
            relation("signal_c", weight=0.5),
        ]),
        condition("condition_z"),
    ]

    result = retrieve(conditions, {"signal_a": "PRESENT", "signal_b": "PRESENT"})

    assert result["candidates"][0]["score"] == result["candidates"][1]["score"]
    assert [item["condition_code"] for item in result["candidates"]] == ["condition_z", "condition_a"]


def test_candidate_evidence_and_guideline_order_is_independent_of_reader_order():
    relations = [relation(weight=0.1), relation("signal_b", weight=0.2), relation("signal_c", weight=0.3)]
    guidelines = [{"excerpt_key": key, "title": "Synthetic excerpt"} for key in ("guide_z", "guide_a")]
    conditions = [
        condition(code, relations=relations, guidelines=guidelines)
        for code in ("condition_c", "condition_b", "condition_a")
    ]
    observed = {"signal_a": "PRESENT", "signal_b": "PRESENT", "signal_c": "PRESENT"}
    symptoms = list(reversed(catalogue("signal_a", "signal_b", "signal_c")))
    expected = retrieve(conditions, observed)

    for order in permutations(conditions):
        for edges in permutations(relations):
            permuted = deepcopy(order)
            for item in permuted:
                item["symptoms"] = list(edges)
                item["guidelines"].reverse()
            assert retrieve(permuted, observed, symptoms=symptoms) == expected


@pytest.mark.parametrize("status", ["Draft", "PendingApproval", "Retired"])
def test_only_active_reader_conditions_relations_guidelines_and_catalogue_are_used(status):
    item = condition(
        relations=[relation(), relation("signal_b", status=status), relation("signal_c")],
        guidelines=[
            {"excerpt_key": "guide_active", "status": "Active"},
            {"excerpt_key": "guide_inactive", "status": status},
        ],
    )
    conditions = [item, condition("condition_inactive", status=status)]
    symptoms = catalogue("signal_a", "signal_b") + [{"symptom_code": "signal_c", "status": status}]
    result = retrieve(conditions, {
        "signal_a": "PRESENT", "signal_b": "UNKNOWN", "signal_c": "PRESENT",
        "outside_catalogue": "PRESENT",
    }, symptoms=symptoms)

    assert [item["condition_code"] for item in result["candidates"]] == ["condition_a"]
    candidate = result["candidates"][0]
    assert candidate["score"] == candidate["coverage"] == candidate["precision"] == 1
    assert candidate["unknown_key_symptoms"] == []
    assert [item["symptom_code"] for item in candidate["supporting_evidence"]] == ["signal_a"]
    assert candidate["guidelines"] == [{"excerpt_key": "guide_active", "status": "Active"}]


def test_icd10_and_full_guideline_source_are_preserved_without_inventing_content():
    guideline = {
        "excerpt_key": "guide_test", "condition_code": "condition_a", "version": 2,
        "title": "Khuyến cáo thử nghiệm", "content": "Nội dung giả lập",
        "source_id": "synthetic-source", "source_locator": "section 1", "status": "Active",
    }
    candidate = retrieve([condition(guidelines=[guideline])])["candidates"][0]
    without_optional = retrieve([condition(icd10_code=None)])["candidates"][0]

    assert candidate["icd10_code"] == "TEST"
    assert candidate["guidelines"] == [guideline]
    assert without_optional["icd10_code"] is None
    assert without_optional["guidelines"] == []


def test_scoring_uses_only_confirmed_structured_symptoms():
    result = retrieve([condition()], {}, raw_text="signal_a", extracted_symptoms={"signal_a": "PRESENT"})

    assert result["candidates"] == []


@pytest.mark.parametrize("priority", ["Routine", "HighPriority"])
def test_retrieval_preserves_node1_safety_result_and_does_not_mutate_inputs(priority):
    reader = FakeKnowledgeReader(conditions=[condition()], symptoms=catalogue("signal_a"))
    state = run_node1({"input_features": {"symptoms": {"signal_a": "PRESENT"}}}, reader)
    state.update(priority_rule=priority, priority_final=priority, complete_now=["vital_signs.spo2_pct"])
    state.update(
        candidates=[{"condition_code": "stale"}], llm_output={"ranking": ["stale"]},
        validation_result={"valid": True}, error="stale",
    )
    original = deepcopy(state)
    snapshot = reader.active_conditions()

    result = run_node2(state, reader)

    assert state == original
    assert reader.active_conditions() == snapshot
    assert result is not state
    for key in ("priority_rule", "priority_final", "is_red_flag", "rule_hits", "complete_now", "ai_status"):
        assert result[key] == state[key]
    assert result["candidates"][0]["condition_code"] == "condition_a"
    assert not {"llm_output", "validation_result", "error"}.intersection(result)


def test_returned_guidelines_do_not_mutate_reader_owned_knowledge():
    item = condition(guidelines=[{"excerpt_key": "guide_a", "source": {"title": "Original"}}])
    original = deepcopy(item)

    candidate = rank_conditions({"symptoms": {"signal_a": "PRESENT"}}, [item], catalogue("signal_a"))[0]
    candidate["guidelines"][0]["source"]["title"] = "Changed"

    assert item == original


@pytest.mark.parametrize("terminal", [
    {"is_red_flag": True}, {"ai_status": "Skipped"},
    {"priority_rule": "Emergency"}, {"priority_final": "Emergency"},
])
def test_terminal_gate_never_reads_knowledge_or_returns_diagnoses(terminal):
    class NoReads(FakeKnowledgeReader):
        def active_conditions(self):
            raise AssertionError("Terminal gate must stop retrieval")

        active_symptoms = active_conditions

    state = {"input_features": {}, "candidates": [{"condition_code": "stale"}], "llm_output": {}, **terminal}

    result = run_node2(state, NoReads())

    assert "candidates" not in result
    assert "llm_output" not in result
    assert all(result[key] == value for key, value in terminal.items())


def test_real_node1_red_flag_result_stops_retrieval():
    reader = FakeKnowledgeReader(triage_rules=[{
        "rule_key": "rf_test", "version": 1, "rule_type": "RED_FLAG", "reason_text": "Synthetic rule",
        "condition_logic": {"type": "symptom", "code": "signal_a", "status": "PRESENT"},
    }], conditions=[condition()], symptoms=catalogue("signal_a"))
    state = run_node1({"input_features": {"symptoms": {"signal_a": "PRESENT"}}}, reader)

    assert run_node2(state, reader) == state


@pytest.mark.parametrize("partial", [
    {}, {"is_red_flag": False}, {"priority_rule": "Routine", "priority_final": "Routine"},
])
def test_node1_must_run_before_retrieval(partial):
    with pytest.raises(ValueError, match="Node 1"):
        run_node2({"input_features": {}, **partial}, FakeKnowledgeReader())


def test_only_active_graph_and_catalogue_reader_methods_are_called():
    class GraphOnlyReader(FakeKnowledgeReader):
        def __init__(self):
            super().__init__(conditions=[condition()], symptoms=catalogue("signal_a"))
            self.calls = []

        def active_conditions(self):
            self.calls.append("conditions")
            return super().active_conditions()

        def active_symptoms(self):
            self.calls.append("symptoms")
            return super().active_symptoms()

        def active_release(self):
            raise AssertionError("Node 2 only needs Active graph and catalogue")

        active_triage_rules = active_release

    reader = GraphOnlyReader()
    state = run_node1({"input_features": {"symptoms": {"signal_a": "PRESENT"}}}, FakeKnowledgeReader())

    assert run_node2(state, reader)["candidates"][0]["condition_code"] == "condition_a"
    assert reader.calls == ["conditions", "symptoms"]


@pytest.mark.parametrize("value", [None, {}, "", b"", [None]])
@pytest.mark.parametrize("field", ["conditions", "symptoms"])
def test_malformed_reader_collections_raise_explicit_errors(field, value):
    data = {"conditions": [condition()], "symptoms": catalogue("signal_a")}
    data[field] = value

    with pytest.raises(ScoringFormatError):
        rank_conditions({}, **data)


@pytest.mark.parametrize("weight", [
    -0.01, 1.01, 10**400, True, None, "0.5", float("nan"), float("inf"),
    Decimal("NaN"), Decimal("sNaN"), Decimal("Infinity"),
])
def test_invalid_relation_weights_are_rejected(weight):
    with pytest.raises(ScoringFormatError, match="weight"):
        retrieve([condition(relations=[relation(weight=weight)])])


@pytest.mark.parametrize("value", [None, [], {"signal_a": None}, {"signal_a": "present"}, {"signal_a": []}])
def test_invalid_confirmed_symptoms_are_rejected(value):
    with pytest.raises(ScoringFormatError):
        rank_conditions({"symptoms": value}, [condition()], catalogue("signal_a"))


@pytest.mark.parametrize("field,value", [
    ("condition_code", ""), ("name_vi", None), ("icd10_code", 10),
    ("symptoms", None), ("guidelines", {}), ("guidelines", [{"excerpt_key": ""}]),
])
def test_malformed_condition_data_is_rejected(field, value):
    item = condition()
    item[field] = value

    with pytest.raises(ScoringFormatError):
        rank_conditions({}, [item], catalogue("signal_a"))


@pytest.mark.parametrize("field,value", [("symptom_code", ""), ("polarity", "OTHER"), ("is_key", 1)])
def test_malformed_relation_data_is_rejected(field, value):
    edge = relation()
    edge[field] = value

    with pytest.raises(ScoringFormatError):
        rank_conditions({}, [condition(relations=[edge])], catalogue("signal_a"))


@pytest.mark.parametrize("conditions,symptoms", [
    ([condition(), condition()], catalogue("signal_a")),
    ([condition(relations=[relation(), relation()])], catalogue("signal_a")),
    ([condition()], catalogue("signal_a", "signal_a")),
])
def test_duplicate_active_codes_cannot_inflate_scores(conditions, symptoms):
    with pytest.raises(ScoringFormatError, match="trùng"):
        rank_conditions({}, conditions, symptoms)


def test_node2_runs_with_llm_database_and_http_dependencies_blocked():
    program = textwrap.dedent(
        """
        import importlib.abc
        import sys
        blocked = (
            "app.ai.llm", "app.routers", "app.models", "app.core",
            "sqlalchemy", "ollama", "langgraph", "httpx",
        )
        class BlockImports(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname, path=None, target=None):
                if any(fullname == name or fullname.startswith(name + ".") for name in blocked):
                    raise AssertionError("Forbidden Node 2 dependency: " + fullname)
        sys.meta_path.insert(0, BlockImports())
        from app.ai.pipeline.node2_graph_retrieval import run_node2
        from tests.unit.ai.fakes import FakeKnowledgeReader
        reader = FakeKnowledgeReader(
            conditions=[{"condition_code": "test_condition", "name_vi": "Test", "symptoms": [
                {"symptom_code": "test_signal", "polarity": "SUPPORTS", "weight": 1}
            ]}], symptoms=[{"symptom_code": "test_signal"}],
        )
        result = run_node2({
            "input_features": {"symptoms": {"test_signal": "PRESENT"}},
            "priority_rule": "Routine", "priority_final": "Routine", "is_red_flag": False,
        }, reader)
        assert result["candidates"][0]["condition_code"] == "test_condition"
        """
    )
    completed = subprocess.run(
        [sys.executable, "-B", "-c", program],
        cwd=Path(__file__).resolve().parents[3],
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True, text=True, timeout=20,
    )

    assert completed.returncode == 0, completed.stderr
