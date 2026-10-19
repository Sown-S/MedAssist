"""Lượt 6b: chẩn đoán, đơn nháp, xác nhận trừ kho FEFO, hóa đơn tự tạo, hoàn tất khám, mở lại đơn."""
import threading
import uuid

import pytest
from sqlalchemy import text

from app.core.database import engine


# Fixture nurse, doctor, doctor2, today, examining, drug: tests/api/conftest.py


def _dx(client, doctor, vid, **over):
    return client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor,
                       json={"diagnosis_name": "Viêm họng cấp", "icd10_code": "J02.9", **over})


def _item(drug_id, quantity=10, days=5, **over):
    return {"drug_id": drug_id, "dosage": "1 viên", "frequency": "2 lần/ngày", "duration_days": days,
            "quantity": quantity, **over}


def _remaining(client, nurse, batch_id):
    return client.get(f"/api/v1/inventory/batches/{batch_id}", headers=nurse).json()["remaining_quantity"]


# ---------------------------------------------------------------------------- chẩn đoán
def test_diagnosis_primary_rules(client, doctor, examining, logs):
    vid = examining()
    first = _dx(client, doctor, vid, is_primary=False).json()
    assert first["is_primary"] is True and first["confirmed_by_physician"] is True     # đầu tiên luôn chính
    second = _dx(client, doctor, vid, diagnosis_name="Sốt virus", is_primary=False).json()
    assert second["is_primary"] is False
    third = _dx(client, doctor, vid, diagnosis_name="Viêm amidan").json()               # chính mới
    rows = {d["diagnosis_id"]: d["is_primary"] for d in client.get(f"/api/v1/visits/{vid}/diagnoses", headers=doctor).json()}
    assert rows == {first["diagnosis_id"]: False, second["diagnosis_id"]: False, third["diagnosis_id"]: True}
    r = client.patch(f"/api/v1/diagnoses/{third['diagnosis_id']}", headers=doctor, json={"is_primary": False})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PRIMARY_REQUIRED"
    assert all("Viêm" not in str(x.new_values) for x in logs(entity="diagnosis"))      # nhật ký không có tên bệnh


def test_retract_primary_promotes_next(client, doctor, examining):
    vid = examining()
    a = _dx(client, doctor, vid).json()
    b = _dx(client, doctor, vid, diagnosis_name="B", is_primary=False).json()
    r = client.post(f"/api/v1/diagnoses/{a['diagnosis_id']}/retract", headers=doctor).json()
    assert r["confirmed_by_physician"] is False and r["is_primary"] is False
    rows = {d["diagnosis_id"]: d for d in client.get(f"/api/v1/visits/{vid}/diagnoses", headers=doctor).json()}
    assert rows[b["diagnosis_id"]]["is_primary"] is True


def test_diagnosis_validation_and_permissions(client, doctor, doctor2, nurse, examining):
    vid = examining()
    assert client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={}).json()["error"]["code"] == "VALIDATION_ERROR"
    r = _dx(client, doctor, vid, condition_code="viem_phoi_khong_co")
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_CONDITION"
    assert _dx(client, doctor, vid, condition_code="Sai Ma").status_code == 422
    assert _dx(client, doctor2, vid).json()["error"]["code"] == "NOT_YOUR_VISIT"
    assert _dx(client, nurse, vid).status_code == 403


# ---------------------------------------------------------------------------- đơn nháp
def test_draft_shows_context_and_stock(client, doctor, nurse, examining, drug):
    vid = examining(medical_history={"chronic_conditions": ["Tăng huyết áp"], "is_pregnant": True},
                    allergy_notes="Dị ứng penicillin", gender="Female")
    did, _ = drug({60: 30})
    r = client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(did, 10, days=5)]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "Draft" and body["items"][0]["usable_quantity"] == 30
    assert body["patient_context"]["chronic_conditions"] == ["Tăng huyết áp"]
    assert body["patient_context"]["is_pregnant"] is True
    assert body["patient_context"]["allergy_notes"] == "Dị ứng penicillin"
    assert "không kiểm tra tương tác" in body["patient_context"]["disclaimer"]
    assert client.get(f"/api/v1/visits/{vid}/prescription", headers=nurse).status_code == 200


