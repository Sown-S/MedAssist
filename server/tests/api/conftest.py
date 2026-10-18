"""Fixture dùng chung cho test luồng khám (kê đơn, cấp phát, thu tiền)."""
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models import User


@pytest.fixture
def nurse(login):
    return login("yta")


@pytest.fixture
def doctor(login):
    return login("bs")


@pytest.fixture
def doctor2(users, login):
    with SessionLocal() as db:
        if not db.query(User).filter_by(username="bs2").first():
            db.add(User(username="bs2", password_hash=hash_password("Matkhau123"), full_name="BS 2", role="Physician"))
            db.commit()
    return login("bs2")


@pytest.fixture
def today(users):
    with engine.connect() as conn:
        return conn.scalar(text("SELECT CURRENT_DATE"))


@pytest.fixture
def billing_settings(client, login):
    """Phí khám 100.000 đ, không yêu cầu thêm ngày hạn dùng — để số liệu trong test cố định."""
    admin = login("admin")
    client.put("/api/v1/admin/settings/billing.default_consultation_fee", headers=admin, json={"value": 100000})
    client.put("/api/v1/admin/settings/inventory.min_remaining_shelf_days", headers=admin, json={"value": 0})


@pytest.fixture
def examining(client, nurse, doctor, billing_settings):
    """Tạo bệnh nhân + lượt khám, check-in, 'bs' nhận khám. Trả visit_id."""
    def _make(**patient_over):
        pid = client.post("/api/v1/patients", headers=nurse, json={
            "full_name": f"Kê Đơn {uuid.uuid4().hex[:8]}", "date_of_birth": "1980-01-01", "gender": "Male",
            **patient_over}).json()["patient_id"]
        vid = client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": "Ho"}).json()["visit_id"]
        assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse).status_code == 200
        assert client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor).status_code == 200
        return vid
    return _make


@pytest.fixture
def drug(client, nurse, today):
    """Tạo thuốc kèm các lô {hạn sau N ngày: số lượng}. Trả (drug_id, {N: batch_id})."""
    def _make(batches: dict[int, int], price=2000):
        tag = uuid.uuid4().hex[:6]
        did = client.post("/api/v1/drugs", headers=nurse, json={
            "generic_name": f"Thuốc {tag}", "trade_name": f"TM {tag}", "strength": "500 mg",
            "dosage_form": "viên nang", "unit": "viên", "sale_price": price}).json()["drug_id"]
        ids = {}
        for days, qty in batches.items():
            ids[days] = client.post("/api/v1/inventory/batches", headers=nurse, json={
                "drug_id": did, "batch_number": f"B{days}-{tag}", "expiry_date": (today + timedelta(days=days)).isoformat(),
                "quantity": qty, "import_price": 1000}).json()["batch_id"]
        return did, ids
    return _make


@pytest.fixture
def prescribed(client, doctor, examining):
    """Lượt khám đã xác nhận đơn: items = [(drug_id, quantity)]. Trả (visit_id, invoice)."""
    def _make(items: list[tuple[str, int]]):
        vid = examining()
        client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={"diagnosis_name": "Viêm họng cấp"})
        if items:
            client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [
                {"drug_id": d, "dosage": "1 viên", "frequency": "2 lần/ngày", "duration_days": 5, "quantity": q}
                for d, q in items]})
            r = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
        else:
            r = client.post(f"/api/v1/visits/{vid}/complete-exam", headers=doctor)
        assert r.status_code == 200, r.text
        return vid, r.json()
    return _make




# ---- Tri thức Active dùng cho test triệu chứng / worker AI -------------------------------------
WK_SYMPTOMS = {"wk_fever_high": "Sốt cao", "wk_cough_dry": "Ho khan", "wk_sore_throat": "Đau họng",
               "wk_joint_pain": "Đau khớp"}
WK_CONDITIONS = {
    "wk_cum_mua": ("Cúm mùa (thử)", "J11.1", [("wk_fever_high", "SUPPORTS", 0.85, True),
                                             ("wk_cough_dry", "SUPPORTS", 0.8, True),
                                             ("wk_sore_throat", "SUPPORTS", 0.6, False)]),
    "wk_viem_hong": ("Viêm họng cấp (thử)", "J02.9", [("wk_sore_throat", "SUPPORTS", 0.9, True),
                                                     ("wk_fever_high", "SUPPORTS", 0.5, False),
                                                     ("wk_joint_pain", "CONTRADICTS", 0.4, False)]),
}


@pytest.fixture(scope="session")
def wk_knowledge(users):
    """Bản phát hành Active nhỏ: 4 triệu chứng, 2 bệnh, quan hệ, 1 trích dẫn. Tạo một lần mỗi phiên test
    (DB test được Alembic dựng lại mỗi phiên). Không có luật cờ đỏ để không ảnh hưởng test khác."""
    import datetime as _dt
    from sqlalchemy import select as _select
    from app.models import (Condition, ConditionSymptom, GuidelineExcerpt, KnowledgeRelease, KnowledgeSource,
                            Symptom)
    admin, bs = users["admin"].user_id, users["bs"].user_id
    with SessionLocal() as db:
        if db.scalar(_select(Symptom).where(Symptom.symptom_code == "wk_fever_high")) is None:
            rel = KnowledgeRelease(label="TEST-WK", status="Active", created_by=admin, approved_by=bs,
                                   approved_at=_dt.datetime.now(_dt.UTC))
            src = KnowledgeSource(title="Hướng dẫn thử", organization="Bộ Y tế", edition="QĐ thử",
                                  created_by=admin)
            db.add_all([rel, src])
            db.flush()
            common = {"status": "Active", "release_id": rel.release_id, "created_by": admin}
            for code, name in WK_SYMPTOMS.items():
                db.add(Symptom(symptom_code=code, symptom_name=name, category="test", **common))
            for code, (name, icd, _) in WK_CONDITIONS.items():
                db.add(Condition(condition_code=code, name_vi=name, icd10_code=icd, disease_group="test", **common))
            db.flush()                                  # trigger tạo symptom_key / condition_key trước
            for code, (_, _, rels) in WK_CONDITIONS.items():
                for sym, pol, w, key in rels:
                    db.add(ConditionSymptom(condition_code=code, symptom_code=sym, polarity=pol, weight=w,
                                            is_key=key, source_id=src.source_id, **common))
            db.add(GuidelineExcerpt(excerpt_key="wk_cum_mua_chan_doan", condition_code="wk_cum_mua",
                                    title="Chẩn đoán cúm mùa", content="Sốt, ho, đau họng khởi phát đột ngột.",
                                    source_id=src.source_id, source_locator="Mục 2", **common))
            db.commit()
    return {"symptoms": WK_SYMPTOMS, "conditions": WK_CONDITIONS}
