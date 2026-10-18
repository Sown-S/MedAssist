"""AI-11: hợp đồng API khởi tạo và polling đánh giá AI."""

from datetime import datetime, timezone
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.core.database import SessionLocal
from app.exceptions import AppError
from app.main import app
from app.models import (
    AiAssessmentLog,
    KnowledgeRelease,
    KnowledgeSource,
    TriageRule,
    Visit,
)
from app.routers import assessment_router
from tests.unit.ai.fakes import FakeKnowledgeReader


if not any(
    getattr(route, "path", None) == "/api/v1/visits/{visit_id}/assessment"
    for route in app.routes
):
    app.include_router(assessment_router.router, prefix="/api/v1")


@pytest.fixture
def knowledge_reader():
    reader = FakeKnowledgeReader(release={"label": "TEST-KB"})
    app.dependency_overrides[assessment_router.get_knowledge_reader] = lambda: reader
    yield reader
    app.dependency_overrides.pop(assessment_router.get_knowledge_reader, None)


def _visit(client, nurse, *, vital_signs=None):
    tag = uuid.uuid4().hex[:8]
    patient = client.post(
        "/api/v1/patients",
        headers=nurse,
        json={
            "full_name": f"Ca Assessment {tag}",
            "date_of_birth": "1990-01-01",
            "gender": "Male",
            "confirm_duplicate": True,
        },
    )
    assert patient.status_code == 201, patient.text
    visit = client.post(
        "/api/v1/visits",
        headers=nurse,
        json={
            "patient_id": patient.json()["patient_id"],
            "chief_complaint": "Dữ liệu kiểm thử có cấu trúc",
            "vital_signs": vital_signs,
        },
    )
    assert visit.status_code == 201, visit.text
    return visit.json()["visit_id"]


def test_post_queues_repeatable_assessment_and_get_polls_latest(
    client, login, users, logs, knowledge_reader
):
    nurse = login("yta")
    doctor = login("bs")
    admin = login("admin")
    visit_id = _visit(client, nurse, vital_signs={"spo2_pct": 98})

    first = client.post(f"/api/v1/visits/{visit_id}/assessment", headers=nurse)
    assert first.status_code == 202, first.text
    assert first.json() == {
        "assessment_id": first.json()["assessment_id"],
        "ai_status": "Pending",
        "mode": None,
        "knowledge_release": "TEST-KB",
        "model_version": None,
        "prompt_version": None,
        "priority": {"rule": "Routine", "final": "Routine", "raised_by_ai": False},
        "alerts": [],
        "complete_now": [],
        "candidates": [],
    }
    second = client.post(f"/api/v1/visits/{visit_id}/assessment", headers=nurse)
    assert second.status_code == 202
    assert second.json()["assessment_id"] != first.json()["assessment_id"]

    polled = client.get(f"/api/v1/visits/{visit_id}/assessment", headers=doctor)
    assert polled.status_code == 200
    assert polled.json()["assessment_id"] == second.json()["assessment_id"]
    assert client.get(f"/api/v1/visits/{visit_id}/assessment", headers=doctor).status_code == 200
    assert client.get(f"/api/v1/visits/{visit_id}/assessment", headers=admin).status_code == 403

    assessment_audits = [row for row in logs(action="AI_ASSESSMENT", entity="visit")
                         if str(row.entity_id) == visit_id]
    assert len(assessment_audits) == 2
    accepted_views = [
        row for row in logs(action="VIEW", entity="visit")
        if str(row.entity_id) == visit_id and (row.new_values or {}).get("result") != "denied"
    ]
    assert len(accepted_views) == 1
    assert accepted_views[0].new_values["dedupe_window_s"] == 300


def test_post_requires_nurse(client, login, knowledge_reader):
    nurse = login("yta")
    visit_id = _visit(client, nurse)
    assert client.post(
        f"/api/v1/visits/{visit_id}/assessment", headers=login("bs")
    ).status_code == 403
    assert client.post(
        f"/api/v1/visits/{visit_id}/assessment", headers=login("admin")
    ).status_code == 403
    assert client.post(f"/api/v1/visits/{visit_id}/assessment").status_code == 401


def test_get_without_assessment_returns_business_404(client, login, knowledge_reader):
    nurse = login("yta")
    visit_id = _visit(client, nurse)
    response = client.get(f"/api/v1/visits/{visit_id}/assessment", headers=nurse)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert response.json()["error"]["message"] == (
        "Chưa có kết quả đánh giá AI cho lượt khám này"
    )