def test_draft_replace_keeps_history_and_validation(client, doctor, examining, drug):
    vid = examining()
    d1, _ = drug({60: 30})
    d2, _ = drug({60: 30})
    first = client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(d1)]}).json()
    second = client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(d2)]}).json()
    assert first["prescription_id"] != second["prescription_id"] and [i["drug_id"] for i in second["items"]] == [d2]
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT status FROM prescription WHERE prescription_id=:p"),
                           {"p": first["prescription_id"]}) == "Cancelled"
    r = client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(d1), _item(d1)]})
    assert r.json()["error"]["code"] == "DUPLICATE_DRUG_IN_PRESCRIPTION"
    r = client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(str(uuid.uuid4()))]})
    assert r.json()["error"]["code"] == "INVALID_DRUG"
    assert client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": []}).status_code == 422
    assert client.delete(f"/api/v1/visits/{vid}/prescription", headers=doctor).status_code == 204
    assert client.get(f"/api/v1/visits/{vid}/prescription", headers=doctor).json()["status"] is None


# ---------------------------------------------------------------------------- xác nhận
def test_confirm_requires_diagnosis_and_touches_no_stock(client, doctor, nurse, examining, drug):
    vid = examining()
    did, b = drug({60: 30})
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(did, 10)]})
    r = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
    assert r.status_code == 409 and r.json()["error"]["code"] == "DIAGNOSIS_REQUIRED"
    assert _remaining(client, nurse, b[60]) == 30


def test_confirm_fefo_across_batches_and_invoice(client, doctor, nurse, examining, drug, login):
    vid = examining()
    # lô 10 ngày: hết hạn trước khi dùng xong 30 ngày -> bỏ qua; lô 60 ngày dùng trước lô 200 ngày
    did, b = drug({10: 100, 60: 5, 200: 10}, price=2500)
    _dx(client, doctor, vid)
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(did, 12, days=30)]})
    r = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
    assert r.status_code == 200, r.text
    inv = r.json()
    assert [_remaining(client, nurse, b[d]) for d in (10, 60, 200)] == [100, 0, 3]

    assert inv["payment_status"] == "Pending" and inv["invoice_code"].startswith("HD-")
    assert inv["consultation_fee"] == 100000 and inv["drug_fee"] == 30000 and inv["total_amount"] == 130000
    lines = {i["item_type"]: i for i in inv["items"]}
    assert lines["Drug"]["quantity"] == 12 and lines["Drug"]["unit_price"] == 2500 and lines["Drug"]["subtotal"] == 30000
    assert client.get(f"/api/v1/visits/{vid}", headers=doctor).json()["status"] == "Prescribed"
    assert client.get(f"/api/v1/visits/{vid}/prescription", headers=nurse).json()["status"] == "Confirmed"
    assert client.get(f"/api/v1/visits/{vid}/invoice", headers=nurse).json()["invoice_id"] == inv["invoice_id"]
    assert client.get("/api/v1/inventory/reconciliation", headers=login("admin")).json() == []


def test_shortage_reasons_and_all_or_nothing(client, doctor, nurse, examining, drug):
    vid = examining()
    expiring, eb = drug({10: 100})            # đủ số lượng nhưng hết hạn trước liệu trình 30 ngày
    scarce, sb = drug({300: 5})               # còn hạn nhưng thiếu số lượng
    plenty, pb = drug({300: 50})
    _dx(client, doctor, vid)
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [
        _item(expiring, 20, days=30), _item(scarce, 10, days=5), _item(plenty, 10, days=5)]})
    r = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
    assert r.status_code == 409 and r.json()["error"]["code"] == "STOCK_SHORTAGE"
    reasons = {d["drug_id"]: d["reason"] for d in r.json()["error"]["details"]}
    assert reasons == {expiring: "EXPIRES_BEFORE_COURSE_END", scarce: "OUT_OF_STOCK"}
    assert [_remaining(client, nurse, x) for x in (eb[10], sb[300], pb[300])] == [100, 5, 50]   # không trừ gì
    assert client.get(f"/api/v1/visits/{vid}", headers=doctor).json()["status"] == "Examining"


def test_min_remaining_shelf_days_setting(client, doctor, examining, drug, login):
    vid = examining()
    did, _ = drug({40: 50})
    _dx(client, doctor, vid)
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(did, 10, days=30)]})
    client.put("/api/v1/admin/settings/inventory.min_remaining_shelf_days", headers=login("admin"), json={"value": 15})
    r = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
    assert r.json()["error"]["details"][0]["reason"] == "EXPIRES_BEFORE_COURSE_END"   # 40 <= 30 + 15
    client.put("/api/v1/admin/settings/inventory.min_remaining_shelf_days", headers=login("admin"), json={"value": 5})
    assert client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor).status_code == 200


