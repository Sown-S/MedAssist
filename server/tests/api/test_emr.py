"""EMR (US04): tra cứu nhanh, lịch sử khám (chẩn đoán + tóm tắt đơn), xem lại một lượt khám, audit."""
import uuid

import pytest

from app.services.emr_service import interpret_term
from app.exceptions import AppError


# ---------------------------------------------------------------------------- tiện ích
def _uniq_phone():
    return "09" + f"{uuid.uuid4().int % 10**8:08d}"


def _uniq_cccd():
    return f"0{uuid.uuid4().int % 10**11:011d}"


def _new_visit(client, nurse, pid, complaint="Ho"):
    r = client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": complaint})
    assert r.status_code == 201, r.text
    return r.json()["visit_id"]


def _cancel(client, nurse, vid):
    r = client.patch(f"/api/v1/visits/{vid}/cancel", headers=nurse, json={"reason": "Bệnh nhân về"})
    assert r.status_code == 200, r.text


def _pay(client, nurse, vid):
    r = client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={})
    assert r.status_code == 200 and r.json()["visit_finished"], r.text


@pytest.fixture
def patient(client, nurse):
    def _make(**over):
        body = {"full_name": f"Trần Văn Bình {uuid.uuid4().hex[:6]}", "date_of_birth": "1985-06-02",
                "gender": "Male", **over}
        r = client.post("/api/v1/patients", headers=nurse, json={**body, "confirm_duplicate": True})
        assert r.status_code == 201, r.text
        return r.json()
    return _make


# ---------------------------------------------------------------------------- hiểu ô tìm kiếm (unit)
@pytest.mark.parametrize("term, expected", [
    ("BN-3F2A9C1B", {"kind": "patient_code", "value": "3f2a9c1b"}),
    ("bn3f2a9c1b", {"kind": "patient_code", "value": "3f2a9c1b"}),
    ("3f2a9c1b", {"kind": "patient_code", "value": "3f2a9c1b"}),
    ("048090001234", {"kind": "id_number", "value": "048090001234"}),
    ("123456789", {"kind": "id_number", "value": "123456789"}),
    ("0905 123 456", {"kind": "phone", "value": "0905123456"}),
    ("+84905123456", {"kind": "phone", "value": "0905123456"}),
    ("1985", {"kind": "birth_year", "birth_year": 1985}),
    ("nguyen van a", {"kind": "name", "name": "nguyen van a"}),
    ("Nguyễn  Văn A 1985", {"kind": "name_birth_year", "name": "Nguyễn Văn A", "birth_year": 1985}),
])
def test_interpret_term(term, expected):
    assert interpret_term(term) == expected


@pytest.mark.parametrize("term", ["12345", "0123", "   "])
def test_interpret_term_rejects(term):
    with pytest.raises(AppError):
        interpret_term(term)


# ---------------------------------------------------------------------------- tra cứu nhanh (API)
def test_patient_code_returned_everywhere(client, nurse, patient):
    p = patient()
    assert p["patient_code"] == "BN-" + uuid.UUID(p["patient_id"]).hex[:8].upper()
    r = client.get(f"/api/v1/patients/{p['patient_id']}", headers=nurse)
    assert r.json()["patient_code"] == p["patient_code"]


@pytest.mark.parametrize("field", ["patient_code", "phone", "id_number"])
def test_lookup_exact_keys(client, nurse, patient, field):
    p = patient(phone=_uniq_phone(), id_number=_uniq_cccd())
    term = {"patient_code": p["patient_code"], "phone": p["phone"], "id_number": p["id_number"]}[field]
    r = client.get("/api/v1/patients/lookup", headers=nurse, params={"term": term})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["interpreted_as"]["kind"] == field
    assert [i["patient_id"] for i in body["items"]] == [p["patient_id"]]
    item = body["items"][0]
    assert item["id_number_last4"] == p["id_number"][-4:] and "id_number" not in item


def test_lookup_name_with_birth_year(client, nurse, patient):
    tag = uuid.uuid4().hex[:6]
    a = patient(full_name=f"Phạm Thị Hoa {tag}", date_of_birth="1990-01-01")
    patient(full_name=f"Phạm Thị Hoa {tag}", date_of_birth="1991-01-01")
    r = client.get("/api/v1/patients/lookup", headers=nurse, params={"term": f"pham thi hoa {tag} 1990"})
    body = r.json()
    assert body["interpreted_as"] == {"kind": "name_birth_year", "name": f"pham thi hoa {tag}", "birth_year": 1990}
    assert [i["patient_id"] for i in body["items"]] == [a["patient_id"]]


