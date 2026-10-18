"""Nhánh lỗi và nhánh phụ của chẩn đoán / đơn thuốc (bổ sung độ phủ cho prescription_service)."""
import uuid

RX = [{"dosage": "1 viên", "frequency": "2 lần/ngày", "duration_days": 3, "quantity": 6}]


def _rx(did):
    return {"items": [{**RX[0], "drug_id": did}]}


def _dx(client, doctor, vid, name, **over):
    r = client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={"diagnosis_name": name, **over})
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------- chẩn đoán
def test_diagnosis_on_missing_or_not_examining_visit(client, nurse, doctor, examining):
    assert client.post(f"/api/v1/visits/{uuid.uuid4()}/diagnoses", headers=doctor,
                       json={"diagnosis_name": "X"}).status_code == 404
    pid = client.post("/api/v1/patients", headers=nurse, json={
        "full_name": f"Chưa Khám {uuid.uuid4().hex[:6]}", "date_of_birth": "1990-01-01", "gender": "Male"}).json()["patient_id"]
    vid = client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": "Ho"}).json()["visit_id"]
    r = client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={"diagnosis_name": "X"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_NOT_EXAMINING"


def test_unknown_condition_code(client, doctor, examining):
    vid = examining()
    r = client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={"condition_code": "khong_co_benh_nay"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_CONDITION"


def test_update_diagnosis_primary_switch_and_rules(client, doctor, examining):
    vid = examining()
    a = _dx(client, doctor, vid, "Viêm họng")
    b = _dx(client, doctor, vid, "Viêm mũi", is_primary=False)
    assert a["is_primary"] and not b["is_primary"]

    # không bỏ cờ chính trực tiếp
    r = client.patch(f"/api/v1/diagnoses/{a['diagnosis_id']}", headers=doctor, json={"is_primary": False})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PRIMARY_REQUIRED"
    # trường bắt buộc không được gửi null
    r = client.patch(f"/api/v1/diagnoses/{a['diagnosis_id']}", headers=doctor, json={"diagnosis_name": None})
    assert r.status_code == 422
    # chuyển chính sang b: a tự hạ
    r = client.patch(f"/api/v1/diagnoses/{b['diagnosis_id']}", headers=doctor,
                     json={"is_primary": True, "clinical_notes": "Ưu tiên"})
    assert r.status_code == 200 and r.json()["is_primary"] and r.json()["clinical_notes"] == "Ưu tiên"
    listing = {d["diagnosis_id"]: d["is_primary"] for d in
               client.get(f"/api/v1/visits/{vid}/diagnoses", headers=doctor).json()}
    assert listing == {a["diagnosis_id"]: False, b["diagnosis_id"]: True}
    # gửi lại giá trị như cũ: không lỗi
    assert client.patch(f"/api/v1/diagnoses/{b['diagnosis_id']}", headers=doctor,
                        json={"is_primary": True}).status_code == 200


def test_retracted_cannot_become_primary_and_current_primary_kept(client, doctor, examining):
    vid = examining()
    a = _dx(client, doctor, vid, "Chính")
    b = _dx(client, doctor, vid, "Phụ", is_primary=False)
    assert client.post(f"/api/v1/diagnoses/{b['diagnosis_id']}/retract", headers=doctor).status_code == 200
    # rút lại lần hai: không lỗi, giữ nguyên
    again = client.post(f"/api/v1/diagnoses/{b['diagnosis_id']}/retract", headers=doctor)
    assert again.status_code == 200 and again.json()["confirmed_by_physician"] is False
    r = client.patch(f"/api/v1/diagnoses/{b['diagnosis_id']}", headers=doctor, json={"is_primary": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "DIAGNOSIS_RETRACTED"
    primary = [d for d in client.get(f"/api/v1/visits/{vid}/diagnoses", headers=doctor).json() if d["is_primary"]]
    assert [d["diagnosis_id"] for d in primary] == [a["diagnosis_id"]]


def test_missing_diagnosis(client, doctor):
    assert client.patch(f"/api/v1/diagnoses/{uuid.uuid4()}", headers=doctor,
                        json={"clinical_notes": "x"}).status_code == 404


# ---------------------------------------------------------------------------- đơn thuốc
def test_confirmed_prescription_cannot_be_replaced(client, doctor, drug, examining):
    did, _ = drug({30: 50})
    vid = examining()
    _dx(client, doctor, vid, "Viêm họng")
    assert client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json=_rx(did)).status_code == 200
    assert client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor).status_code == 200
    # sau khi xác nhận, lượt khám sang Prescribed: không xác nhận / sửa đơn lần nữa
    r = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_NOT_EXAMINING"
    r = client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json=_rx(did))
    assert r.status_code == 409


def test_confirm_and_discard_without_draft(client, doctor, examining):
    vid = examining()
    r = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
    assert r.status_code == 409 and r.json()["error"]["code"] == "NO_DRAFT"
    r = client.delete(f"/api/v1/visits/{vid}/prescription", headers=doctor)
    assert r.status_code == 409 and r.json()["error"]["code"] == "NO_DRAFT"


def test_confirm_rejects_drug_deactivated_after_draft(client, doctor, drug, examining, login):
    did, _ = drug({30: 50})
    vid = examining()
    _dx(client, doctor, vid, "Viêm họng")
    assert client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json=_rx(did)).status_code == 200
    r = client.patch(f"/api/v1/drugs/{did}", headers=login("admin"), json={"is_active": False})
    assert r.status_code == 200, r.text
    r = client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_DRUG"
    assert r.json()["error"]["details"] == [{"drug_id": did}]


def test_reopen_missing_and_paid(client, nurse, doctor, drug, prescribed):
    assert client.post(f"/api/v1/visits/{uuid.uuid4()}/prescription/reopen", headers=doctor,
                       json={"reason": "Sửa đơn"}).status_code == 404
    did, _ = drug({30: 50})
    vid, _ = prescribed([(did, 2)])
    pay = client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={})
    assert pay.status_code == 200 and pay.json()["visit_finished"] is False   # thu tiền trước, chưa cấp thuốc
    r = client.post(f"/api/v1/visits/{vid}/prescription/reopen", headers=doctor, json={"reason": "Sửa đơn"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ALREADY_PAID"
