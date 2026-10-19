from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import (
    AuditLog,
    KnowledgeRelease,
    KnowledgeSource,
    Patient,
    TriageRule,
    Visit,
)
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


def test_rule_hits_and_candidates_are_projected_for_polling():
    state = {
        "rule_hits": [
            {"rule_key": "rf_x", "version": 2, "reason": "Cờ đỏ"},
            {"rule_key": "pf_x", "version": 3, "reason": "Mức sàn"},
        ],
        "complete_now": ["symptoms.fever"],
        "candidates": [candidate()],
    }
    names = {"cough": "Ho", "fever": "Sốt"}
    projected_hits = assessment_service._rule_hits(state, symptom_map=names)
    assert projected_hits == {
        "hits": [
            {"rule_key": "rf_x", "version": 2, "rule_type": "RED_FLAG",
             "resulting_priority": "Emergency", "reason_text": "Cờ đỏ"},
            {"rule_key": "pf_x", "version": 3, "rule_type": "PRIORITY_FLOOR",
             "resulting_priority": "HighPriority", "reason_text": "Mức sàn"},
        ],
        "complete_now": [{"symptom_code": "fever", "symptom_name": "Sốt"}],
    }
    projected = assessment_service._candidates(state, names)[0]
    assert projected["supporting"] == [{
        "symptom_code": "cough", "symptom_name": "Ho", "weight": 0.8, "is_key": True,
    }]
    assert projected["contradicting"] == []
    assert projected["missing"] == [{"symptom_code": "fever", "symptom_name": "Sốt"}]
    assert projected["label"] == "Reference Suggestion"
    assert "input_features" not in projected and "prompt" not in projected


def test_trigger_assessment_red_flag_and_queued_use_same_transaction(users):
    with SessionLocal() as db:
        release = KnowledgeRelease(
            label=f"AI09-{uuid4().hex[:8]}", status="Active",
            created_by=users["admin"].user_id, approved_by=users["bs"].user_id,
            approved_at=datetime.now(timezone.utc),
        )
        source = KnowledgeSource(
            title="Nguồn kiểm thử AI-09", organization="MedAssist",
            created_by=users["admin"].user_id,
        )
        patient = Patient(full_name="Ca giả lập", date_of_birth=date(1990, 1, 1), gender="Male")
        db.add_all([release, source, patient])
        db.flush()
        red = TriageRule(
            rule_key=f"rf_test_{uuid4().hex[:8]}", version=1,
            rule_name="Cờ đỏ kiểm thử", rule_type="RED_FLAG",
            condition_logic={"type": "vital", "vital": "spo2_pct", "cmp": "<=", "value": 90},
            resulting_priority="Emergency", reason_text="SpO2 thấp",
            source_id=source.source_id, status="Active", release_id=release.release_id,
            created_by=users["admin"].user_id,
        )
        db.add(red)
        db.flush()
        emergency_visit = Visit(
            patient_id=patient.patient_id, nurse_id=users["yta"].user_id,
            chief_complaint="Ca cấu trúc", vital_signs={"spo2_pct": 80},
        )
        queued_visit = Visit(
            patient_id=patient.patient_id, nurse_id=users["yta"].user_id,
            chief_complaint="Ca cấu trúc", vital_signs={"spo2_pct": 98},
        )
        db.add_all([emergency_visit, queued_visit])
        db.flush()

        release_data = {"release_id": release.release_id, "label": release.label}
        red_reader = FakeKnowledgeReader(
            release=release_data,
            triage_rules=[rule(
                "RED_FLAG", rule_key=red.rule_key, triage_rule_id=red.triage_rule_id,
                condition_logic=red.condition_logic, reason_text=red.reason_text,
            )],
        )
        skipped = assessment_service.trigger_assessment(
            db, emergency_visit.visit_id, red_reader, triggered_by=users["yta"].user_id
        )
        class RefreshingReader(FakeKnowledgeReader):
            refresh_calls = 0

            def refresh(self):
                self.refresh_calls += 1

        queued_reader = RefreshingReader(release=release_data)
        queued = assessment_service.trigger_assessment(
            db, queued_visit.visit_id, queued_reader,
            triggered_by=users["yta"].user_id,
        )

        assert skipped.status == "Skipped" and skipped.mode == "RuleOnly"
        assert skipped.completed_at is not None and skipped.priority_final == "Emergency"
        assert emergency_visit.ai_status == "Skipped"
        assert emergency_visit.red_flag_rule_id == red.triage_rule_id
        assert emergency_visit.red_flag_rule_type == "RED_FLAG"
        assert queued.status == "Queued" and queued.mode is None and queued.completed_at is None
        assert queued_visit.ai_status == "Pending" and queued.priority_rule == "Routine"
        assert set(queued.input_features) == {
            "symptoms", "vital_signs", "age_years", "age_months",
        }
        assert queued.input_features["vital_signs"] == {"spo2_pct": 98}
        assert "Ca giả lập" not in str(queued.input_features)
        assert queued_reader.refresh_calls == 1
        audits = list(db.scalars(select(AuditLog).where(
            AuditLog.action_type == "AI_ASSESSMENT",
            AuditLog.entity_id.in_([emergency_visit.visit_id, queued_visit.visit_id]),
        )))
        assert len(audits) == 2
        db.rollback()


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
