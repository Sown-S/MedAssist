"""Chuyển tuyến, đi xét nghiệm, mời bệnh nhân vào phòng (ERD v2.0)."""
import uuid

import pytest
from sqlalchemy import text

from app.core.database import SessionLocal, engine
from app.models import ReferralFacility

REFERRAL = {"facility_name": "Bệnh viện Đa khoa Quảng Ngãi", "reason": "Vượt khả năng chuyên môn",
            "transport": "Ambulance", "condition": "Mất ý thức"}


@pytest.fixture
def patient(client, nurse):
    def _make():
        return client.post("/api/v1/patients", headers=nurse, json={
            "full_name": f"Chuyển Tuyến {uuid.uuid4().hex[:8]}", "date_of_birth": "1970-02-02",
            "gender": "Female"}).json()["patient_id"]
    return _make


@pytest.fixture
def empty_queue(users):
    """Các test khác để lại lượt chờ trong ngày: dọn để call-next chọn đúng người."""
    with engine.begin() as conn:
        conn.execute(text("UPDATE visit SET status = 'Cancelled', finished_at = now() "
                          "WHERE status IN ('Waiting', 'CheckedIn')"))


@pytest.fixture
def facility(users):
    with SessionLocal() as db:
        f = ReferralFacility(kcb_code=uuid.uuid4().hex[:5], name=f"Bệnh viện Đa khoa tỉnh Quảng Ngãi {uuid.uuid4().hex[:4]}",
                             province="Quảng Ngãi", facility_type="Hospital", ownership="Public")
        db.add(f)
        db.commit()
        return str(f.facility_id), f.kcb_code


def _queue_item(client, headers, vid):
    return next((q for q in client.get("/api/v1/queue", headers=headers).json() if q["visit_id"] == vid), None)


# ---------------------------------------------------------------------------- chuyển tuyến
def test_physician_refers_examining_visit(client, nurse, doctor, doctor2, examining, drug, facility, logs):
    vid = examining()
    did, _ = drug({60: 20})
    client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [
        {"drug_id": did, "dosage": "1 viên", "frequency": "2 lần/ngày", "duration_days": 3, "quantity": 6}]})
    body = {**REFERRAL, "facility_id": facility[0]}
    assert client.patch(f"/api/v1/visits/{vid}/refer", headers=doctor2, json=body).json()["error"]["code"] == "NOT_YOUR_VISIT"
    r = client.patch(f"/api/v1/visits/{vid}/refer", headers=doctor, json=body)
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["status"] == "Finished" and v["outcome"] == "Referred" and v["finished_at"]
    assert v["referral"]["facility_id"] == facility[0] and v["referral"]["referred_by_role"] == "Physician"
    assert client.get(f"/api/v1/visits/{vid}/prescription", headers=doctor).json()["status"] is None
    assert _queue_item(client, nurse, vid) is None
    (row,) = [x for x in logs(action="UPDATE", entity="visit") if str(x.entity_id) == vid and
              x.new_values.get("outcome") == "Referred"]
    assert row.old_values == {"status": "Examining"}


def test_nurse_refers_waiting_visit_and_emergency_at_desk(client, nurse, doctor, patient):
    pid = patient()
    vid = client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": "Khó thở"}).json()["visit_id"]
    r = client.patch(f"/api/v1/visits/{vid}/refer", headers=nurse, json={**REFERRAL, "signs": "SpO2 85%"})
    assert r.status_code == 200 and r.json()["referral"]["signs"] == "SpO2 85%"
    assert r.json()["referral"]["referred_by_role"] == "Nurse"
    assert client.patch(f"/api/v1/visits/{vid}/refer", headers=nurse, json=REFERRAL).status_code == 409

    r = client.post("/api/v1/visits/emergency-referral", headers=nurse, json={
        "patient_id": pid, "chief_complaint": "Đau ngực dữ dội", "referral": REFERRAL})
    assert r.status_code == 201 and r.json()["outcome"] == "Referred"
    eid = r.json()["visit_id"]
    assert client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": "Tái khám"}).status_code == 201

    # Bác sĩ bổ sung giấy chuyển tuyến sau
    r = client.patch(f"/api/v1/visits/{eid}/referral", headers=doctor, json={"diagnosis": "Nhồi máu cơ tim cấp?"})
    ref = r.json()["referral"]
    assert ref["diagnosis"] == "Nhồi máu cơ tim cấp?" and ref["facility_name"] == REFERRAL["facility_name"]
    assert ref["amended_by_name"]
    assert client.patch(f"/api/v1/visits/{eid}/referral", headers=nurse, json={"diagnosis": "x"}).status_code == 403


