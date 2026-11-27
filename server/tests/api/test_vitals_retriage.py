"""S1: sửa sinh hiệu ở lượt đã lưu tiếp đón thì Node 1 chạy lại trong cùng transaction và chỉ nâng mức;
hạ mức phải qua đánh giá lại có chủ đích (POST /assessment) (ERD §4)."""

import time
import uuid

import pytest
from sqlalchemy import select, text

from app.core.database import SessionLocal
from app.main import app
from app.models import AiAssessmentLog, KnowledgeRelease, KnowledgeSource, TriageRule, Visit
from app.routers import assessment_router
from app.services import ai_queue_service
from tests.unit.ai.fakes import FakeKnowledgeReader

RULES = {
    "spo2": ("RED_FLAG", {"type": "vital", "vital": "spo2_pct", "cmp": "<=", "value": 90}, "SpO2 thấp"),
    "bp": ("RED_FLAG", {"type": "vital", "vital": "systolic_bp_mmhg", "cmp": "<", "value": 90}, "Tụt huyết áp"),
    "fever": ("PRIORITY_FLOOR", {"type": "vital", "vital": "temperature_c", "cmp": ">=", "value": 39}, "Sốt cao"),
}


@pytest.fixture
def kb(users, owner_engine):
    """Hai luật RED_FLAG có dòng thật trong CSDL (FK visit.red_flag_rule_id), một luật PRIORITY_FLOOR; reader giả."""
    tag = uuid.uuid4().hex[:8]
    with SessionLocal() as db:
        release = KnowledgeRelease(label=f"S1-{tag}", status="Draft", created_by=users["admin"].user_id)
        source = KnowledgeSource(title="Nguồn S1", organization="MedAssist", created_by=users["admin"].user_id)
        db.add_all([release, source])
        db.flush()
        rows = {
            name: TriageRule(
                rule_key=f"{'rf' if kind == 'RED_FLAG' else 'pf'}_s1_{name}_{tag}",
                rule_name=reason,
                rule_type=kind,
                condition_logic=logic,
                resulting_priority="Emergency" if kind == "RED_FLAG" else "HighPriority",
                reason_text=reason,
                source_id=source.source_id,
                status="Active",
                release_id=release.release_id,
                created_by=users["admin"].user_id,
            )
            for name, (kind, logic, reason) in RULES.items()
        }
        db.add_all(rows.values())
        db.commit()
        ids = {"release": release.release_id, "source": source.source_id}
        rule_ids = [r.triage_rule_id for r in rows.values()]
        reader = FakeKnowledgeReader(
            release={"release_id": release.release_id, "label": "S1-KB"},
            triage_rules=[
                {
                    "triage_rule_id": r.triage_rule_id,
                    "rule_key": r.rule_key,
                    "version": 1,
                    "rule_type": r.rule_type,
                    "resulting_priority": r.resulting_priority,
                    "reason_text": r.reason_text,
                    "condition_logic": r.condition_logic,
                }
                for r in rows.values()
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
                "WHERE red_flag_rule_id = ANY(:rules)"
            ),
            {"rules": rule_ids},
        )
        conn.execute(text("DELETE FROM triage_rule WHERE triage_rule_id = ANY(:rules)"), {"rules": rule_ids})
        conn.execute(text("DELETE FROM knowledge_release WHERE release_id = :i"), {"i": ids["release"]})
        conn.execute(text("DELETE FROM knowledge_source WHERE source_id = :i"), {"i": ids["source"]})


def _visit(client, nurse, *, save=True, **vitals) -> str:
    pid = client.post(
        "/api/v1/patients",
        headers=nurse,
        json={"full_name": f"BN S1 {uuid.uuid4().hex[:6]}", "date_of_birth": "1985-02-01", "gender": "Female"},
    ).json()["patient_id"]
    vid = client.post(
        "/api/v1/visits",
        headers=nurse,
        json={"patient_id": pid, "chief_complaint": "Khó thở", "vital_signs": vitals or {"spo2_pct": 98}},
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


def _patch(client, headers, vid, **vitals):
    return client.patch(f"/api/v1/visits/{vid}", headers=headers, json={"vital_signs": vitals})


def _triage(body: dict) -> tuple:
    return body["triage_priority"], body["is_red_flag"], body["ai_status"]


def _visit_row(vid: str) -> Visit:
    with SessionLocal() as db:
        return db.get(Visit, uuid.UUID(vid))


@pytest.fixture
def checked_in(client, login, kb):
    nurse = login("yta")
    vid = _visit(client, nurse)
    assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse).status_code == 200
    return nurse, vid


