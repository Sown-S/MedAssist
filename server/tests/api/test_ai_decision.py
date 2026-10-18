"""Nối chẩn đoán với lần chạy AI (FR02): assessment_id, matches_top_suggestion, physician_decision
ghi cùng transaction, v_ai_decision_reconciliation luôn rỗng.

Worker chưa ghi nhật ký AI, nên test chèn sẵn dòng ai_assessment_log giả lập.
"""
import datetime
import uuid

import pytest
from sqlalchemy import select, text

from app.core.database import SessionLocal, engine
from app.models import AiAssessmentLog, Condition, KnowledgeRelease

CODES = ("ai_cum_mua", "ai_viem_hong_cap", "ai_viem_mui_di_ung")


@pytest.fixture(scope="module")
def conditions(users):
    """Ba bệnh Active trong một bản phát hành thử (commit; DB test được dựng lại mỗi phiên)."""
    with SessionLocal() as db:
        if db.scalar(select(Condition).where(Condition.condition_code == CODES[0])) is None:
            rel = KnowledgeRelease(label="TEST-AI-DECISION", status="Active", created_by=users["admin"].user_id,
                                   approved_by=users["bs"].user_id,
                                   approved_at=datetime.datetime.now(datetime.UTC))
            db.add(rel)
            db.flush()
            for code in CODES:
                db.add(Condition(condition_code=code, name_vi=code.replace("_", " "), status="Active",
                                 release_id=rel.release_id, created_by=users["admin"].user_id))
            db.commit()
    return CODES


@pytest.fixture
def ai_run(users):
    """ai_run(visit_id, top=[...], status=..., run_type=...) -> assessment_id của dòng nhật ký giả lập."""
    def _make(visit_id, top=None, status="Completed", run_type="Assessment", queued_offset_s=0):
        candidates = None if top is None else [{"condition_code": c, "label": "Reference Suggestion"} for c in top]
        with SessionLocal() as db:
            run = AiAssessmentLog(
                visit_id=uuid.UUID(visit_id), run_type=run_type, status=status,
                mode={"Completed": "Full", "Degraded": "RuleOnly", "Skipped": "RuleOnly"}.get(status),
                candidates=candidates,
                queued_at=datetime.datetime.now(datetime.UTC) + datetime.timedelta(seconds=queued_offset_s),
                started_at=datetime.datetime.now(datetime.UTC) if status == "Running" else None,
                lease_until=(datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=2)
                             if status == "Running" else None),
                completed_at=(datetime.datetime.now(datetime.UTC)
                              if status in ("Completed", "Degraded", "Skipped", "Failed") else None))
            db.add(run)
            db.commit()
            return str(run.assessment_id)
    return _make


def _log(assessment_id):
    with SessionLocal() as db:
        return db.get(AiAssessmentLog, uuid.UUID(assessment_id))


def _reconciliation_rows():
    with engine.connect() as conn:
        return conn.execute(text("SELECT * FROM v_ai_decision_reconciliation")).all()


def _dx(client, doctor, vid, **body):
    r = client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json=body)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------- tính khớp gợi ý
def test_accept_top_suggestion(client, doctor, examining, conditions, ai_run):
    vid = examining()
    aid = ai_run(vid, top=[CODES[0], CODES[1]])
    dx = _dx(client, doctor, vid, condition_code=CODES[0], assessment_id=aid)
    assert dx["assessment_id"] == aid and dx["matches_top_suggestion"] is True
    log = _log(aid)
    assert log.physician_decision == "AcceptedTop" and log.decided_by is not None and log.decided_at is not None
    assert _reconciliation_rows() == []


def test_choose_other_and_free_text(client, doctor, examining, conditions, ai_run):
    vid = examining()
    aid = ai_run(vid, top=[CODES[0], CODES[1]])
    dx = _dx(client, doctor, vid, condition_code=CODES[1], assessment_id=aid)
    assert dx["matches_top_suggestion"] is False and _log(aid).physician_decision == "ChoseOther"

    vid2 = examining()
    aid2 = ai_run(vid2, top=[CODES[0]])
    dx2 = _dx(client, doctor, vid2, diagnosis_name="Chẩn đoán tự gõ", assessment_id=aid2)
    assert dx2["matches_top_suggestion"] is False and _log(aid2).physician_decision == "ChoseOther"
    assert _reconciliation_rows() == []


@pytest.mark.parametrize("top, status", [([], "Completed"), (None, "Skipped")])
def test_no_suggestion(client, doctor, examining, conditions, ai_run, top, status):
    """Danh sách gợi ý rỗng, hoặc ca cờ đỏ dừng ở Node 1 (Skipped, không có gợi ý)."""
    vid = examining()
    aid = ai_run(vid, top=top, status=status)
    dx = _dx(client, doctor, vid, condition_code=CODES[0])
    assert dx["assessment_id"] == aid and dx["matches_top_suggestion"] is None
    assert _log(aid).physician_decision == "NoSuggestion"


def test_no_ai_run_at_all(client, doctor, examining, conditions):
    vid = examining()
    dx = _dx(client, doctor, vid, condition_code=CODES[0])
    assert dx["assessment_id"] is None and dx["matches_top_suggestion"] is None


