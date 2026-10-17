"""AI-07: synthetic output attacks, fake Active catalogue and no real LLM."""

import asyncio
from copy import deepcopy
import json
import traceback

import pytest

from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.pipeline.node2_graph_retrieval import run_node2
from app.ai.pipeline.node3_reasoning import run_node3
from app.ai.pipeline.node4_output_validation import run_node4
from app.exceptions import AppError
from app.validation import knowledge_validators
from tests.unit.ai.fakes import FakeKnowledgeReader, MockLLMClient


def retrieved_state(*, count=2, priority="Routine"):
    reader = FakeKnowledgeReader(
        conditions=[{
            "condition_code": f"condition_{letter}",
            "name_vi": f"Bệnh giả lập {letter}",
            "icd10_code": "TEST",
            "symptoms": [
                {"symptom_code": "signal_a", "polarity": "SUPPORTS", "weight": 1},
                {"symptom_code": "signal_b", "polarity": "CONTRADICTS", "weight": 0.5},
                {"symptom_code": "signal_c", "polarity": "SUPPORTS", "weight": 1,
                 "is_key": True},
                {"symptom_code": "signal_d", "polarity": "SUPPORTS", "weight": 0.5},
            ],
            "guidelines": [{"excerpt_key": "synthetic_guide", "excerpt": "Tri thức giả lập."}],
        } for letter in "abcd"[:count]],
        symptoms=[{"symptom_code": f"signal_{letter}"} for letter in "abcd"],
    )
    state = run_node1({"input_features": {"symptoms": {
        "signal_a": "PRESENT", "signal_b": "PRESENT", "signal_d": "ABSENT",
    }}}, reader)
    state.update(priority_rule=priority, priority_final=priority)
    return run_node2(state, reader)


def proposal(state, *, raise_priority=False):
    return {"ranking": [
        {"condition_code": candidate["condition_code"], "reason": "Bằng chứng hỗ trợ giả lập."}
        for candidate in reversed(state["candidates"])
    ], "raise_priority": raise_priority}


@pytest.fixture
def catalogue(monkeypatch):
    """Fake Active decisions while spying on calls to the shared validators."""
    class Catalogue:
        db = object()  # Cannot query, write, commit or roll back directly.

        def __init__(self):
            self.conditions = {f"condition_{letter}" for letter in "abcd"}
            self.symptoms = {f"signal_{letter}" for letter in "abcd"}
            self.calls = []

        def active_conditions(self, db, codes):
            assert db is self.db
            self.calls.append(("conditions", list(codes)))
            if not set(codes) <= self.conditions:
                raise AppError(422, "UNKNOWN_CONDITION", "SYNTHETIC_PRIVATE_MARKER")
            return set(codes)

        def active_symptoms(self, db, codes):
            assert db is self.db
            self.calls.append(("symptoms", list(codes)))
            if not set(codes) <= self.symptoms:
                raise AppError(422, "UNKNOWN_SYMPTOM", "SYNTHETIC_PRIVATE_MARKER")
            return dict.fromkeys(codes)

    fake = Catalogue()
    monkeypatch.setattr(knowledge_validators, "active_condition_codes", fake.active_conditions)
    monkeypatch.setattr(knowledge_validators, "active_symptoms", fake.active_symptoms)
    return fake


def validate(state, catalogue, output=...):
    reasoning = deepcopy(state)
    reasoning["llm_output"] = proposal(state) if output is ... else output
    return run_node4(reasoning, catalogue.db)


def assert_rejected(result, original, code):
    assert result["ai_status"] == "Degraded"
    assert result["mode"] == "RuleOnly"
    assert result["validation_result"] == {
        "valid": False, "errors": [code], "schema_version": "1",
    }
    assert result["error"] == code
    assert result["candidates"] == original["candidates"][:3]
    assert "llm_output" not in result
    assert all("reason" not in candidate for candidate in result["candidates"])
    assert result["priority_final"] == original["priority_final"]


