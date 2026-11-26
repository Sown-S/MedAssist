"""S2: sửa sinh hiệu ở lượt đã lưu tiếp đón thì Node 1 chạy lại trong cùng transaction (ERD §4)."""

import uuid

import pytest
from sqlalchemy import select, text

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models import AiAssessmentLog, KnowledgeRelease, KnowledgeSource, TriageRule, User
from app.routers import assessment_router
from app.services import ai_queue_service
from tests.unit.ai.fakes import FakeKnowledgeReader

SPO2_RULE = {"type": "vital", "vital": "spo2_pct", "cmp": "<=", "value": 90}


@pytest.fixture
def red_flag_kb(users, owner_engine):
    """Luật RED_FLAG SpO2 <= 90 có dòng thật trong CSDL (FK visit.red_flag_rule_id) + reader giả trỏ tới nó."""
    with SessionLocal() as db:
        release = KnowledgeRelease(
            label=f"S2-{uuid.uuid4().hex[:8]}", status="Draft", created_by=users["admin"].user_id
        )
        source = KnowledgeSource(title="Nguồn S2", organization="MedAssist", created_by=users["admin"].user_id)
        db.add_all([release, source])
        db.flush()
        rule = TriageRule(
            rule_key=f"rf_s2_{uuid.uuid4().hex[:8]}",
            rule_name="SpO2 thấp",
            rule_type="RED_FLAG",
            condition_logic=SPO2_RULE,
            resulting_priority="Emergency",
            reason_text="SpO2 thấp",
            source_id=source.source_id,
            status="Active",
            release_id=release.release_id,
            created_by=users["admin"].user_id,
        )
        db.add(rule)
        db.commit()
        ids = {"rule": rule.triage_rule_id, "release": release.release_id, "source": source.source_id}
        rule_key = rule.rule_key
    reader = FakeKnowledgeReader(
        release={"release_id": ids["release"], "label": "S2-KB"},
        triage_rules=[
            {
                "triage_rule_id": ids["rule"],
                "rule_key": rule_key,
                "version": 1,
                "rule_type": "RED_FLAG",
                "resulting_priority": "Emergency",
                "reason_text": "SpO2 thấp",
                "condition_logic": SPO2_RULE,
            }
        ],
    )
    app.dependency_overrides[assessment_router.get_knowledge_reader] = lambda: reader
    app.dependency_overrides[assessment_router.get_knowledge_reader_lazy] = lambda: lambda: reader
    yield reader
    app.dependency_overrides.pop(assessment_router.get_knowledge_reader, None)
    app.dependency_overrides.pop(assessment_router.get_knowledge_reader_lazy, None)
    with owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE ai_assessment_log SET knowledge_release_id = NULL WHERE knowledge_release_id = :r"),
            {"r": ids["release"]},
        )
        conn.execute(
            text(
                "UPDATE visit SET triage_priority_rule = 'Routine', triage_priority = 'Routine', "
                "priority_raised_by_ai = false, is_red_flag = false, red_flag_rule_id = NULL, red_flag_reason = NULL "
                "WHERE red_flag_rule_id = :rule"
            ),
            {"rule": ids["rule"]},
        )
        conn.execute(text("DELETE FROM triage_rule WHERE triage_rule_id = :i"), {"i": ids["rule"]})
        conn.execute(text("DELETE FROM knowledge_release WHERE release_id = :i"), {"i": ids["release"]})
        conn.execute(text("DELETE FROM knowledge_source WHERE source_id = :i"), {"i": ids["source"]})


def _saved_visit(client, nurse, spo2=98, *, save=True) -> str:
    pid = client.post(
        "/api/v1/patients",
        headers=nurse,
        json={"full_name": f"BN S2 {uuid.uuid4().hex[:6]}", "date_of_birth": "1985-02-01", "gender": "Female"},
    ).json()["patient_id"]
    vid = client.post(
        "/api/v1/visits",
        headers=nurse,
        json={"patient_id": pid, "chief_complaint": "Khó thở", "vital_signs": {"spo2_pct": spo2}},
    ).json()["visit_id"]
    if save:
        assert client.post(f"/api/v1/visits/{vid}/assessment", headers=nurse).status_code == 202
    return vid


def _runs(visit_id: str) -> list[AiAssessmentLog]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(AiAssessmentLog)
                .where(AiAssessmentLog.visit_id == uuid.UUID(visit_id), AiAssessmentLog.run_type == "Assessment")
                .order_by(AiAssessmentLog.queued_at)
            )
        )


def _patch_vitals(client, headers, vid, **vitals):
    return client.patch(f"/api/v1/visits/{vid}", headers=headers, json={"vital_signs": vitals})


def test_spo2_drop_after_check_in_becomes_emergency_immediately(client, login, red_flag_kb, logs):
    nurse = login("yta")
    vid = _saved_visit(client, nurse)
    assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse).status_code == 200
    first = _runs(vid)[-1]
    assert first.status == "Queued"

    r = _patch_vitals(client, nurse, vid, spo2_pct=85)
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["triage_priority"], body["is_red_flag"], body["ai_status"]) == ("Emergency", True, "Skipped")
    assert body["red_flag_reason"] == "SpO2 thấp"

    runs = _runs(vid)
    assert [(x.status, x.error_detail) for x in runs] == [("Skipped", "SUPERSEDED"), ("Skipped", None)]
    assert runs[-1].priority_rule == "Emergency" and runs[-1].mode == "RuleOnly"

    audit = [row for row in logs(action="AI_ASSESSMENT", entity="visit") if str(row.entity_id) == vid][-1]
    assert audit.old_values == {"triage_priority": "Routine"}
    assert audit.new_values["triage_priority"] == "Emergency" and audit.new_values["is_red_flag"] is True
    update = [row for row in logs(action="UPDATE", entity="visit") if str(row.entity_id) == vid][-1]
    assert update.new_values == {"changed_fields": ["vital_signs"]}  # không ghi giá trị sinh hiệu


