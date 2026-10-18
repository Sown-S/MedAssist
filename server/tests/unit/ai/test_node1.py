"""AI-02: quyết định an toàn Node 1 bằng luật Active giả lập và không dùng LLM."""

from copy import deepcopy
import os
from pathlib import Path
import subprocess
import sys
import textwrap

import pytest

from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.rules.condition_evaluator import ConditionFormatError
from app.ai.rules.red_flag_rules import evaluate_triage_rules
from app.validation.schema_validators import vital_sign_keys
from tests.unit.ai.fakes import FakeKnowledgeReader


def symptom(code="test_signal"):
    return {"type": "symptom", "symptom_code": code, "state": "PRESENT"}


def vital(key="spo2_pct"):
    # Phép so sánh giả lập để chạy engine, không phải bộ luật lâm sàng.
    return {"type": "vital", "vital": key, "cmp": "<", "value": 90}


def rule(rule_type="RED_FLAG", *, key=None, logic=None, version=2):
    return {
        "rule_key": key or ("rf_test" if rule_type == "RED_FLAG" else "pf_test"),
        "version": version,
        "rule_type": rule_type,
        "reason_text": "Lý do của luật thử nghiệm",
        "condition_logic": symptom() if logic is None else logic,
        "resulting_priority": "Emergency" if rule_type == "RED_FLAG" else "HighPriority",
        "status": "Active",
    }


def gate(rules, features):
    return run_node1(
        {"input_features": features}, FakeKnowledgeReader(triage_rules=rules)
    )


def test_red_flag_sets_emergency_and_skipped_with_rule_provenance():
    active_rule = rule(version=3)

    result = gate([active_rule], {"symptoms": {"test_signal": "PRESENT"}})

    assert result["priority_rule"] == result["priority_final"] == "Emergency"
    assert result["is_red_flag"] is True
    assert result["ai_status"] == "Skipped"
    assert result["complete_now"] == []
    assert result["rule_hits"] == [
        {"rule_key": "rf_test", "version": 3, "reason": active_rule["reason_text"]}
    ]
    assert "candidates" not in result
    assert "llm_output" not in result


@pytest.mark.parametrize("features", [{}, {"symptoms": {"test_signal": "UNKNOWN"}}])
def test_unknown_red_flag_never_sets_emergency_and_requests_completion(features):
    result = gate([rule()], features)

    assert result["priority_rule"] == result["priority_final"] == "Routine"
    assert result["is_red_flag"] is False
    assert result["ai_status"] == "Pending"
    assert result["rule_hits"] == []
    assert result["complete_now"] == ["symptoms.test_signal"]


@pytest.mark.parametrize("vitals", [{}, {"spo2_pct": None}])
def test_unmeasured_vital_in_red_flag_is_unknown(vitals):
    result = gate([rule(logic=vital())], {"vital_signs": vitals})

    assert result["priority_rule"] == "Routine"
    assert result["is_red_flag"] is False
    assert result["complete_now"] == ["vital_signs.spo2_pct"]


@pytest.mark.parametrize("key", vital_sign_keys())
def test_red_flag_accepts_all_shared_vital_sign_keys(key):
    result = gate([rule(logic=vital(key))], {"vital_signs": {key: 80}})

    assert result["priority_rule"] == "Emergency"
    assert result["ai_status"] == "Skipped"


def test_matching_floor_sets_high_priority_and_leaves_ai_pending():
    result = gate([rule("PRIORITY_FLOOR")], {"symptoms": {"test_signal": "PRESENT"}})

    assert result["priority_rule"] == result["priority_final"] == "HighPriority"
    assert result["is_red_flag"] is False
    assert result["ai_status"] == "Pending"
    assert result["complete_now"] == []
    assert [hit["rule_key"] for hit in result["rule_hits"]] == ["pf_test"]


@pytest.mark.parametrize("rules", [[], [rule()], [rule("PRIORITY_FLOOR")]])
def test_no_matching_rules_yields_routine(rules):
    result = gate(rules, {"symptoms": {"test_signal": "ABSENT"}})

    assert result["priority_rule"] == result["priority_final"] == "Routine"
    assert result["is_red_flag"] is False
    assert result["rule_hits"] == []
    assert result["complete_now"] == []
    assert result["ai_status"] == "Pending"