def test_node1_through_node4_accepts_mock_ranking_and_only_copies_node2_evidence(catalogue):
    state = retrieved_state(count=4)
    output = proposal(state)
    reasoning = asyncio.run(run_node3(state, MockLLMClient(output), timeout_seconds=5))
    original = deepcopy(reasoning)

    result = run_node4(reasoning, catalogue.db)

    assert reasoning == original
    assert result is not reasoning
    assert result["ai_status"] == "Completed"
    assert result["mode"] == "Full"
    assert result["priority_rule"] == result["priority_final"] == "Routine"
    assert result["validation_result"] == {"valid": True, "errors": [], "schema_version": "1"}
    assert "llm_output" not in result
    assert "error" not in result
    assert [c["condition_code"] for c in result["candidates"]] == [
        "condition_d", "condition_c", "condition_b",
    ]
    by_code = {c["condition_code"]: c for c in state["candidates"]}
    for candidate in result["candidates"]:
        expected = deepcopy(by_code[candidate["condition_code"]])
        expected["reason"] = "Bằng chứng hỗ trợ giả lập."
        assert candidate == expected
        assert candidate["label"] == "Reference Suggestion"
    assert catalogue.calls[0] == (
        "conditions", ["condition_a", "condition_b", "condition_c", "condition_d"],
    )
    assert catalogue.calls[1][0] == "symptoms"
    assert set(catalogue.calls[1][1]) == {"signal_a", "signal_b", "signal_c", "signal_d"}
    # Returned nested evidence/guidelines must not mutate the source snapshot.
    result["candidates"][0]["supporting_evidence"][0]["weight"] = 0.1
    result["candidates"][0]["guidelines"][0]["excerpt"] = "Changed"
    assert reasoning == original


@pytest.mark.parametrize("priority", ["Routine", "HighPriority"])
@pytest.mark.parametrize("raise_priority", [False, True])
def test_ai_can_only_upgrade_routine_to_high_priority(catalogue, priority, raise_priority):
    state = retrieved_state(priority=priority)
    result = validate(state, catalogue, proposal(state, raise_priority=raise_priority))

    assert result["validation_result"]["valid"] is True
    assert result["priority_rule"] == priority
    assert result["priority_final"] == (
        "HighPriority" if raise_priority or priority == "HighPriority" else "Routine"
    )


def test_existing_higher_priority_is_preserved_when_no_new_upgrade_is_requested(catalogue):
    state = retrieved_state()
    state["priority_final"] = "HighPriority"
    result = validate(state, catalogue)
    assert result["validation_result"]["valid"] is True
    assert result["priority_final"] == "HighPriority"


def test_existing_priority_below_rule_floor_is_rejected_and_restored(catalogue):
    state = retrieved_state(priority="HighPriority")
    state["priority_final"] = "Routine"
    result = validate(state, catalogue)
    assert result["validation_result"] == {
        "valid": False, "errors": ["SAFETY_FLOOR"], "schema_version": "1",
    }
    assert result["priority_final"] == "HighPriority"
    assert result["mode"] == "RuleOnly"
    assert result["candidates"] == state["candidates"]


@pytest.mark.parametrize("field,value", [
    ("priority_final", "Routine"), ("priority_final", "Emergency"),
    ("priority", "Routine"), ("priority", "Emergency"),
    ("priority_rule", "Routine"), ("is_red_flag", True),
])
def test_model_cannot_assign_priority_lower_floor_or_assign_emergency(catalogue, field, value):
    state = retrieved_state(priority="HighPriority")
    output = proposal(state, raise_priority=True)
    output[field] = value
    assert_rejected(validate(state, catalogue, output), state, "INVALID_SCHEMA")