@pytest.fixture
def examining(client, login, kb, doctor):
    nurse = login("yta")
    vid = _visit(client, nurse)
    assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse).status_code == 200
    assert client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor).status_code == 200
    return doctor, vid


# --- Nâng mức theo từng trạng thái ---------------------------------------------------------------
@pytest.mark.parametrize(
    "vitals, expected, reason",
    [
        ({"spo2_pct": 85}, ("Emergency", True, "Skipped"), "SpO2 thấp"),
        ({"systolic_bp_mmhg": 80, "diastolic_bp_mmhg": 50}, ("Emergency", True, "Skipped"), "Tụt huyết áp"),
        ({"temperature_c": 39.5}, ("HighPriority", False, "Pending"), None),
    ],
)
@pytest.mark.parametrize("stage", ["waiting", "checked_in", "examining"])
def test_worse_vitals_raise_priority_in_patch_response(client, login, kb, doctor, stage, vitals, expected, reason):
    nurse = login("yta")
    vid = _visit(client, nurse)
    headers = nurse
    if stage != "waiting":
        assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse).status_code == 200
    if stage == "examining":
        assert client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor).status_code == 200
        headers = doctor

    r = _patch(client, headers, vid, **vitals)
    assert r.status_code == 200, r.text
    assert _triage(r.json()) == expected
    assert r.json()["red_flag_reason"] == reason
    assert r.json()["status"] == {"waiting": "Waiting", "checked_in": "CheckedIn", "examining": "Examining"}[stage]


def test_spo2_drop_supersedes_queued_run_and_audits(client, kb, checked_in, logs):
    nurse, vid = checked_in
    assert _runs(vid)[-1].status == "Queued"
    body = _patch(client, nurse, vid, spo2_pct=85).json()
    assert _triage(body) == ("Emergency", True, "Skipped")
    runs = _runs(vid)
    assert [(x.status, x.error_detail) for x in runs] == [("Skipped", "SUPERSEDED"), ("Skipped", None)]
    assert runs[-1].priority_rule == "Emergency" and runs[-1].mode == "RuleOnly"

    audit = [row for row in logs(action="AI_ASSESSMENT", entity="visit") if str(row.entity_id) == vid][-1]
    assert audit.old_values == {"triage_priority_rule": "Routine", "triage_priority": "Routine", "is_red_flag": False}
    assert audit.new_values["triage_priority"] == "Emergency" and audit.new_values["is_red_flag"] is True
    assert audit.new_values["allow_lower"] is False and audit.new_values["error_detail"] is None
    update = [row for row in logs(action="UPDATE", entity="visit") if str(row.entity_id) == vid][-1]
    assert update.new_values == {"changed_fields": ["vital_signs"]}  # không ghi giá trị sinh hiệu


@pytest.mark.parametrize("spo2, priority", [(90, "Emergency"), (91, "Routine")])
def test_threshold_boundary(client, kb, checked_in, spo2, priority):
    nurse, vid = checked_in
    assert _patch(client, nurse, vid, spo2_pct=spo2).json()["triage_priority"] == priority


# --- Không bao giờ hạ khi sửa sinh hiệu ------------------------------------------------------------
@pytest.mark.parametrize("vitals", [{"spo2_pct": 97}, None])
def test_red_flag_kept_when_vitals_improve_or_cleared(client, kb, checked_in, vitals):
    nurse, vid = checked_in
    assert _patch(client, nurse, vid, spo2_pct=70).json()["is_red_flag"] is True
    r = client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"vital_signs": vitals})
    assert r.status_code == 200
    assert _triage(r.json()) == ("Emergency", True, "Skipped")
    assert r.json()["red_flag_reason"] == "SpO2 thấp"
    last = _runs(vid)[-1]
    assert (last.status, last.error_detail, last.priority_rule) == ("Skipped", "RED_FLAG_KEPT", "Routine")
    row = _visit_row(vid)
    assert (row.triage_priority_rule, row.triage_priority) == ("Emergency", "Emergency")