def test_referral_validation_and_open_visit(client, nurse, patient):
    pid = patient()
    bad = client.patch(f"/api/v1/visits/{uuid.uuid4()}/refer", headers=nurse, json={"facility_name": "X"})
    assert bad.status_code == 422
    vid = client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": "Sốt"}).json()["visit_id"]
    r = client.patch(f"/api/v1/visits/{vid}/refer", headers=nurse, json={**REFERRAL, "facility_id": str(uuid.uuid4())})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["field"] == "facility_id"
    r = client.post("/api/v1/visits/emergency-referral", headers=nurse, json={
        "patient_id": pid, "chief_complaint": "Co giật", "referral": REFERRAL})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PATIENT_HAS_OPEN_VISIT"
    with engine.connect() as conn, pytest.raises(Exception):
        conn.execute(text("UPDATE visit SET outcome = 'Referred' WHERE visit_id = :v"), {"v": vid})


def test_facility_search(client, nurse, login, facility):
    hits = client.get("/api/v1/referral-facilities", headers=nurse, params={"q": "quang ngai"}).json()
    assert facility[0] in [h["facility_id"] for h in hits]
    assert client.get("/api/v1/referral-facilities", headers=nurse, params={"q": facility[1]}).json()[0]["kcb_code"] == facility[1]
    assert client.get("/api/v1/referral-facilities", headers=nurse, params={"q": "x"}).status_code == 422
    assert client.get("/api/v1/referral-facilities", headers=login("admin"), params={"q": "quang"}).status_code == 403


# ---------------------------------------------------------------------------- xét nghiệm
def test_lab_out_shows_in_queue_and_clears_on_release(client, nurse, doctor, doctor2, examining):
    vid = examining()
    assert client.patch(f"/api/v1/visits/{vid}/lab-out", headers=doctor2).status_code == 409
    assert client.patch(f"/api/v1/visits/{vid}/lab-out", headers=nurse).status_code == 403
    assert client.patch(f"/api/v1/visits/{vid}/lab-out", headers=doctor).json()["lab_out_at"]
    assert _queue_item(client, nurse, vid)["lab_out_at"]
    assert client.patch(f"/api/v1/visits/{vid}/lab-return", headers=doctor).json()["lab_out_at"] is None
    client.patch(f"/api/v1/visits/{vid}/lab-out", headers=doctor)
    r = client.patch(f"/api/v1/visits/{vid}/release", headers=doctor)
    assert r.status_code == 200 and r.json()["lab_out_at"] is None


# ---------------------------------------------------------------------------- mời vào phòng
def test_call_next_flow(client, nurse, doctor, doctor2, patient, users, empty_queue):
    a = client.post("/api/v1/visits", headers=nurse, json={"patient_id": patient(), "chief_complaint": "A"}).json()["visit_id"]
    b = client.post("/api/v1/visits", headers=nurse, json={"patient_id": patient(), "chief_complaint": "B"}).json()["visit_id"]

    r = client.post("/api/v1/queue/call-next", headers=doctor)
    assert r.status_code == 200 and r.json()["visit_id"] == a
    item = _queue_item(client, nurse, a)
    assert item["called_at"] and item["called_by"] == str(users["bs"].user_id) and item["called_by_name"] == users["bs"].full_name
    assert client.post("/api/v1/queue/call-next", headers=doctor).json()["error"]["code"] == "ACTIVE_CALL"

    assert client.post("/api/v1/queue/call-next", headers=doctor2).json()["visit_id"] == b
    assert client.post(f"/api/v1/visits/{a}/call", headers=doctor2).json()["error"]["code"] == "CALLED_BY_OTHER"
    first = _queue_item(client, nurse, a)["called_at"]
    assert client.post(f"/api/v1/visits/{a}/call", headers=doctor).json()["called_at"] >= first   # gọi lại

    assert client.delete(f"/api/v1/visits/{a}/call", headers=nurse).json()["called_at"] is None
    assert client.delete(f"/api/v1/visits/{a}/call", headers=nurse).status_code == 409
    assert client.post("/api/v1/queue/call-next", headers=doctor).json()["visit_id"] == a
    client.patch(f"/api/v1/visits/{a}/check-in", headers=nurse)
    assert client.patch(f"/api/v1/visits/{a}/start-exam", headers=doctor).status_code == 200
    assert client.post("/api/v1/queue/call-next", headers=doctor).json()["error"]["code"] == "QUEUE_EMPTY"
    assert client.post("/api/v1/queue/call-next", headers=nurse).status_code == 403
