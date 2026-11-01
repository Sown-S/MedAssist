"""scripts/seed_eval.py: tài khoản kiểm thử, lượt khám các ngày trước (dời ngày), hàng đợi hôm nay, chạy lại an toàn."""
import datetime
import json
import uuid

from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.models import AiAssessmentLog, Drug, Invoice, Patient, User, Visit
from app.services.knowledge_reader import DbKnowledgeReader
from scripts import seed_eval

CATEGORIES = ["typical"] * 12 + ["red_flag"] * 2 + ["priority_floor"] * 3 + ["ambiguous"] * 2


def _cases(tmp_path) -> tuple:
    tag = uuid.uuid4().hex[:6]
    rows = []
    for i, cat in enumerate(CATEGORIES):
        rows.append({
            "case_id": f"T-{i}", "category": cat, "condition_code": "wk_cum_mua" if i % 2 else "wk_viem_hong",
            "patient": {"full_name": f"Kiểm Thử {tag} {i}", "date_of_birth": "1985-03-0" + str(1 + i % 9),
                        "gender": "Female" if i % 2 else "Male", "address": None, "medical_history": None,
                        "allergy_notes": None},
            "visit": {"chief_complaint": "Sốt, ho, đau họng", "free_text_description": "Sốt hai ngày, ho khan.",
                      "vital_signs": {"temperature_c": 37.8, "heart_rate_bpm": 88, "spo2_pct": 98}},
            "symptoms": {"wk_fever_high": "PRESENT", "wk_cough_dry": "PRESENT", "wk_sore_throat": "UNKNOWN"},
        })
    path = tmp_path / "cases.jsonl"
    path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
    return path, tag


def _panadol(client, login, today):
    nurse = login("yta")
    with SessionLocal() as db:
        found = db.scalar(select(Drug.drug_id).where(Drug.trade_name == "Panadol"))
    if found is None:
        found = client.post("/api/v1/drugs", headers=nurse, json={
            "generic_name": "Paracetamol", "trade_name": "Panadol", "strength": "500 mg", "dosage_form": "viên nén",
            "unit": "viên", "sale_price": 1500}).json()["drug_id"]
    client.post("/api/v1/inventory/batches", headers=nurse, json={
        "drug_id": str(found), "batch_number": f"P-{uuid.uuid4().hex[:6]}",
        "expiry_date": (today + datetime.timedelta(days=400)).isoformat(), "quantity": 2000, "import_price": 900})


def test_history_and_today(client, login, users, wk_knowledge, billing_settings, today, tmp_path, monkeypatch):
    _panadol(client, login, today)
    path, tag = _cases(tmp_path)
    monkeypatch.setattr(seed_eval, "HISTORY_DAYS", 5)
    monkeypatch.setattr(seed_eval, "HISTORY_PER_DAY", 3)
    reader = DbKnowledgeReader()
    reader.refresh()
    with SessionLocal() as db:
        accounts = seed_eval.seed_accounts(db, "Kiemthu@2026")
        now = db.scalar(select(func.now()))
        flow = seed_eval.Flow(db, {u: db.get(User, accounts[u].user_id) for u in accounts}, reader)
        cases = seed_eval.load_cases(path)
        assert seed_eval.seed_history(flow, cases, today, now) == 5 * 3 + seed_eval.RETURNING
        assert seed_eval.seed_today(flow, cases) == 15

    with SessionLocal() as db:
        ours = select(Patient.patient_id).where(Patient.full_name.like(f"Kiểm Thử {tag}%"))
        old = db.scalars(select(Visit).where(Visit.patient_id.in_(ours), Visit.queue_date < today)).all()
        new = db.scalars(select(Visit).where(Visit.patient_id.in_(ours), Visit.queue_date == today)).all()
        assert len(old) == 19 and min(v.queue_date for v in old) == today - datetime.timedelta(days=5 + 4 + 3)
        assert {v.status for v in old} == {"Finished", "Cancelled"}
        assert sum(v.outcome == "Referred" for v in old) == 1
        assert all(v.visit_date.date() == v.queue_date for v in old)
        assert all(v.ai_status == "Degraded" for v in old if v.status == "Finished")
        codes = db.scalars(select(Invoice.invoice_code).where(Invoice.visit_id.in_([v.visit_id for v in old]))).all()
        assert codes and all(c[3:11] != today.strftime("%Y%m%d") for c in codes)
        assert {v.status for v in new} == {"Finished", "Prescribed", "Examining", "CheckedIn", "Waiting"}
        handled = [v.visit_id for v in new if v.status in ("Finished", "Prescribed", "Examining")]
        assert db.scalar(select(func.count()).select_from(AiAssessmentLog).where(
            AiAssessmentLog.visit_id.in_(handled), AiAssessmentLog.status == "Queued")) == 0
        assert db.scalar(select(User.must_change_password).where(User.username == "letan01")) is False
    assert client.post("/api/v1/auth/login", json={"username": "letan01", "password": "Kiemthu@2026"}).status_code == 200


def test_main_is_idempotent(users, wk_knowledge, tmp_path, monkeypatch, capsys):
    path, _ = _cases(tmp_path)
    calls = []
    monkeypatch.setattr(seed_eval, "seed_catalogs", lambda *a: calls.append(a))
    monkeypatch.setattr(seed_eval, "seed_history", lambda *a: 0)
    monkeypatch.setattr(seed_eval, "seed_today", lambda *a: 0)
    monkeypatch.setenv("EVAL_PASSWORD", "Kiemthu@2026")
    assert seed_eval.main(["--cases", str(path), "--skip-knowledge"]) == 0
    assert seed_eval.main(["--cases", str(path)]) == 0
    assert len(calls) <= 1
    assert "Lượt khám cũ mới tạo: 0" in capsys.readouterr().out


def test_stock_alerts_and_run_helper(users, today):
    with SessionLocal() as db:
        seed_eval.seed_stock_alerts(db, today)
        seed_eval.seed_stock_alerts(db, today)
    failed = []

    def boom():
        failed.append(1)
        return 2
    boom.__module__ = "scripts.fake"
    try:
        seed_eval._run(boom)
    except SystemExit as e:
        assert "scripts.fake" in str(e)
    assert failed == [1]
