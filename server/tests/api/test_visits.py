"""Lượt khám và hàng đợi (US10): tạo, sửa, check-in, nhận khám, trả lại, hủy, lượt cũ."""
import uuid

import pytest
from sqlalchemy import text

from app.core.database import SessionLocal, engine
from app.models import Visit


@pytest.fixture
def nurse(login):
    return login("yta")


@pytest.fixture
def doctor(login):
    return login("bs")


@pytest.fixture
def doctor2(client, users, login):
    from app.core.security import hash_password
    from app.models import User
    with SessionLocal() as db:
        if not db.query(User).filter_by(username="bs2").first():
            db.add(User(username="bs2", password_hash=hash_password("Matkhau123"), full_name="BS 2", role="Physician"))
            db.commit()
    return login("bs2")


@pytest.fixture
def patient_id(client, nurse):
    r = client.post("/api/v1/patients", headers=nurse, json={
        "full_name": f"Bệnh Nhân {uuid.uuid4().hex[:8]}", "date_of_birth": "1985-06-01", "gender": "Male"})
    return r.json()["patient_id"]


def _visit(client, nurse, patient_id, **over):
    return client.post("/api/v1/visits", headers=nurse, json={"patient_id": patient_id,
                                                              "chief_complaint": "Sốt, ho", **over})


def test_create_visit_with_vitals_and_warnings(client, nurse, patient_id, logs):
    r = _visit(client, nurse, patient_id, vital_signs={"temperature_c": 33.46, "spo2_pct": 96})
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["status"] == "Waiting" and v["queue_number"] >= 1 and v["vital_signs"] == {"temperature_c": 33.5, "spo2_pct": 96}
    assert [w["field"] for w in v["warnings"]] == ["vital_signs.temperature_c"]
    (row,) = logs(action="CREATE", entity="visit")
    assert row.new_values["vital_sign_keys"] == ["spo2_pct", "temperature_c"] and "33.5" not in str(row.new_values)


def test_create_visit_errors(client, nurse, doctor, patient_id):
    assert _visit(client, nurse, str(uuid.uuid4())).status_code == 404
    r = _visit(client, nurse, patient_id, vital_signs={"spo2_pct": 120})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["field"] == "vital_signs.spo2_pct"
    assert _visit(client, doctor, patient_id).status_code == 403
    assert _visit(client, nurse, patient_id).status_code == 201
    r = _visit(client, nurse, patient_id)                                   # đã có lượt đang mở
    assert r.status_code == 409 and r.json()["error"]["code"] == "PATIENT_HAS_OPEN_VISIT"


def test_queue_numbers_increase(client, nurse):
    numbers = []
    for _ in range(3):
        pid = client.post("/api/v1/patients", headers=nurse, json={
            "full_name": f"Q {uuid.uuid4().hex[:8]}", "date_of_birth": "2000-01-01", "gender": "Other"}).json()["patient_id"]
        numbers.append(_visit(client, nurse, pid).json()["queue_number"])
    assert numbers == sorted(numbers) and len(set(numbers)) == 3


def test_update_only_while_waiting(client, nurse, patient_id):
    vid = _visit(client, nurse, patient_id).json()["visit_id"]
    r = client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"vital_signs": {"heart_rate_bpm": 90}})
    assert r.status_code == 200 and r.json()["vital_signs"] == {"heart_rate_bpm": 90}
    client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse)
    r = client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"chief_complaint": "Khác"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_LOCKED"


def test_full_flow_to_examining_and_claim_race(client, nurse, doctor, doctor2, patient_id, logs, users):
    vid = _visit(client, nurse, patient_id).json()["visit_id"]
    assert client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor).status_code == 409   # chưa check-in
    r = client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse)
    assert r.status_code == 200 and r.json()["status"] == "CheckedIn" and r.json()["checked_in_at"]
    assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse).status_code == 409

    r = client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor)
    assert r.status_code == 200 and r.json()["physician_id"] == str(users["bs"].user_id)
    r2 = client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor2)     # bác sĩ thứ hai
    assert r2.status_code == 409 and r2.json()["error"]["code"] == "VISIT_TAKEN"

    transitions = [(x.old_values["status"], x.new_values["status"]) for x in logs(action="UPDATE", entity="visit")]
    assert transitions == [("Waiting", "CheckedIn"), ("CheckedIn", "Examining")]


def test_release_back_to_queue(client, nurse, doctor, doctor2, patient_id):
    vid = _visit(client, nurse, patient_id).json()["visit_id"]
    client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse)
    client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor)
    r = client.patch(f"/api/v1/visits/{vid}/release", headers=doctor2)
    assert r.status_code == 409 and r.json()["error"]["code"] == "NOT_YOUR_VISIT"
    r = client.patch(f"/api/v1/visits/{vid}/release", headers=doctor)
    assert r.status_code == 200 and r.json()["status"] == "CheckedIn" and r.json()["physician_id"] is None
    assert client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor2).status_code == 200