@pytest.mark.parametrize("field,value", [
    ("supporting_evidence", [{"symptom_code": "invented_signal", "status": "PRESENT"}]),
    ("contradicting_evidence", []), ("unknown_key_symptoms", ["invented_signal"]),
    ("guidelines", [{"excerpt_key": "invented_guide"}]),
    ("icd10_code", "INVENTED"), ("score", 1), ("label", "Definitive diagnosis"),
])
def test_generated_evidence_or_metadata_is_rejected_even_for_a_valid_candidate(catalogue, field, value):
    state = retrieved_state()
    output = proposal(state, raise_priority=True)
    output["ranking"][0][field] = value
    assert_rejected(validate(state, catalogue, output), state, "INVALID_SCHEMA")


def test_model_cannot_inject_top_level_evidence(catalogue):
    state = retrieved_state()
    output = proposal(state)
    output["supporting_evidence"] = ["invented_signal"]
    assert_rejected(validate(state, catalogue, output), state, "INVALID_SCHEMA")


def test_even_an_active_condition_outside_node2_is_rejected_as_a_whole(catalogue):
    state = retrieved_state()
    output = proposal(state, raise_priority=True)
    # condition_c is Active but not one of the two retrieved candidates.
    output["ranking"][0]["condition_code"] = "condition_c"
    assert_rejected(validate(state, catalogue, output), state, "OUTSIDE_CANDIDATES")


def test_invalid_fourth_rank_is_checked_before_display_limit(catalogue):
    state = retrieved_state(count=4)
    output = proposal(state, raise_priority=True)
    output["ranking"][3]["condition_code"] = "outside_candidates"
    assert_rejected(validate(state, catalogue, output), state, "OUTSIDE_CANDIDATES")


def test_duplicate_rank_is_rejected(catalogue):
    state = retrieved_state()
    output = proposal(state)
    output["ranking"][1] = deepcopy(output["ranking"][0])
    assert_rejected(validate(state, catalogue, output), state, "DUPLICATE_CANDIDATE")


@pytest.mark.parametrize("count", [0, 1, 3])
def test_ranking_cannot_silently_omit_node2_candidates(catalogue, count):
    state = retrieved_state(count=4)
    output = proposal(state)
    output["ranking"] = output["ranking"][:count]
    assert_rejected(validate(state, catalogue, output), state, "INCOMPLETE_RANKING")


@pytest.mark.parametrize("output", [
    None, "{broken json", '{"ranking": [], "raise_priority": false}', [], 42, True,
    {}, {"ranking": []}, {"raise_priority": False},
    {"ranking": "invalid", "raise_priority": False},
    {"ranking": [None], "raise_priority": False},
    {"ranking": [{"condition_code": "condition_a"}], "raise_priority": False},
    {"ranking": [{"condition_code": 12, "reason": "text"}], "raise_priority": False},
    {"ranking": [{"condition_code": "condition_a", "reason": 12}], "raise_priority": False},
    {"ranking": [], "raise_priority": "true"},
    {"ranking": [], "raise_priority": 1},
    {"ranking": [], "raise_priority": None},
])
def test_invalid_json_shape_fields_and_types_fall_back(catalogue, output):
    state = retrieved_state()
    assert_rejected(validate(state, catalogue, output), state, "INVALID_SCHEMA")


def test_absent_llm_output_is_rejected_without_retaining_stale_validation(catalogue):
    state = retrieved_state()
    state.update(validation_result={"valid": True}, error="old")
    assert_rejected(run_node4(state, catalogue.db), state, "INVALID_SCHEMA")


@pytest.mark.parametrize("reason", ["", "x" * 501])
def test_reason_must_follow_schema_length_limits(catalogue, reason):
    state = retrieved_state()
    output = proposal(state)
    output["ranking"][0]["reason"] = reason
    assert_rejected(validate(state, catalogue, output), state, "INVALID_SCHEMA")


def test_whitespace_reason_is_rejected(catalogue):
    state = retrieved_state()
    output = proposal(state)
    output["ranking"][0]["reason"] = " \t\n"
    assert_rejected(validate(state, catalogue, output), state, "INVALID_REASON")


