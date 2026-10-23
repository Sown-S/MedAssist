"""Báo cáo tổng hợp, nhật ký AI cho Admin, trạng thái AI trong /health, lịch sử hóa đơn theo ngày."""
import datetime
import uuid

import pytest
from sqlalchemy import update

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AiAssessmentLog
from app.services import health_service

PAST = datetime.date(2020, 1, 15)


def _summary(client, headers, **params):
    r = client.get("/api/v1/reports/summary", headers=headers, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _run(visit_id, *, run_type="Assessment", status="Completed", decision=None, latency=None,
         queued_at=None, candidates=None):
    queued_at = queued_at or datetime.datetime.combine(PAST, datetime.time(9), datetime.UTC)
    finished = status in ("Completed", "Degraded", "Failed", "Skipped")
    mode = {"Completed": "Full", "Degraded": "RuleOnly"}.get(status) if run_type == "Assessment" else None
    with SessionLocal() as db:
        run = AiAssessmentLog(visit_id=uuid.UUID(visit_id), run_type=run_type, status=status, mode=mode,
                              candidates=candidates, input_features={"symptoms": ["bí mật"]},
                              llm_output_raw="đầu ra thô", physician_decision=decision,
                              latency_total_ms=latency, queued_at=queued_at,
                              completed_at=queued_at if finished else None)
        db.add(run)
        db.commit()
        return run.assessment_id


@pytest.fixture
def admin(login):
    return login("admin")


@pytest.fixture
def past_runs(examining):
    """Các lần chạy AI ngày 15/01/2020, tách khỏi dữ liệu các test khác (đều là hôm nay).
    Dời các lần chạy của lượt gọi fixture trước sang 2019 để số đếm không cộng dồn."""
    vid = examining()
    with SessionLocal() as db:
        db.execute(update(AiAssessmentLog).where(AiAssessmentLog.queued_at < datetime.datetime(2021, 1, 1,
                                                                                               tzinfo=datetime.UTC))
                   .values(queued_at=datetime.datetime(2019, 1, 1, tzinfo=datetime.UTC)))
        db.commit()
    _run(vid, decision="AcceptedTop", latency=1000, candidates=[{"condition_code": "c_a"}, {"condition_code": "c_b"}])
    _run(vid, decision="AcceptedTop", latency=3000)
    _run(vid, decision="ChoseOther", status="Degraded", latency=2000)
    _run(vid, decision="NoSuggestion", status="Failed")
    _run(vid, run_type="Extraction", candidates=[{"symptom_code": "s_ho"}])
    return vid


# ---------------------------------------------------------------------------- /reports/summary
def test_summary_admin_only(client, nurse, doctor):
    for h in (nurse, doctor):
        assert client.get("/api/v1/reports/summary", headers=h).status_code == 403


def test_summary_defaults_to_today(client, admin, today):
    s = _summary(client, admin)
    assert s["date_from"] == s["date_to"] == today.isoformat()
    assert set(s["visits"]["by_status"]) == {"Waiting", "CheckedIn", "Examining", "Prescribed", "Finished",
                                            "Cancelled"}


def test_summary_counts_paid_revenue_and_visits(client, admin, nurse, prescribed):
    before = _summary(client, admin)
    vid, _ = prescribed([])
    pending = _summary(client, admin)
    assert pending["revenue"]["invoices_paid"] == before["revenue"]["invoices_paid"]
    assert pending["visits"]["by_status"]["Prescribed"] == before["visits"]["by_status"]["Prescribed"] + 1
    assert client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={}).status_code == 200
    after = _summary(client, admin)
    rev, rev0 = after["revenue"], before["revenue"]
    assert rev["invoices_paid"] == rev0["invoices_paid"] + 1
    assert rev["total"] == rev0["total"] + 100000 and rev["consultation"] == rev0["consultation"] + 100000
    assert after["visits"]["by_status"]["Finished"] == before["visits"]["by_status"]["Finished"] + 1
    assert after["visits"]["total"] == before["visits"]["total"] + 1
    assert [d["date"] for d in rev["by_day"]] == [after["date_to"]]


def test_summary_ai_stats(client, admin, past_runs):
    ai = _summary(client, admin, date_from=PAST.isoformat(), date_to=PAST.isoformat())["ai"]
    assert ai["assessments"] == {"total": 4, "full": 2, "rule_only": 1, "failed": 1, "skipped": 0, "pending": 0,
                                 "avg_latency_ms": 2000}
    assert ai["decisions"] == {"accepted_top": 2, "chose_other": 1, "no_suggestion": 1, "acceptance_rate": 0.6667}
    assert ai["extractions"] == {"total": 1, "completed": 1, "failed": 0}


def test_summary_empty_range(client, admin):
    s = _summary(client, admin, date_from="2000-01-01", date_to="2000-01-31")
    assert s["visits"]["total"] == 0 and s["revenue"]["total"] == 0 and s["revenue"]["by_day"] == []
    assert s["ai"]["decisions"]["acceptance_rate"] is None and s["ai"]["assessments"]["avg_latency_ms"] is None


@pytest.mark.parametrize("params", [{"date_from": "2026-02-01", "date_to": "2026-01-01"},
                                    {"date_from": "2024-01-01", "date_to": "2025-06-01"}])