def test_corrected_vitals_lower_priority_and_requeue(client, login, red_flag_kb):
    nurse = login("yta")
    vid = _saved_visit(client, nurse, spo2=70)
    assert client.get(f"/api/v1/visits/{vid}", headers=nurse).json()["is_red_flag"] is True

    body = _patch_vitals(client, nurse, vid, spo2_pct=97).json()
    assert (body["triage_priority"], body["is_red_flag"], body["ai_status"]) == ("Routine", False, "Pending")
    assert body["red_flag_reason"] is None
    assert _runs(vid)[-1].status == "Queued"


@pytest.mark.parametrize("spo2, priority", [(90, "Emergency"), (91, "Routine")])
def test_threshold_boundary(client, login, red_flag_kb, spo2, priority):
    nurse = login("yta")
    vid = _saved_visit(client, nurse)
    assert _patch_vitals(client, nurse, vid, spo2_pct=spo2).json()["triage_priority"] == priority


def test_physician_retriages_own_examining_visit(client, login, red_flag_kb, doctor, doctor2):
    nurse = login("yta")
    vid = _saved_visit(client, nurse)
    assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse).status_code == 200
    assert client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor).status_code == 200

    r = _patch_vitals(client, doctor, vid, spo2_pct=88, weight_kg=60.0)
    assert r.status_code == 200, r.text
    assert (r.json()["triage_priority"], r.json()["status"]) == ("Emergency", "Examining")
    assert _runs(vid)[-1].triggered_by is not None

    other = _patch_vitals(client, doctor2, vid, spo2_pct=97)
    assert other.status_code == 409 and other.json()["error"]["code"] == "VISIT_LOCKED"
    assert client.get(f"/api/v1/visits/{vid}", headers=nurse).json()["triage_priority"] == "Emergency"


@pytest.fixture
def pharmacist(users, login):
    with SessionLocal() as db:
        if not db.scalar(select(User).where(User.username == "duocsi")):
            db.add(
                User(username="duocsi", password_hash=hash_password("Matkhau123"), full_name="DS", role="Pharmacist")
            )
            db.commit()
    return login("duocsi")


def test_roles_without_clinical_access_cannot_patch(client, login, red_flag_kb, pharmacist):
    vid = _saved_visit(client, login("yta"))
    for headers in (pharmacist, login("admin")):
        r = _patch_vitals(client, headers, vid, spo2_pct=80)
        assert r.status_code == 403, r.text
    assert len(_runs(vid)) == 1


def test_unsaved_intake_is_not_triaged(client, login, red_flag_kb):
    nurse = login("yta")
    vid = _saved_visit(client, nurse, save=False)
    body = _patch_vitals(client, nurse, vid, spo2_pct=80).json()
    assert body["triage_priority"] is None and body["is_red_flag"] is False
    assert _runs(vid) == []


def test_no_retriage_when_vitals_unchanged_or_other_fields(client, login, red_flag_kb):
    nurse = login("yta")
    vid = _saved_visit(client, nurse)
    assert _patch_vitals(client, nurse, vid, spo2_pct=98).status_code == 200
    r = client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"chief_complaint": "Khó thở, ho"})
    assert r.status_code == 200
    assert len(_runs(vid)) == 1


def test_vitals_cleared_is_a_change(client, login, red_flag_kb):
    nurse = login("yta")
    vid = _saved_visit(client, nurse, spo2=80)
    r = client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"vital_signs": None})
    assert r.status_code == 200
    assert (r.json()["is_red_flag"], r.json()["triage_priority"]) == (False, "Routine")
    assert len(_runs(vid)) == 2


def test_invalid_vitals_rejected_without_retriage(client, login, red_flag_kb):
    nurse = login("yta")
    vid = _saved_visit(client, nurse)
    r = _patch_vitals(client, nurse, vid, spo2_pct=40)
    assert r.status_code == 422
    assert len(_runs(vid)) == 1


def test_stale_worker_result_does_not_override_new_triage(client, login, red_flag_kb):
    nurse = login("yta")
    vid = _saved_visit(client, nurse)
    old = _runs(vid)[-1]
    with SessionLocal() as db:
        db.execute(
            text(
                "UPDATE ai_assessment_log SET status = 'Running', started_at = now(), lease_until = now() + "
                "interval '2 minutes', attempt_count = 1 WHERE assessment_id = :a"
            ),
            {"a": old.assessment_id},
        )
        db.commit()
    assert _patch_vitals(client, nurse, vid, spo2_pct=85).json()["triage_priority"] == "Emergency"

    with SessionLocal() as db:
        ai_queue_service.write_result(
            db,
            old.assessment_id,
            {
                "ai_status": "Completed",
                "mode": "Full",
                "priority_rule": "Routine",
                "priority_final": "HighPriority",
                "is_red_flag": False,
                "rule_hits": [],
                "candidates": [],
            },
            reader=red_flag_kb,
            model_name="m",
            prompt_version="p",
            latency_phase1_ms=1,
            latency_llm_ms=1,
            latency_total_ms=2,
        )
        db.commit()
    body = client.get(f"/api/v1/visits/{vid}", headers=nurse).json()
    assert (body["triage_priority"], body["is_red_flag"]) == ("Emergency", True)