# ---------------------------------------------------------------------------- chọn lần chạy
def test_server_picks_latest_visible_run(client, doctor, examining, conditions, ai_run):
    vid = examining()
    ai_run(vid, top=[CODES[1]], queued_offset_s=-60)                       # lần cũ
    newest = ai_run(vid, top=[CODES[0]], queued_offset_s=-10)              # lần mới nhất có gợi ý
    ai_run(vid, top=None, status="Queued")                                 # đang chờ, chưa có gì để xem
    dx = _dx(client, doctor, vid, condition_code=CODES[0])
    assert dx["assessment_id"] == newest and dx["matches_top_suggestion"] is True


def test_preliminary_suggestions_count(client, doctor, examining, conditions, ai_run):
    """Bác sĩ xác nhận khi LLM chưa xong: so với gợi ý sơ bộ đang hiển thị (Running có candidates)."""
    vid = examining()
    aid = ai_run(vid, top=[CODES[2]], status="Running")
    dx = _dx(client, doctor, vid, condition_code=CODES[2])
    assert dx["assessment_id"] == aid and dx["matches_top_suggestion"] is True


def test_client_choice_wins_over_newer_run(client, doctor, examining, conditions, ai_run):
    """AI chạy lại giữa lúc bác sĩ xem: so với kết quả bác sĩ thực sự nhìn thấy."""
    vid = examining()
    seen = ai_run(vid, top=[CODES[0]], queued_offset_s=-30)
    ai_run(vid, top=[CODES[1]])
    dx = _dx(client, doctor, vid, condition_code=CODES[0], assessment_id=seen)
    assert dx["assessment_id"] == seen and dx["matches_top_suggestion"] is True


@pytest.mark.parametrize("case", ["other_visit", "extraction", "missing"])
def test_assessment_must_belong_to_visit(client, doctor, examining, conditions, ai_run, case):
    vid = examining()
    if case == "other_visit":
        aid = ai_run(examining(), top=[CODES[0]])
    elif case == "extraction":
        aid = ai_run(vid, top=None, run_type="Extraction")
    else:
        aid = str(uuid.uuid4())
    r = client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor,
                    json={"condition_code": CODES[0], "assessment_id": aid})
    assert r.status_code == 422 and r.json()["error"]["code"] == "ASSESSMENT_NOT_FOR_VISIT"


# ---------------------------------------------------------------------------- đồng bộ khi chẩn đoán chính đổi
def test_decision_follows_primary_changes(client, doctor, examining, conditions, ai_run):
    vid = examining()
    aid = ai_run(vid, top=[CODES[0]])
    a = _dx(client, doctor, vid, condition_code=CODES[1], assessment_id=aid)          # chính, ChoseOther
    assert _log(aid).physician_decision == "ChoseOther"

    b = _dx(client, doctor, vid, condition_code=CODES[0], assessment_id=aid, is_primary=False)
    assert _log(aid).physician_decision == "ChoseOther"                                 # b chỉ là phụ

    r = client.patch(f"/api/v1/diagnoses/{b['diagnosis_id']}", headers=doctor, json={"is_primary": True})
    assert r.status_code == 200
    assert _log(aid).physician_decision == "AcceptedTop"                                # b thành chính
    assert _reconciliation_rows() == []

    client.post(f"/api/v1/diagnoses/{b['diagnosis_id']}/retract", headers=doctor)       # a lên lại chính
    assert _log(aid).physician_decision == "ChoseOther"
    assert _reconciliation_rows() == []

    client.post(f"/api/v1/diagnoses/{a['diagnosis_id']}/retract", headers=doctor)       # không còn chẩn đoán
    log = _log(aid)
    assert log.physician_decision is None and log.decided_by is None and log.decided_at is None
    assert _reconciliation_rows() == []


def test_old_run_cleared_when_primary_moves_to_new_run(client, doctor, examining, conditions, ai_run):
    vid = examining()
    old = ai_run(vid, top=[CODES[0]], queued_offset_s=-30)
    _dx(client, doctor, vid, condition_code=CODES[0], assessment_id=old)
    assert _log(old).physician_decision == "AcceptedTop"
    new = ai_run(vid, top=[CODES[1]])
    _dx(client, doctor, vid, condition_code=CODES[1], assessment_id=new)                 # chính mới, lần chạy mới
    assert _log(new).physician_decision == "AcceptedTop"
    assert _log(old).physician_decision is None
    assert _reconciliation_rows() == []


def test_audit_records_link_without_clinical_text(client, doctor, examining, conditions, ai_run, logs):
    vid = examining()
    aid = ai_run(vid, top=[CODES[0]])
    _dx(client, doctor, vid, condition_code=CODES[0], assessment_id=aid, clinical_notes="Ghi chú riêng")
    row = logs(action="CREATE", entity="diagnosis")[-1]
    assert row.new_values["assessment_id"] == aid and row.new_values["matches_top_suggestion"] is True
    assert "Ghi chú riêng" not in str(row.new_values)