def test_summary_invalid_range(client, admin, params):
    r = client.get("/api/v1/reports/summary", headers=admin, params=params)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_DATE_RANGE"


# ---------------------------------------------------------------------------- /admin/ai-logs
def test_ai_logs_metadata_only(client, admin, past_runs):
    r = client.get("/api/v1/admin/ai-logs", headers=admin,
                   params={"date_from": PAST.isoformat(), "date_to": PAST.isoformat()})
    assert r.status_code == 200, r.text
    page = r.json()
    assert page["total"] == 5
    for item in page["items"]:
        assert not {"visit_id", "input_features", "llm_output_raw", "patient_name"} & set(item)
    assert "bí mật" not in r.text and "đầu ra thô" not in r.text
    codes = sorted(i["suggested_codes"] for i in page["items"] if i["suggested_codes"])
    assert codes == [["c_a", "c_b"], ["s_ho"]]


def test_ai_logs_filters_and_paging(client, admin, past_runs):
    base = {"date_from": PAST.isoformat(), "date_to": PAST.isoformat()}
    ext = client.get("/api/v1/admin/ai-logs", headers=admin, params={**base, "run_type": "Extraction"}).json()
    assert ext["total"] == 1 and ext["items"][0]["run_type"] == "Extraction"
    rule = client.get("/api/v1/admin/ai-logs", headers=admin, params={**base, "mode": "RuleOnly"}).json()
    assert [i["physician_decision"] for i in rule["items"]] == ["ChoseOther"]
    page = client.get("/api/v1/admin/ai-logs", headers=admin, params={**base, "limit": 2, "offset": 4}).json()
    assert page["total"] == 5 and len(page["items"]) == 1


def test_ai_logs_admin_only(client, nurse, doctor):
    for h in (nurse, doctor):
        assert client.get("/api/v1/admin/ai-logs", headers=h).status_code == 403


# ---------------------------------------------------------------------------- /health: AI
@pytest.fixture
def fresh_health():
    health_service.reset_cache()
    yield
    health_service.reset_cache()


@pytest.fixture
def no_stuck(monkeypatch):
    """Các test khác để lại việc Queued không có worker xử lý: bỏ qua kiểm tra hàng đợi."""
    monkeypatch.setattr(health_service, "_stuck_queue", lambda _db: False)


def test_health_ai_disabled(client, monkeypatch, fresh_health, no_stuck):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "none")
    assert client.get("/health").json()["ai"]["ok"] is False


def test_health_ai_ollama(client, monkeypatch, fresh_health, no_stuck):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "ollama")
    calls = []

    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"models": [{"name": settings.OLLAMA_MODEL}]}

    def _get(url, timeout):
        calls.append(url)
        return _Resp()

    monkeypatch.setattr(health_service.httpx, "get", _get)
    assert client.get("/health").json()["ai"] == {"ok": True, "detail": "Ollama sẵn sàng"}
    client.get("/health")
    assert len(calls) == 1 and calls[0].endswith("/api/tags")


def test_health_ai_ollama_down_still_200(client, monkeypatch, fresh_health, no_stuck):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "ollama")

    def _boom(*_a, **_k):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(health_service.httpx, "get", _boom)
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["ai"] == {"ok": False, "detail": "Không kết nối được Ollama"}
    assert "refused" not in r.text


def test_health_ai_stuck_queue(client, monkeypatch, fresh_health, examining):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "fake")
    old = datetime.datetime.now(datetime.UTC) - datetime.timedelta(seconds=settings.AI_ASSESSMENT_TIMEOUT_SECONDS + 60)
    aid = _run(examining(), status="Queued", queued_at=old)
    try:
        assert client.get("/health").json()["ai"] == {"ok": False, "detail": "Worker AI không xử lý hàng đợi"}
    finally:
        with SessionLocal() as db:
            db.execute(update(AiAssessmentLog).where(AiAssessmentLog.assessment_id == aid)
                       .values(status="Skipped", completed_at=old))
            db.commit()


# ---------------------------------------------------------------------------- /billing/invoices
def test_invoice_history_today(client, nurse, prescribed):
    vid, _ = prescribed([])
    assert client.patch(f"/api/v1/visits/{vid}/invoice", headers=nurse,
                        json={"consultation_fee": 150000}).status_code == 200
    assert client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={}).status_code == 200
    rows = [i for i in client.get("/api/v1/billing/invoices", headers=nurse).json() if i["visit_id"] == vid]
    assert len(rows) == 1 and rows[0]["payment_status"] == "Paid" and rows[0]["total_amount"] == 150000
    assert rows[0]["patient_name"].startswith("Kê Đơn")
    all_rows = client.get("/api/v1/billing/invoices", headers=nurse, params={"include_cancelled": True}).json()
    assert sorted(i["payment_status"] for i in all_rows if i["visit_id"] == vid) == ["Cancelled", "Paid"]


def test_invoice_history_other_day_and_roles(client, nurse, doctor, admin):
    assert client.get("/api/v1/billing/invoices", headers=nurse, params={"date": "2000-01-01"}).json() == []
    for h in (doctor, admin):
        assert client.get("/api/v1/billing/invoices", headers=h).status_code == 403