@pytest.mark.parametrize("reverse", [False, True])
def test_red_flag_dominates_matching_floor_in_either_order(reverse):
    rules = [rule(), rule("PRIORITY_FLOOR")]
    if reverse:
        rules.reverse()

    result = gate(rules, {"symptoms": {"test_signal": "PRESENT"}})

    assert result["priority_rule"] == result["priority_final"] == "Emergency"
    assert result["is_red_flag"] is True
    assert result["ai_status"] == "Skipped"
    assert {hit["rule_key"] for hit in result["rule_hits"]} == {"rf_test", "pf_test"}


def test_unknown_red_flag_preserves_matching_floor_and_completion_list():
    rules = [rule(logic=vital()), rule("PRIORITY_FLOOR")]

    result = gate(rules, {"symptoms": {"test_signal": "PRESENT"}})

    assert result["priority_rule"] == result["priority_final"] == "HighPriority"
    assert result["is_red_flag"] is False
    assert result["ai_status"] == "Pending"
    assert result["complete_now"] == ["vital_signs.spo2_pct"]
    assert [hit["rule_key"] for hit in result["rule_hits"]] == ["pf_test"]


def test_unknown_floor_does_not_add_complete_now_items():
    result = gate([rule("PRIORITY_FLOOR", logic=vital())], {})

    assert result["priority_rule"] == "Routine"
    assert result["complete_now"] == []


def test_completion_deduplicates_across_red_flags_and_excludes_floor_data():
    rules = [
        rule(key="rf_first", logic={"op": "OR", "args": [symptom(), vital()]}),
        rule(key="rf_second", logic=symptom()),
        rule(key="rf_age", logic={"type": "age", "unit": "years", "cmp": ">=", "value": 60}),
        rule(key="rf_age_months", logic={"type": "age", "unit": "months", "cmp": "<", "value": 12}),
        rule("PRIORITY_FLOOR", logic=symptom("floor_only")),
    ]

    result = gate(rules, {})

    assert result["priority_rule"] == "Routine"
    assert result["rule_hits"] == []
    assert result["complete_now"] == [
        "symptoms.test_signal", "vital_signs.spo2_pct", "age_years", "age_months"
    ]


@pytest.mark.parametrize(
    "op,status,priority,missing",
    [
        ("AND", "ABSENT", "Routine", []),
        ("AND", "PRESENT", "Routine", ["vital_signs.spo2_pct"]),
        ("OR", "ABSENT", "Routine", ["vital_signs.spo2_pct"]),
        ("OR", "PRESENT", "Emergency", []),
    ],
)
def test_gate_preserves_decisive_and_unknown_kleene_results(op, status, priority, missing):
    tree = {"op": op, "args": [symptom(), vital()]}

    result = gate([rule(logic=tree)], {"symptoms": {"test_signal": status}})

    assert result["priority_rule"] == priority
    assert result["is_red_flag"] is (priority == "Emergency")
    assert result["complete_now"] == missing


def test_all_true_red_flags_are_reported_and_emergency_needs_no_completion():
    rules = [rule(key="rf_first"), rule(key="rf_second"), rule(key="rf_missing", logic=vital())]

    result = gate(rules, {"symptoms": {"test_signal": "PRESENT"}})

    assert result["priority_rule"] == "Emergency"
    assert result["ai_status"] == "Skipped"
    assert result["complete_now"] == []
    assert [hit["rule_key"] for hit in result["rule_hits"]] == ["rf_first", "rf_second"]


@pytest.mark.parametrize("rule_type,expected", [("RED_FLAG", "Emergency"), ("PRIORITY_FLOOR", "HighPriority")])
def test_priority_is_derived_from_rule_type(rule_type, expected):
    active_rule = rule(rule_type)
    active_rule["resulting_priority"] = "Routine" if rule_type == "RED_FLAG" else "Emergency"

    result = gate([active_rule], {"symptoms": {"test_signal": "PRESENT"}})

    assert result["priority_rule"] == result["priority_final"] == expected


@pytest.mark.parametrize("rule_type", ["RED_FLAG", "PRIORITY_FLOOR"])
def test_unknown_vital_key_is_rejected_even_behind_true_or_branch(rule_type):
    tree = {"op": "OR", "args": [symptom(), vital("oxygen")]}

    with pytest.raises(ConditionFormatError, match="Khóa sinh hiệu không hợp lệ"):
        gate([rule(rule_type, logic=tree)], {"symptoms": {"test_signal": "PRESENT"}})


@pytest.mark.parametrize(
    "field,value",
    [
        ("rule_type", "OTHER"),
        ("rule_key", ""),
        ("reason_text", " "),
        ("version", 0),
        ("version", True),
        ("condition_logic", None),
    ],
)
def test_malformed_active_rules_raise_instead_of_silently_becoming_routine(field, value):
    active_rule = rule()
    active_rule[field] = value

    with pytest.raises(ConditionFormatError):
        gate([active_rule], {})