def test_more_than_four_ranks_is_rejected(catalogue):
    state = retrieved_state(count=4)
    output = proposal(state)
    output["ranking"].append({"condition_code": "condition_extra", "reason": "text"})
    assert_rejected(validate(state, catalogue, output), state, "INVALID_SCHEMA")


@pytest.mark.parametrize("code", ["Invalid-Code", "Condition_a", "a" * 81, "bad__slug"])
def test_llm_condition_codes_use_shared_slug_validator(catalogue, code):
    state = retrieved_state()
    output = proposal(state)
    output["ranking"][0]["condition_code"] = code
    assert_rejected(validate(state, catalogue, output), state, "INVALID_SCHEMA")


def test_retired_condition_in_hidden_node2_slot_prevents_any_diagnosis(catalogue):
    state = retrieved_state(count=4)
    catalogue.conditions.remove("condition_d")
    result = validate(state, catalogue)
    assert result["candidates"] == []
    assert result["validation_result"]["errors"] == ["INACTIVE_KNOWLEDGE"]
    assert result["mode"] == "RuleOnly"
    assert result["priority_final"] == "Routine"
    assert "llm_output" not in result


@pytest.mark.parametrize("code", ["signal_a", "signal_b", "signal_c", "signal_d"])
def test_inactive_support_counterevidence_or_unknown_symptom_prevents_diagnoses(catalogue, code):
    state = retrieved_state()
    catalogue.symptoms.remove(code)
    result = validate(state, catalogue)
    assert result["candidates"] == []
    assert result["validation_result"]["errors"] == ["INACTIVE_KNOWLEDGE"]
    assert result["mode"] == "RuleOnly"


@pytest.mark.parametrize("change", [
    "invented", "wrong_status", "wrong_polarity", "duplicate", "unknown_is_present",
    "duplicate_unknown", "malformed_features",
])
def test_baseline_evidence_must_match_confirmed_features(catalogue, change):
    state = retrieved_state()
    candidate = state["candidates"][0]
    if change == "invented":
        candidate["supporting_evidence"][0]["symptom_code"] = "invented_signal"
    elif change == "wrong_status":
        candidate["supporting_evidence"][0]["status"] = "ABSENT"
    elif change == "wrong_polarity":
        candidate["contradicting_evidence"][0]["polarity"] = "SUPPORTS"
    elif change == "duplicate":
        candidate["supporting_evidence"].append(deepcopy(candidate["supporting_evidence"][0]))
    elif change == "unknown_is_present":
        candidate["unknown_key_symptoms"] = ["signal_a"]
    elif change == "duplicate_unknown":
        candidate["unknown_key_symptoms"] *= 2
    else:
        state["input_features"]["symptoms"] = []
    result = validate(state, catalogue)
    assert result["candidates"] == []
    assert result["validation_result"]["errors"] == ["INVALID_EVIDENCE"]
    assert result["ai_status"] == "Degraded"
    assert result["priority_final"] == "Routine"
    assert catalogue.calls == []


@pytest.mark.parametrize("terminal", [
    {"is_red_flag": True}, {"ai_status": "Skipped"},
    {"priority_rule": "Emergency"}, {"priority_final": "Emergency"},
])
def test_terminal_gate_never_validates_model_output_or_retains_diagnoses(catalogue, terminal):
    state = retrieved_state()
    state.update(llm_output=proposal(state), validation_result={"valid": True}, error="old")
    state.update(terminal)
    original = deepcopy(state)
    result = run_node4(state, catalogue.db)
    assert not {"candidates", "llm_output", "validation_result", "error"}.intersection(result)
    assert result["ai_status"] == "Skipped"
    assert catalogue.calls == []
    assert state == original


@pytest.mark.parametrize("field", ["is_red_flag", "priority_rule", "priority_final"])
def test_node1_is_required_before_output_validation(catalogue, field):
    state = retrieved_state()
    state.pop(field)
    with pytest.raises(ValueError, match="Node 1"):
        run_node4(state, catalogue.db)
    assert catalogue.calls == []