def test_cancel_rules(client, nurse, doctor, doctor2, patient_id, logs):
    vid = _visit(client, nurse, patient_id).json()["visit_id"]
    assert client.patch(f"/api/v1/visits/{vid}/cancel", headers=nurse, json={"reason": ""}).status_code == 422
    client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse)
    client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor)
    assert client.patch(f"/api/v1/visits/{vid}/cancel", headers=nurse,
                        json={"reason": "Bệnh nhân về"}).status_code == 409          # y tá: không khi Examining
    assert client.patch(f"/api/v1/visits/{vid}/cancel", headers=doctor2,
                        json={"reason": "Bệnh nhân về"}).status_code == 409          # không phải của mình
    r = client.patch(f"/api/v1/visits/{vid}/cancel", headers=doctor, json={"reason": "Bệnh nhân bỏ về"})
    assert r.status_code == 200 and r.json()["status"] == "Cancelled" and r.json()["finished_at"]
    last = logs(action="UPDATE", entity="visit")[-1]
    assert last.new_values == {"status": "Cancelled", "reason": "Bệnh nhân bỏ về"}


def test_nurse_cancel_waiting_then_new_visit_allowed(client, nurse, patient_id):
    vid = _visit(client, nurse, patient_id).json()["visit_id"]
    assert client.patch(f"/api/v1/visits/{vid}/cancel", headers=nurse, json={"reason": "Nhập nhầm"}).status_code == 200
    assert _visit(client, nurse, patient_id).status_code == 201


def test_queue_order_priority_then_fifo(client, nurse, doctor):
    pids = [client.post("/api/v1/patients", headers=nurse, json={
        "full_name": f"Thứ Tự {uuid.uuid4().hex[:8]}", "date_of_birth": "1990-01-01", "gender": "Male"}).json()["patient_id"]
        for _ in range(3)]
    vids = [_visit(client, nurse, p).json()["visit_id"] for p in pids]
    with engine.begin() as conn:      # giả lập Node 1 nâng mức lượt thứ ba (bước 5 / Sprint 3)
        conn.execute(text("UPDATE visit SET triage_priority='HighPriority' WHERE visit_id = :v"), {"v": vids[2]})
    queue = client.get("/api/v1/queue", headers=doctor).json()
    order = [q["visit_id"] for q in queue if q["visit_id"] in vids]
    assert order == [vids[2], vids[0], vids[1]]
    item = next(q for q in queue if q["visit_id"] == vids[0])
    assert item["patient_name"].startswith("Thứ Tự") and "vital_signs" not in item


def test_stale_visits_listed_and_bulk_cancelled(client, nurse, patient_id, users):
    with SessionLocal() as db:
        old = Visit(patient_id=patient_id, nurse_id=users["yta"].user_id, chief_complaint="Hôm qua")
        db.add(old)
        db.flush()
        db.execute(text("UPDATE visit SET queue_date = CURRENT_DATE - 1 WHERE visit_id = :v"), {"v": old.visit_id})
        db.commit()
        old_id = str(old.visit_id)
    stale = [v["visit_id"] for v in client.get("/api/v1/visits/stale", headers=nurse).json()]
    assert old_id in stale
    assert old_id not in [q["visit_id"] for q in client.get("/api/v1/queue", headers=nurse).json()]
    assert client.patch(f"/api/v1/visits/{old_id}/check-in", headers=nurse).status_code == 409   # không check-in lượt cũ
    today = _visit(client, nurse, patient_id)
    assert today.status_code == 409                                          # vẫn còn lượt mở (cũ)
    r = client.post("/api/v1/visits/stale/cancel", headers=nurse, json={"visit_ids": [old_id], "reason": "Hết ngày"})
    assert r.status_code == 200 and r.json() == [old_id]
    bad = client.post("/api/v1/visits/stale/cancel", headers=nurse,
                      json={"visit_ids": [_visit(client, nurse, patient_id).json()["visit_id"]], "reason": "x x x"})
    assert bad.status_code == 409 and bad.json()["error"]["code"] == "NOT_STALE"


def test_history_and_view_logging(client, nurse, doctor, patient_id, logs):
    vid = _visit(client, nurse, patient_id).json()["visit_id"]
    hist = client.get(f"/api/v1/patients/{patient_id}/visits", headers=doctor).json()
    assert hist["items"][0]["visit_id"] == vid
    assert client.get(f"/api/v1/visits/{vid}", headers=doctor).status_code == 200
    assert {str(v.entity_id) for v in logs(action="VIEW")} >= {patient_id, vid}


def test_admin_has_no_access(client, nurse, patient_id, login):
    admin = login("admin")
    vid = _visit(client, nurse, patient_id).json()["visit_id"]
    assert client.get("/api/v1/queue", headers=admin).status_code == 403
    assert client.get(f"/api/v1/visits/{vid}", headers=admin).status_code == 403
    assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=admin).status_code == 403
