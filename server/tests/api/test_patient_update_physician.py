"""S8: bác sĩ đang khám cập nhật dị ứng, bệnh nền của bệnh nhân đó; thông tin hành chính do quầy giữ."""

import uuid

import pytest

CLINICAL = {"allergy_notes": "Dị ứng Penicillin", "medical_history": {"chronic_conditions": ["Tăng huyết áp"]}}


def _patient_of(client, nurse, vid) -> str:
    return client.get(f"/api/v1/visits/{vid}", headers=nurse).json()["patient_id"]


def _patch(client, headers, pid, body):
    return client.patch(f"/api/v1/patients/{pid}", headers=headers, json=body)


@pytest.mark.parametrize(
    "body",
    [
        {"allergy_notes": "Dị ứng Penicillin"},
        {"medical_history": {"chronic_conditions": ["Đái tháo đường type 2"], "notes": "Đang dùng Metformin"}},
        CLINICAL,
        {"allergy_notes": None},
    ],
)
def test_physician_of_examining_visit_updates_clinical_fields(client, doctor, nurse, examining, logs, body):
    vid = examining()
    pid = _patient_of(client, nurse, vid)
    r = _patch(client, doctor, pid, body)
    assert r.status_code == 200, r.text
    context = client.get(f"/api/v1/visits/{vid}/prescription", headers=doctor).json()["patient_context"]
    if "allergy_notes" in body:
        assert r.json()["allergy_notes"] == body["allergy_notes"] == context["allergy_notes"]
    if "medical_history" in body:
        assert context["chronic_conditions"] == body["medical_history"]["chronic_conditions"]
        assert context["medical_notes"] == body["medical_history"].get("notes")
    audits = [row for row in logs(action="UPDATE", entity="patient") if str(row.entity_id) == pid]
    if body != {"allergy_notes": None}:
        assert audits[-1].new_values == {"changed_fields": sorted(body)}  # không ghi giá trị lâm sàng


@pytest.mark.parametrize(
    "extra",
    [
        {"full_name": "Đổi tên"},
        {"date_of_birth": "1990-01-01"},
        {"gender": "Female"},
        {"id_number": "012345678901"},
        {"phone": "0912345678"},
        {"address": "Đà Nẵng"},
    ],
)
def test_physician_sending_administrative_field_rejected_whole_request(client, doctor, nurse, examining, extra):
    vid = examining()
    pid = _patient_of(client, nurse, vid)
    before = client.get(f"/api/v1/patients/{pid}", headers=nurse).json()
    r = _patch(client, doctor, pid, {**CLINICAL, **extra})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN_FIELDS"
    assert [d["field"] for d in r.json()["error"]["details"]] == list(extra)
    after = client.get(f"/api/v1/patients/{pid}", headers=nurse).json()
    assert after["allergy_notes"] == before["allergy_notes"] and after["medical_history"] == before["medical_history"]


def test_other_physician_forbidden(client, doctor2, nurse, examining):
    pid = _patient_of(client, nurse, examining())
    r = _patch(client, doctor2, pid, CLINICAL)
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_YOUR_PATIENT"


def test_physician_forbidden_when_visit_not_examining(client, doctor, nurse, examining, drug):
    vid = examining()
    pid = _patient_of(client, nurse, vid)
    dx = {"diagnosis_name": "Viêm họng cấp", "icd10_code": "J02.9"}
    assert client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json=dx).status_code == 201
    did, _ = drug({90: 50})
    item = {"drug_id": did, "dosage": "1 viên", "frequency": "2 lần/ngày", "duration_days": 3, "quantity": 6}
    assert client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [item]}).status_code == 200
    assert client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor).status_code == 200
    r = _patch(client, doctor, pid, CLINICAL)  # lượt đã Prescribed
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_YOUR_PATIENT"


def test_physician_forbidden_after_visit_finished(client, doctor, nurse, examining):
    vid = examining()
    pid = _patient_of(client, nurse, vid)
    assert (
        client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={"diagnosis_name": "Cảm"}).status_code
        == 201
    )
    assert client.post(f"/api/v1/visits/{vid}/complete-exam", headers=doctor).status_code == 200
    status = client.get(f"/api/v1/visits/{vid}", headers=nurse).json()["status"]
    assert status in ("Prescribed", "Finished")
    r = _patch(client, doctor, pid, CLINICAL)
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_YOUR_PATIENT"


def test_physician_forbidden_without_any_visit(client, doctor, nurse):
    pid = client.post(
        "/api/v1/patients",
        headers=nurse,
        json={"full_name": f"Không khám {uuid.uuid4().hex[:6]}", "date_of_birth": "1980-01-01", "gender": "Male"},
    ).json()["patient_id"]
    assert _patch(client, doctor, pid, CLINICAL).json()["error"]["code"] == "NOT_YOUR_PATIENT"


def test_physician_validation_still_422(client, doctor, nurse, examining):
    pid = _patient_of(client, nurse, examining())
    r = _patch(client, doctor, pid, {"allergy_notes": "x" * 2001})
    assert r.status_code == 422


def test_nurse_keeps_full_edit_rights(client, nurse, examining):
    pid = _patient_of(client, nurse, examining())
    body = {**CLINICAL, "phone": "0912345678", "address": "Hải Châu, Đà Nẵng", "full_name": "Tên Mới"}
    r = _patch(client, nurse, pid, body)
    assert r.status_code == 200
    assert (r.json()["phone"], r.json()["full_name"], r.json()["allergy_notes"]) == (
        "0912345678",
        "Tên Mới",
        "Dị ứng Penicillin",
    )


def test_admin_still_forbidden(client, login, nurse, examining):
    pid = _patient_of(client, nurse, examining())
    assert _patch(client, login("admin"), pid, CLINICAL).status_code == 403