@pytest.mark.parametrize("field,value", [
    ("is_red_flag", 0), ("is_red_flag", None),
    ("priority_rule", "Invalid"), ("priority_final", None),
])
def test_invalid_gate_state_cannot_reach_catalogue(catalogue, field, value):
    state = retrieved_state()
    state[field] = value
    with pytest.raises(ValueError, match="Node 1"):
        run_node4(state, catalogue.db)
    assert catalogue.calls == []


@pytest.mark.parametrize("candidates", [None, {}, "invalid", [None] * 5])
def test_node2_is_required_and_capped(catalogue, candidates):
    state = retrieved_state()
    state["candidates"] = candidates
    with pytest.raises(ValueError, match="Node 2"):
        run_node4(state, catalogue.db)
    assert catalogue.calls == []


def test_duplicate_node2_candidates_are_rejected(catalogue):
    state = retrieved_state()
    state["candidates"][1] = deepcopy(state["candidates"][0])
    with pytest.raises(ValueError, match="Node 2"):
        run_node4(state, catalogue.db)


def test_empty_retrieval_keeps_no_diagnoses_and_cannot_upgrade_priority(catalogue):
    state = retrieved_state(count=0)
    output = {"ranking": [], "raise_priority": True}
    assert_rejected(validate(state, catalogue, output), state, "NO_CANDIDATES")
    assert catalogue.calls == []


def test_raw_data_and_validation_errors_are_never_logged_or_returned_as_metadata(catalogue, caplog, capsys):
    state = retrieved_state()
    private = "SYNTHETIC_PRIVATE_MARKER_0900000000"
    state["input_features"].update(full_name=private, clinical_notes=private)
    output = proposal(state)
    output["ranking"][0]["supporting_evidence"] = private
    result = validate(state, catalogue, output)
    metadata = {key: result[key] for key in ("validation_result", "error")}
    assert private not in json.dumps(metadata)
    assert "llm_output" not in result
    assert caplog.records == []
    captured = capsys.readouterr()
    assert captured.out == captured.err == ""


def test_shared_catalogue_errors_are_sanitized(catalogue, caplog):
    catalogue.symptoms.clear()
    result = validate(retrieved_state(), catalogue)
    assert "SYNTHETIC_PRIVATE_MARKER" not in json.dumps(result["validation_result"])
    assert result["error"] == "INACTIVE_KNOWLEDGE"
    assert caplog.records == []


def test_malformed_node2_error_does_not_echo_the_input(catalogue):
    state = retrieved_state()
    state["candidates"][0]["condition_code"] = "SYNTHETIC_PRIVATE_MARKER"
    with pytest.raises(ValueError) as caught:
        run_node4(state, catalogue.db)
    assert "SYNTHETIC_PRIVATE_MARKER" not in "".join(traceback.format_exception(caught.value))
    assert catalogue.calls == []


def test_unexpected_catalogue_failure_propagates_to_worker(catalogue, monkeypatch):
    failure = RuntimeError("Catalogue unavailable")

    def unavailable(db, codes):
        raise failure

    monkeypatch.setattr(knowledge_validators, "active_condition_codes", unavailable)
    state = retrieved_state()
    original = deepcopy(state)
    with pytest.raises(RuntimeError) as caught:
        validate(state, catalogue)
    assert caught.value is failure
    assert state == original


def test_success_discards_stale_error_and_validation_metadata(catalogue):
    state = retrieved_state()
    state.update(validation_result={"valid": False, "errors": ["old"]}, error="old",
                 ai_status="Degraded", mode="RuleOnly")
    original = deepcopy(state)
    result = validate(state, catalogue)
    assert result["validation_result"]["valid"] is True
    assert result["mode"] == "Full"
    assert "error" not in result
    assert state == original