def test_lookup_recent_visit_first(client, nurse, patient):
    tag = uuid.uuid4().hex[:6]
    old = patient(full_name=f"Lê Minh {tag} A")
    recent = patient(full_name=f"Lê Minh {tag} B")
    _new_visit(client, nurse, recent["patient_id"], "Sốt")
    items = client.get("/api/v1/patients/lookup", headers=nurse, params={"term": f"le minh {tag}"}).json()["items"]
    assert [i["patient_id"] for i in items] == [recent["patient_id"], old["patient_id"]]
    assert items[0]["visit_count"] == 1 and items[0]["last_visit_at"] is not None
    assert items[1]["visit_count"] == 0 and items[1]["last_visit_at"] is None


def test_lookup_unrecognized_digits(client, nurse):
    r = client.get("/api/v1/patients/lookup", headers=nurse, params={"term": "12345"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "LOOKUP_UNRECOGNIZED"


def test_search_by_code_and_birth_year(client, nurse, patient):
    p = patient(date_of_birth="1972-09-09")
    r = client.get("/api/v1/patients", headers=nurse, params={"code": p["patient_code"], "birth_year": 1972})
    assert [i["patient_id"] for i in r.json()["items"]] == [p["patient_id"]]
    r = client.get("/api/v1/patients", headers=nurse, params={"code": p["patient_code"], "birth_year": 1973})
    assert r.json()["total"] == 0
    assert client.get("/api/v1/patients", headers=nurse, params={"code": "BN-XYZ"}).status_code == 422


def test_lookup_audit_hides_term(client, nurse, patient, logs):
    p = patient(phone=_uniq_phone())
    client.get("/api/v1/patients/lookup", headers=nurse, params={"term": p["phone"]})
    rows = logs(action="VIEW", entity="patient")
    assert rows and rows[-1].new_values["query_keys"] == ["term"]
    assert p["phone"] not in str(rows[-1].new_values)


def test_admin_cannot_lookup(client, login):
    r = client.get("/api/v1/patients/lookup", headers=login("admin"), params={"term": "1985"})
    assert r.status_code == 403


# ---------------------------------------------------------------------------- lịch sử khám
def test_history_shows_confirmed_diagnoses_and_prescription(client, nurse, doctor, drug, prescribed):
    did, _ = drug({30: 50}, price=1500)
    vid, _ = prescribed([(did, 10)])
    pid = client.get(f"/api/v1/visits/{vid}", headers=nurse).json()["patient_id"]

    r = client.get(f"/api/v1/patients/{pid}/history", headers=doctor)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["patient"]["patient_id"] == pid and body["patient"]["patient_code"].startswith("BN-")
    assert body["total"] == 1
    v = body["items"][0]
    assert v["visit_id"] == vid and v["status"] == "Prescribed" and v["physician_name"] == "Test bs"
    assert v["diagnoses"] == [{"diagnosis_name": "Viêm họng cấp", "icd10_code": None, "is_primary": True}]
    rx = v["prescription"]
    assert rx["status"] == "Confirmed" and rx["item_count"] == 1
    line = rx["items"][0]
    assert line["quantity"] == 10 and line["unit"] == "viên" and "500 mg" in line["drug_label"]
    assert line["dispense_status"] == "Pending"


def test_history_newest_first_and_hides_retracted_and_cancelled(client, nurse, doctor, examining):
    vid1 = examining()
    pid = client.get(f"/api/v1/visits/{vid1}", headers=nurse).json()["patient_id"]
    dx = client.post(f"/api/v1/visits/{vid1}/diagnoses", headers=doctor, json={"diagnosis_name": "Cảm cúm"}).json()
    client.post(f"/api/v1/diagnoses/{dx['diagnosis_id']}/retract", headers=doctor)
    client.post(f"/api/v1/visits/{vid1}/diagnoses", headers=doctor, json={"diagnosis_name": "Viêm mũi dị ứng"})
    assert client.post(f"/api/v1/visits/{vid1}/complete-exam", headers=doctor).status_code == 200
    _pay(client, nurse, vid1)

    vid2 = _new_visit(client, nurse, pid, "Đau bụng")
    _cancel(client, nurse, vid2)
    vid3 = _new_visit(client, nurse, pid, "Tái khám")

    body = client.get(f"/api/v1/patients/{pid}/history", headers=doctor).json()
    assert [i["visit_id"] for i in body["items"]] == [vid3, vid1]
    first = body["items"][1]
    assert [d["diagnosis_name"] for d in first["diagnoses"]] == ["Viêm mũi dị ứng"]
    assert first["prescription"] is None

    all_ = client.get(f"/api/v1/patients/{pid}/history", headers=doctor, params={"include_cancelled": True}).json()
    assert [i["visit_id"] for i in all_["items"]] == [vid3, vid2, vid1] and all_["total"] == 3


def test_history_pagination_and_404(client, doctor, examining, nurse):
    vid = examining()
    pid = client.get(f"/api/v1/visits/{vid}", headers=nurse).json()["patient_id"]
    client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={"diagnosis_name": "Ho khan"})
    assert client.post(f"/api/v1/visits/{vid}/complete-exam", headers=doctor).status_code == 200
    _pay(client, nurse, vid)
    _cancel(client, nurse, _new_visit(client, nurse, pid))
    _new_visit(client, nurse, pid)
    page = client.get(f"/api/v1/patients/{pid}/history", headers=doctor,
                      params={"limit": 2, "offset": 2, "include_cancelled": True}).json()
    assert page["total"] == 3 and len(page["items"]) == 1 and page["items"][0]["visit_id"] == vid
    assert client.get(f"/api/v1/patients/{uuid.uuid4()}/history", headers=doctor).status_code == 404


def test_history_draft_prescription_not_shown(client, doctor, drug, examining, nurse):
    did, _ = drug({30: 20})
    vid = examining()
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [
        {"drug_id": did, "dosage": "1 viên", "frequency": "2 lần/ngày", "duration_days": 3, "quantity": 6}]})
    pid = client.get(f"/api/v1/visits/{vid}", headers=nurse).json()["patient_id"]
    item = client.get(f"/api/v1/patients/{pid}/history", headers=doctor).json()["items"][0]
    assert item["prescription"] is None
    # nhưng xem chi tiết lượt đang khám thì thấy đơn nháp
    rec = client.get(f"/api/v1/visits/{vid}/record", headers=doctor).json()
    assert rec["prescription"]["status"] == "Draft"