def test_priority_floor_kept_when_fever_drops(client, kb, checked_in):
    nurse, vid = checked_in
    assert _patch(client, nurse, vid, temperature_c=39.5).json()["triage_priority"] == "HighPriority"
    body = _patch(client, nurse, vid, temperature_c=37.0).json()
    assert _triage(body) == ("HighPriority", False, "Pending")
    assert _runs(vid)[-1].status == "Queued"
    row = _visit_row(vid)
    assert (row.triage_priority_rule, row.priority_raised_by_ai) == ("HighPriority", False)


def test_red_flag_after_priority_floor_still_raises(client, kb, checked_in):
    nurse, vid = checked_in
    _patch(client, nurse, vid, temperature_c=39.5)
    assert _triage(_patch(client, nurse, vid, temperature_c=39.5, spo2_pct=85).json()) == ("Emergency", True, "Skipped")


def test_ai_raise_kept_after_vitals_edit(client, kb, checked_in, owner_engine):
    nurse, vid = checked_in
    with owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE visit SET triage_priority = 'HighPriority', priority_raised_by_ai = true WHERE visit_id = :v"),
            {"v": uuid.UUID(vid)},
        )
    body = _patch(client, nurse, vid, spo2_pct=96, weight_kg=55.0).json()
    assert body["triage_priority"] == "HighPriority"
    row = _visit_row(vid)
    assert (row.triage_priority_rule, row.priority_raised_by_ai) == ("Routine", True)


def test_routine_save_does_not_lower_but_allow_lower_does(client, kb, checked_in, logs):
    """Client gọi POST /assessment trong các lần lưu thường ngày: không được hạ. Gỡ gõ nhầm bằng allow_lower."""
    nurse, vid = checked_in
    _patch(client, nurse, vid, spo2_pct=70)
    _patch(client, nurse, vid, spo2_pct=97)
    assert client.post(f"/api/v1/visits/{vid}/assessment", headers=nurse).status_code == 202
    assert _triage(client.get(f"/api/v1/visits/{vid}", headers=nurse).json()) == ("Emergency", True, "Skipped")

    r = client.post(f"/api/v1/visits/{vid}/assessment", headers=nurse, json={"allow_lower": True})
    assert r.status_code == 202
    assert r.json()["priority"] == {"rule": "Routine", "final": "Routine", "raised_by_ai": False}
    body = client.get(f"/api/v1/visits/{vid}", headers=nurse).json()
    assert _triage(body) == ("Routine", False, "Pending") and body["red_flag_reason"] is None
    audit = [row for row in logs(action="AI_ASSESSMENT", entity="visit") if str(row.entity_id) == vid][-1]
    old = {"triage_priority_rule": "Emergency", "triage_priority": "Emergency", "is_red_flag": True}
    assert audit.old_values == old
    assert (audit.new_values["allow_lower"], audit.new_values["triage_priority_rule"]) == (True, "Routine")


@pytest.mark.parametrize("body", [{"allow_lower": "có"}, {"lower": True}])
def test_assessment_body_validated(client, kb, checked_in, body):
    nurse, vid = checked_in
    assert client.post(f"/api/v1/visits/{vid}/assessment", headers=nurse, json=body).status_code == 422


def test_allow_lower_only_for_who_may_assess(client, kb, examining, doctor2, login):
    doctor, vid = examining
    other = client.post(f"/api/v1/visits/{vid}/assessment", headers=doctor2, json={"allow_lower": True})
    assert other.status_code == 409 and other.json()["error"]["code"] == "NOT_YOUR_VISIT"
    url, body = f"/api/v1/visits/{vid}/assessment", {"allow_lower": True}
    assert client.post(url, headers=login("admin"), json=body).status_code == 403
    assert client.post(url, headers=doctor, json=body).status_code == 202


