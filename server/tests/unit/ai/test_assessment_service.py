from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services import assessment_service
from tests.unit.ai.fakes import FakeKnowledgeReader


def rule(rule_type="PRIORITY_FLOOR", **extra):
    return {
        "rule_key": "pf_test" if rule_type == "PRIORITY_FLOOR" else "rf_test",
        "version": 1,
        "rule_type": rule_type,
        "resulting_priority": "HighPriority" if rule_type == "PRIORITY_FLOOR" else "Emergency",
        "reason_text": "Luật kiểm thử",
        "condition_logic": {
            "type": "symptom",
            "symptom_code": "cough",
            "state": "PRESENT",
        },
        **extra,
    }


def candidate(reason="Bằng chứng hỗ trợ từ cough."):
    return {
        "condition_code": "flu",
        "name_vi": "Cúm",
        "icd10_code": "J11",
        "score": 0.75,
        "supporting_evidence": [{
            "symptom_code": "cough",
            "status": "PRESENT",
            "polarity": "SUPPORTS",
            "weight": 0.8,
            "is_key": True,
        }],
        "contradicting_evidence": [],
        "unknown_key_symptoms": ["fever"],
        "reason": reason,
        "label": "Reference Suggestion",
    }


def test_offline_rule_only_runs_node2_without_llm():
    reader = FakeKnowledgeReader(
        triage_rules=[rule()],
        symptoms=[
            {"symptom_code": "cough", "symptom_name": "Ho"},
            {"symptom_code": "fever", "symptom_name": "Sốt"},
        ],
        conditions=[{
            "condition_code": "flu",
            "name_vi": "Cúm",
            "icd10_code": "J11",
            "symptoms": [{
                "symptom_code": "cough", "polarity": "SUPPORTS",
                "weight": 1, "is_key": True,
            }],
            "guidelines": [],
        }],
    )
    result = assessment_service.evaluate_case_offline(
        {"input_features": {"symptoms": {"cough": "PRESENT"}}},
        reader,
        mode="RuleOnly",
    )
    assert result["priority_rule"] == "HighPriority"
    assert result["ai_status"] == "Degraded"
    assert result["mode"] == "RuleOnly"
    assert [row["condition_code"] for row in result["candidates"]] == ["flu"]


def test_candidates_are_projected_for_polling():
    state = {"candidates": [candidate()]}
    names = {"cough": "Ho", "fever": "Sốt"}
    projected = assessment_service._candidates(state, names)[0]
    assert projected["supporting"] == [{
        "symptom_code": "cough", "symptom_name": "Ho", "weight": 0.8, "is_key": True,
    }]
    assert projected["contradicting"] == []
    assert projected["missing"] == [{"symptom_code": "fever", "symptom_name": "Sốt"}]
    assert projected["label"] == "Reference Suggestion"
    assert "input_features" not in projected and "prompt" not in projected


def test_latest_assessment_maps_release_label_and_polling_fields():
    visit_id = uuid4()
    log = SimpleNamespace(
        assessment_id=uuid4(), visit_id=visit_id, run_type="Assessment",
        queued_at=datetime.now(timezone.utc), mode="RuleOnly", knowledge_release_id=uuid4(),
        model_version=None, prompt_version=None, priority_rule="Routine", priority_final="Routine",
        rule_hits={"hits": [], "complete_now": [{"symptom_code": "fever", "symptom_name": "Sốt"}]},
        candidates=[],
    )
    visit = SimpleNamespace(visit_id=visit_id, ai_status="Pending", priority_raised_by_ai=False)

    class ScalarResult:
        def first(self):
            return log

    class DB:
        def get(self, model, key):
            return visit

        def scalars(self, query):
            return ScalarResult()

        def scalar(self, query):
            return "KB-2026"

    payload = assessment_service.get_latest_assessment(DB(), visit_id)
    assert payload["ai_status"] == "Pending"
    assert payload["knowledge_release"] == "KB-2026"
    assert payload["complete_now"] == [{"symptom_code": "fever", "symptom_name": "Sốt"}]


def test_latest_assessment_normalizes_queue_service_shapes():
    visit_id = uuid4()
    log = SimpleNamespace(
        assessment_id=uuid4(), visit_id=visit_id, run_type="Assessment",
        queued_at=datetime.now(timezone.utc), mode="Full", knowledge_release_id=None,
        model_name="gemma:9b", model_version=None, prompt_version="reasoning_v1",
        priority_rule="Routine", priority_final="Routine",
        rule_hits=[
            {"rule_key": "rf_low_spo2", "version": 1, "reason": "SpO2 thấp"},
            {"rule_key": "unknown", "version": 1, "reason": "Bỏ qua"},
        ],
        candidates=[candidate()],
    )
    visit = SimpleNamespace(visit_id=visit_id, ai_status="Ready", priority_raised_by_ai=False)

    class ScalarResult:
        def first(self):
            return log

    class DB:
        def get(self, model, key):
            return visit

        def scalars(self, query):
            return ScalarResult()

    reader = FakeKnowledgeReader(
        release={"label": "KB-ACTIVE"},
        symptoms=[
            {"symptom_code": "cough", "symptom_name": "Ho"},
            {"symptom_code": "fever", "symptom_name": "Sốt"},
        ],
    )
    payload = assessment_service.get_latest_assessment(DB(), visit_id, reader)
    assert payload["alerts"] == [{
        "rule_key": "rf_low_spo2", "rule_type": "RED_FLAG", "reason_text": "SpO2 thấp",
    }]
    assert payload["model_version"] == "gemma:9b"
    assert payload["candidates"][0]["rank"] == 1
    assert payload["candidates"][0]["supporting"][0]["symptom_name"] == "Ho"
    assert payload["candidates"][0]["missing"] == [
        {"symptom_code": "fever", "symptom_name": "Sốt"}
    ]


def test_invalid_offline_mode_is_rejected():
    with pytest.raises(ValueError, match="RuleOnly hoặc Full"):
        assessment_service.evaluate_case_offline({}, FakeKnowledgeReader(), mode="Other")