def test_history_audit_view(client, doctor, examining, nurse, logs):
    vid = examining()
    pid = client.get(f"/api/v1/visits/{vid}", headers=nurse).json()["patient_id"]
    client.get(f"/api/v1/patients/{pid}/history", headers=doctor)
    rows = [r for r in logs(action="VIEW", entity="patient") if str(r.entity_id) == pid]
    assert rows and rows[-1].new_values["path"].endswith("/history")


# ---------------------------------------------------------------------------- xem lại một lượt khám
def test_visit_record_full(client, nurse, doctor, drug, prescribed):
    did, _ = drug({30: 50}, price=2000)
    vid, invoice = prescribed([(did, 4)])
    r = client.get(f"/api/v1/visits/{vid}/record", headers=nurse)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["visit"]["visit_id"] == vid and rec["visit"]["chief_complaint"] == "Ho"
    assert rec["nurse_name"] == "Test yta" and rec["physician_name"] == "Test bs"
    assert rec["patient"]["patient_code"].startswith("BN-")
    assert [d["diagnosis_name"] for d in rec["diagnoses"]] == ["Viêm họng cấp"]
    assert rec["prescription"]["status"] == "Confirmed"
    assert rec["prescription"]["items"][0]["quantity"] == 4
    assert rec["invoice"]["invoice_code"] == invoice["invoice_code"]
    assert rec["invoice"]["payment_status"] == "Pending"
    assert rec["invoice"]["total_amount"] == invoice["total_amount"]


def test_visit_record_includes_retracted_flag(client, doctor, examining):
    vid = examining()
    dx = client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={"diagnosis_name": "Sai"}).json()
    client.post(f"/api/v1/diagnoses/{dx['diagnosis_id']}/retract", headers=doctor)
    rec = client.get(f"/api/v1/visits/{vid}/record", headers=doctor).json()
    assert [(d["diagnosis_name"], d["confirmed_by_physician"]) for d in rec["diagnoses"]] == [("Sai", False)]


def test_visit_record_errors_and_roles(client, doctor, login):
    assert client.get(f"/api/v1/visits/{uuid.uuid4()}/record", headers=doctor).status_code == 404
    assert client.get(f"/api/v1/visits/{uuid.uuid4()}/record", headers=login("admin")).status_code == 403


def test_print_slip_has_patient_code(client, nurse, prescribed):
    vid, _ = prescribed([])
    slip = client.get(f"/api/v1/visits/{vid}/invoice/print", headers=nurse).json()
    assert slip["patient"]["patient_code"].startswith("BN-")