def test_concurrent_confirms_do_not_oversell(client, doctor, nurse, examining, drug):
    did, b = drug({300: 10})
    visits = [examining(), examining()]
    for v in visits:
        _dx(client, doctor, v)
        client.put(f"/api/v1/visits/{v}/prescription", headers=doctor, json={"items": [_item(did, 8)]})
    results = []
    barrier = threading.Barrier(2)

    def go(v):
        barrier.wait()
        results.append(client.post(f"/api/v1/visits/{v}/prescription/confirm", headers=doctor).status_code)

    threads = [threading.Thread(target=go, args=(v,)) for v in visits]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == [200, 409]
    assert _remaining(client, nurse, b[300]) == 2


# ---------------------------------------------------------------------------- hoàn tất khám / mở lại
def test_complete_exam_without_prescription(client, doctor, examining, drug):
    vid = examining()
    assert client.post(f"/api/v1/visits/{vid}/complete-exam", headers=doctor).json()["error"]["code"] == "DIAGNOSIS_REQUIRED"
    _dx(client, doctor, vid)
    did, _ = drug({300: 5})
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(did, 1)]})
    assert client.post(f"/api/v1/visits/{vid}/complete-exam", headers=doctor).json()["error"]["code"] == "PRESCRIPTION_DRAFT_EXISTS"
    client.delete(f"/api/v1/visits/{vid}/prescription", headers=doctor)
    inv = client.post(f"/api/v1/visits/{vid}/complete-exam", headers=doctor).json()
    assert [i["item_type"] for i in inv["items"]] == ["Consultation"] and inv["total_amount"] == 100000
    assert client.get(f"/api/v1/visits/{vid}", headers=doctor).json()["status"] == "Prescribed"


def test_reopen_restores_stock_and_cancels_invoice(client, doctor, doctor2, nurse, examining, drug, login, logs):
    vid = examining()
    did, b = drug({100: 5, 300: 20})
    _dx(client, doctor, vid)
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(did, 12)]})
    inv1 = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor).json()
    assert [_remaining(client, nurse, b[d]) for d in (100, 300)] == [0, 13]

    assert client.post(f"/api/v1/visits/{vid}/prescription/reopen", headers=doctor2,
                       json={"reason": "Kê nhầm"}).json()["error"]["code"] == "CANNOT_REOPEN"
    r = client.post(f"/api/v1/visits/{vid}/prescription/reopen", headers=doctor, json={"reason": "Kê nhầm liều"})
    assert r.status_code == 204
    assert [_remaining(client, nurse, b[d]) for d in (100, 300)] == [5, 20]      # hoàn đúng lô
    assert client.get(f"/api/v1/visits/{vid}", headers=doctor).json()["status"] == "Examining"
    assert client.get(f"/api/v1/visits/{vid}/prescription", headers=doctor).json()["status"] is None
    assert client.get(f"/api/v1/visits/{vid}/invoice", headers=nurse).status_code == 404

    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(did, 3)]})
    inv2 = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor).json()
    assert inv2["invoice_code"] != inv1["invoice_code"] and inv2["drug_fee"] == 6000
    assert client.get("/api/v1/inventory/reconciliation", headers=login("admin")).json() == []
    moves = client.get(f"/api/v1/inventory/batches/{b[100]}/movements", headers=nurse).json()
    assert [m["movement_type"] for m in moves] == ["Deduct", "Restore", "Deduct"]


def test_reopen_blocked_after_dispensing(client, doctor, examining, drug):
    vid = examining()
    did, _ = drug({300: 20})
    _dx(client, doctor, vid)
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [_item(did, 2)]})
    client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
    with engine.begin() as conn:           # giả lập y tá đã cấp phát (API cấp phát ở lượt 6c)
        conn.execute(text("""UPDATE prescription_item SET dispense_status='Dispensed', dispensed_at=now()
                              WHERE prescription_id = (SELECT prescription_id FROM prescription
                                                       WHERE visit_id=:v AND status='Confirmed')"""), {"v": vid})
    r = client.post(f"/api/v1/visits/{vid}/prescription/reopen", headers=doctor, json={"reason": "Sửa đơn"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ALREADY_DISPENSED"


def test_nurse_cannot_prescribe(client, nurse, examining, drug):
    vid = examining()
    did, _ = drug({300: 5})
    assert client.put(f"/api/v1/visits/{vid}/prescription", headers=nurse, json={"items": [_item(did, 1)]}).status_code == 403
    assert client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=nurse).status_code == 403