def test_kept_red_flag_audit_and_get_assessment_show_visit_state(client, kb, checked_in, logs):
    nurse, vid = checked_in
    _patch(client, nurse, vid, spo2_pct=70)
    _patch(client, nurse, vid, spo2_pct=97)
    audit = [row for row in logs(action="AI_ASSESSMENT", entity="visit") if str(row.entity_id) == vid][-1]
    assert audit.new_values["error_detail"] == "RED_FLAG_KEPT" and audit.new_values["is_red_flag"] is True
    got = client.get(f"/api/v1/visits/{vid}/assessment", headers=nurse).json()
    assert got["priority"] == {"rule": "Emergency", "final": "Emergency", "raised_by_ai": False}
    assert [(a["rule_type"], a["reason_text"]) for a in got["alerts"]] == [("RED_FLAG", "SpO2 thấp")]


def test_new_red_flag_replaces_kept_one(client, kb, checked_in):
    nurse, vid = checked_in
    _patch(client, nurse, vid, spo2_pct=70)
    first = _visit_row(vid).red_flag_rule_id
    body = _patch(client, nurse, vid, spo2_pct=97, systolic_bp_mmhg=80, diastolic_bp_mmhg=50).json()
    assert body["red_flag_reason"] == "Tụt huyết áp" and _visit_row(vid).red_flag_rule_id != first


def test_ai_raise_then_priority_floor_clears_raised_flag(client, kb, checked_in, owner_engine):
    nurse, vid = checked_in
    with owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE visit SET triage_priority = 'HighPriority', priority_raised_by_ai = true WHERE visit_id = :v"),
            {"v": uuid.UUID(vid)},
        )
    _patch(client, nurse, vid, temperature_c=39.5)
    row = _visit_row(vid)
    assert (row.triage_priority_rule, row.triage_priority, row.priority_raised_by_ai) == (
        "HighPriority",
        "HighPriority",
        False,
    )


def test_nurse_after_exam_start_and_physician_before_exam_locked(client, kb, examining, checked_in, login):
    _, examining_vid = examining
    nurse, checked_vid = checked_in
    r = _patch(client, nurse, examining_vid, spo2_pct=85)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_LOCKED"
    r = _patch(client, login("bs"), checked_vid, spo2_pct=85)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_LOCKED"


def test_latest_run_follows_lock_order_not_transaction_start(client, kb, checked_in, users):
    """Transaction bắt đầu trước nhưng ghi sau vẫn là lần mới nhất (queued_at lấy sau khi giữ khóa)."""
    nurse, vid = checked_in
    with SessionLocal() as late:
        late.execute(text("SELECT 1"))  # transaction bắt đầu ở đây
        time.sleep(0.05)
        assert client.post(f"/api/v1/visits/{vid}/assessment", headers=nurse).status_code == 202
        nurse_user = late.get(type(users["yta"]), users["yta"].user_id)
        run = ai_queue_service.enqueue_assessment(late, uuid.UUID(vid), nurse_user, kb)
        late.commit()
        latest_id = run.assessment_id
    assert client.get(f"/api/v1/visits/{vid}/assessment", headers=nurse).json()["assessment_id"] == str(latest_id)


def test_stale_and_new_worker_results_never_lower(client, kb, checked_in):
    nurse, vid = checked_in
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
    _patch(client, nurse, vid, temperature_c=39.5)
    _patch(client, nurse, vid, temperature_c=37.0)
    latest = _runs(vid)[-1]

    for run in (old, latest):
        with SessionLocal() as db:
            if run is latest:
                db.execute(
                    text(
                        "UPDATE ai_assessment_log SET status = 'Running', started_at = now(), lease_until = now() + "
                        "interval '2 minutes', attempt_count = 1 WHERE assessment_id = :a"
                    ),
                    {"a": run.assessment_id},
                )
            ai_queue_service.write_result(
                db,
                run.assessment_id,
                {
                    "ai_status": "Completed",
                    "mode": "Full",
                    "priority_rule": "Routine",
                    "priority_final": "Routine",
                    "is_red_flag": False,
                    "rule_hits": [],
                    "candidates": [],
                },
                reader=kb,
                model_name="m",
                prompt_version="p",
                latency_phase1_ms=1,
                latency_llm_ms=1,
                latency_total_ms=2,
            )
            db.commit()
    body = client.get(f"/api/v1/visits/{vid}", headers=nurse).json()
    assert (body["triage_priority"], body["ai_status"]) == ("HighPriority", "Ready")
    row = _visit_row(vid)
    assert (row.triage_priority_rule, row.priority_raised_by_ai) == ("HighPriority", False)