def test_invalid_features_are_rejected_even_without_rules():
    with pytest.raises(ConditionFormatError, match="input_features phải là object"):
        evaluate_triage_rules(None, [])


@pytest.mark.parametrize(
    "rules", [None, {}, {"rule_key": "rf_test"}, "", "RED_FLAG", b"", bytearray(), 0]
)
def test_malformed_rule_collections_raise_instead_of_silently_becoming_routine(rules):
    class MalformedReader(FakeKnowledgeReader):
        def active_triage_rules(self):
            return rules

    with pytest.raises(ConditionFormatError, match="rules phải là danh sách luật"):
        run_node1({"input_features": {}}, MalformedReader())


@pytest.mark.parametrize("rules", [[], ()])
def test_empty_rule_sequences_are_valid(rules):
    result = evaluate_triage_rules({}, rules)

    assert result == {
        "priority": "Routine",
        "rule_hits": [],
        "is_red_flag": False,
        "complete_now": [],
    }


@pytest.mark.parametrize("item", [None, "RED_FLAG", 1])
def test_non_object_rule_entries_raise_a_condition_format_error(item):
    with pytest.raises(ConditionFormatError, match="Luật phân loại phải là object"):
        evaluate_triage_rules({}, [item])


def test_node_reads_only_active_triage_rules_through_reader_boundary():
    class TriageOnlyReader(FakeKnowledgeReader):
        calls = 0

        def active_triage_rules(self):
            self.calls += 1
            return super().active_triage_rules()

        def active_release(self):
            raise AssertionError("Node 1 must only read triage rules")

        active_conditions = active_symptoms = active_release

    reader = TriageOnlyReader(triage_rules=[rule()])

    result = run_node1({"input_features": {"symptoms": {"test_signal": "PRESENT"}}}, reader)

    assert result["priority_rule"] == "Emergency"
    assert reader.calls == 1


@pytest.mark.parametrize("rule_type", ["RED_FLAG", "PRIORITY_FLOOR"])
def test_reassessment_returns_fresh_state_without_old_diagnoses_or_input_mutation(rule_type):
    state = {
        "input_features": {"symptoms": {"test_signal": "PRESENT"}},
        "priority_rule": "Routine",
        "candidates": [{"condition_code": "old_candidate"}],
        "llm_output": {"ranking": ["old_candidate"]},
        "complete_now": ["old_field"],
        "ai_status": "Ready",
    }
    rules = [rule(rule_type)]
    original_state, original_rules = deepcopy(state), deepcopy(rules)

    result = run_node1(state, FakeKnowledgeReader(triage_rules=rules))

    assert result is not state
    assert state == original_state
    assert rules == original_rules
    assert result["input_features"] == original_state["input_features"]
    assert "candidates" not in result
    assert "llm_output" not in result
    assert result["complete_now"] == []


def test_node_imports_and_runs_with_llm_routers_and_graph_dependencies_blocked():
    # Interpreter mới phát hiện cả import bắc cầu dù test khác đã import module tùy
    # chọn trong tiến trình pytest.
    program = textwrap.dedent(
        """
        import importlib.abc
        import sys

        blocked = ("app.ai.llm", "app.routers", "ollama", "langgraph", "httpx")

        class BlockAIImports(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname, path=None, target=None):
                if any(fullname == name or fullname.startswith(name + ".") for name in blocked):
                    raise AssertionError("Forbidden Node 1 dependency: " + fullname)

        sys.meta_path.insert(0, BlockAIImports())
        from app.ai.pipeline.node1_red_flag_gate import run_node1

        class Reader:
            def active_triage_rules(self):
                return [{
                    "rule_key": "rf_import_test", "version": 1,
                    "rule_type": "RED_FLAG", "reason_text": "Test rule",
                    "condition_logic": {
                        "type": "symptom", "symptom_code": "test_signal", "state": "PRESENT"
                    },
                }]

        result = run_node1(
            {"input_features": {"symptoms": {"test_signal": "PRESENT"}}}, Reader()
        )
        assert result["priority_rule"] == "Emergency"
        assert result["ai_status"] == "Skipped"
        assert not any(
            module == name or module.startswith(name + ".")
            for module in sys.modules for name in blocked
        )
        """
    )
    completed = subprocess.run(
        [sys.executable, "-B", "-c", program],
        cwd=Path(__file__).resolve().parents[3],
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True,
        text=True,
        timeout=20,
    )

    assert completed.returncode == 0, completed.stderr