def test_post_red_flag_returns_skipped_without_candidates(
    client, login, users, knowledge_reader, owner_engine
):
    nurse = login("yta")
    visit_id = _visit(client, nurse, vital_signs={"spo2_pct": 80})
    with SessionLocal() as db:
        release = KnowledgeRelease(
            label=f"AI11-{uuid.uuid4().hex[:8]}",
            status="Draft",
            created_by=users["admin"].user_id,
        )
        source = KnowledgeSource(
            title="Nguồn kiểm thử AI-11",
            organization="MedAssist",
            created_by=users["admin"].user_id,
        )
        db.add_all([release, source])
        db.flush()
        triage = TriageRule(
            rule_key=f"rf_api_{uuid.uuid4().hex[:8]}",
            version=1,
            rule_name="Cờ đỏ API",
            rule_type="RED_FLAG",
            condition_logic={
                "type": "vital", "vital": "spo2_pct", "cmp": "<=", "value": 90,
            },
            resulting_priority="Emergency",
            reason_text="SpO2 thấp",
            source_id=source.source_id,
            status="Active",
            release_id=release.release_id,
            created_by=users["admin"].user_id,
        )
        db.add(triage)
        db.commit()
        rule_id = triage.triage_rule_id
        release_id = release.release_id
        source_id = source.source_id
        rule_key = triage.rule_key

    try:
        knowledge_reader._release = {"release_id": release_id, "label": "AI11-RED"}
        knowledge_reader._triage_rules = [{
            "triage_rule_id": rule_id,
            "rule_key": rule_key,
            "version": 1,
            "rule_type": "RED_FLAG",
            "resulting_priority": "Emergency",
            "reason_text": "SpO2 thấp",
            "condition_logic": {
                "type": "vital", "vital": "spo2_pct", "cmp": "<=", "value": 90,
            },
        }]

        response = client.post(f"/api/v1/visits/{visit_id}/assessment", headers=nurse)
        assert response.status_code == 202, response.text
        body = response.json()
        assert body["ai_status"] == "Skipped" and body["mode"] == "RuleOnly"
        assert body["priority"] == {
            "rule": "Emergency", "final": "Emergency", "raised_by_ai": False,
        }
        assert body["alerts"] == [{
            "rule_key": rule_key, "rule_type": "RED_FLAG", "reason_text": "SpO2 thấp",
        }]
        assert body["candidates"] == []
    finally:
        with owner_engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE ai_assessment_log SET knowledge_release_id = NULL "
                    "WHERE knowledge_release_id = :release_id"
                ),
                {"release_id": release_id},
            )
            conn.execute(
                text(
                    "UPDATE visit SET triage_priority_rule = 'Routine', "
                    "triage_priority = 'Routine', priority_raised_by_ai = false, "
                    "is_red_flag = false, red_flag_rule_id = NULL, red_flag_reason = NULL "
                    "WHERE visit_id = :visit_id"
                ),
                {"visit_id": uuid.UUID(visit_id)},
            )
            conn.execute(
                text("DELETE FROM triage_rule WHERE triage_rule_id = :rule_id"),
                {"rule_id": rule_id},
            )
            conn.execute(
                text("DELETE FROM knowledge_release WHERE release_id = :release_id"),
                {"release_id": release_id},
            )
            conn.execute(
                text("DELETE FROM knowledge_source WHERE source_id = :source_id"),
                {"source_id": source_id},
            )


def test_get_returns_exact_completed_candidate_shape(client, login, users, knowledge_reader):
    nurse = login("yta")
    doctor = login("bs")
    visit_id = uuid.UUID(_visit(client, nurse))
    assessment_id = uuid.uuid4()
    with SessionLocal() as db:
        visit = db.get(Visit, visit_id)
        visit.ai_status = "Ready"
        visit.triage_priority_rule = "Routine"
        visit.triage_priority = "HighPriority"
        visit.priority_raised_by_ai = True
        db.add(AiAssessmentLog(
            assessment_id=assessment_id,
            visit_id=visit_id,
            run_type="Assessment",
            triggered_by=users["yta"].user_id,
            status="Completed",
            mode="Full",
            rule_hits={"hits": [], "complete_now": []},
            priority_rule="Routine",
            priority_final="HighPriority",
            candidates=[{
                "rank": 1,
                "condition_code": "influenza",
                "name_vi": "Cúm",
                "icd10_code": "J11",
                "score": 0.75,
                "supporting": [{
                    "symptom_code": "cough", "symptom_name": "Ho",
                    "weight": 0.8, "is_key": True,
                }],
                "contradicting": [],
                "missing": [{"symptom_code": "fever", "symptom_name": "Sốt"}],
                "explanation": "Bằng chứng hỗ trợ từ cough.",
                "label": "Reference Suggestion",
            }],
            model_version="9b",
            prompt_version="reasoning_v1",
            completed_at=datetime.now(timezone.utc),
        ))
        db.commit()

    response = client.get(f"/api/v1/visits/{visit_id}/assessment", headers=doctor)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "assessment_id": str(assessment_id),
        "ai_status": "Ready",
        "mode": "Full",
        "knowledge_release": "TEST-KB",
        "model_version": "9b",
        "prompt_version": "reasoning_v1",
        "priority": {"rule": "Routine", "final": "HighPriority", "raised_by_ai": True},
        "alerts": [],
        "complete_now": [],
        "candidates": [{
            "rank": 1,
            "condition_code": "influenza",
            "name_vi": "Cúm",
            "icd10_code": "J11",
            "score": 0.75,
            "supporting": [{
                "symptom_code": "cough", "symptom_name": "Ho",
                "weight": 0.8, "is_key": True,
            }],
            "contradicting": [],
            "missing": [{"symptom_code": "fever", "symptom_name": "Sốt"}],
            "explanation": "Bằng chứng hỗ trợ từ cough.",
            "label": "Reference Suggestion",
        }],
    }


def test_missing_knowledge_reader_reports_service_unavailable(monkeypatch):
    missing = ModuleNotFoundError("No module named app.services.knowledge_reader")
    missing.name = "app.services.knowledge_reader"
    monkeypatch.setattr(assessment_router, "import_module", lambda name: (_ for _ in ()).throw(missing))
    with pytest.raises(AppError) as caught:
        assessment_router.get_knowledge_reader(SimpleNamespace())
    assert caught.value.status_code == 503
    assert caught.value.code == "KNOWLEDGE_UNAVAILABLE"