def _complete(run_id, reader, final_priority: str) -> None:
    with SessionLocal() as db:
        db.execute(
            text(
                "UPDATE ai_assessment_log SET status = 'Running', started_at = now(), lease_until = now() + "
                "interval '2 minutes', attempt_count = 1 WHERE assessment_id = :a"
            ),
            {"a": run_id},
        )
        ai_queue_service.write_result(
            db,
            run_id,
            {
                "ai_status": "Completed",
                "mode": "Full",
                "priority_rule": "Routine",
                "priority_final": final_priority,
                "is_red_flag": False,
                "rule_hits": [],
                "candidates": [],
            },
            reader=reader,
            model_name="m",
            prompt_version="p",
            latency_phase1_ms=1,
            latency_llm_ms=1,
            latency_total_ms=2,
        )
        db.commit()


@pytest.mark.parametrize(
    "ai_final, expected", [("Routine", ("Routine", False)), ("HighPriority", ("HighPriority", True))]
)
def test_worker_after_deliberate_lowering_floors_at_fresh_values(client, kb, checked_in, ai_final, expected):
    nurse, vid = checked_in
    _patch(client, nurse, vid, temperature_c=39.5)
    _patch(client, nurse, vid, temperature_c=37.0)
    client.post(f"/api/v1/visits/{vid}/assessment", headers=nurse, json={"allow_lower": True})
    _complete(_runs(vid)[-1].assessment_id, kb, ai_final)
    row = _visit_row(vid)
    assert (row.triage_priority, row.priority_raised_by_ai) == expected and row.triage_priority_rule == "Routine"


# --- Khi nào không chạy, quyền, lỗi ----------------------------------------------------------------
def test_physician_of_visit_retriages_other_physician_locked(client, kb, examining, doctor2, login):
    doctor, vid = examining
    r = _patch(client, doctor, vid, spo2_pct=88, weight_kg=60.0)
    assert r.status_code == 200 and r.json()["triage_priority"] == "Emergency"
    other = _patch(client, doctor2, vid, spo2_pct=97)
    assert other.status_code == 409 and other.json()["error"]["code"] == "VISIT_LOCKED"


def test_admin_cannot_patch(client, login, kb):
    vid = _visit(client, login("yta"))
    assert _patch(client, login("admin"), vid, spo2_pct=80).status_code == 403
    assert len(_runs(vid)) == 1


def test_unsaved_intake_is_not_triaged(client, login, kb):
    nurse = login("yta")
    vid = _visit(client, nurse, save=False)
    body = _patch(client, nurse, vid, spo2_pct=80).json()
    assert body["triage_priority"] is None and body["is_red_flag"] is False
    assert _runs(vid) == []


def test_no_retriage_when_vitals_unchanged_or_other_fields(client, login, kb):
    nurse = login("yta")
    vid = _visit(client, nurse)
    assert _patch(client, nurse, vid, spo2_pct=98).status_code == 200
    r = client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"chief_complaint": "Khó thở, ho"})
    assert r.status_code == 200
    assert len(_runs(vid)) == 1


def test_invalid_vitals_rejected_without_retriage(client, kb, checked_in):
    nurse, vid = checked_in
    assert _patch(client, nurse, vid, spo2_pct=40).status_code == 422
    assert len(_runs(vid)) == 1


def test_node1_failure_rolls_back_whole_patch(client, kb, checked_in, monkeypatch):
    nurse, vid = checked_in

    def broken(*_args, **_kwargs):
        raise RuntimeError("Node 1 lỗi")

    monkeypatch.setattr(ai_queue_service, "run_node1", broken)
    with pytest.raises(RuntimeError):
        _patch(client, nurse, vid, spo2_pct=85)
    row = _visit_row(vid)
    assert row.vital_signs == {"spo2_pct": 98} and row.triage_priority == "Routine"
    assert len(_runs(vid)) == 1


def test_patch_with_retriage_under_two_seconds(client, kb, checked_in):
    nurse, vid = checked_in
    started = time.perf_counter()
    assert _patch(client, nurse, vid, spo2_pct=85).status_code == 200
    assert time.perf_counter() - started < 2
