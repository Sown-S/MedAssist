"""Khoa phòng, ca trực bác sĩ và khoa của lượt khám (ERD v1.9, Alembic 0005)."""
import uuid

import pytest

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import User


def _code():
    return "K" + uuid.uuid4().hex[:6].upper()


@pytest.fixture
def admin(login):
    return login("admin")


@pytest.fixture
def make_dept(client, admin):
    def _make(**over):
        body = {"code": _code(), "name": "Nội tổng quát", "room": "P." + uuid.uuid4().hex[:5], **over}
        r = client.post("/api/v1/admin/departments", headers=admin, json=body)
        assert r.status_code == 201, r.text
        return r.json()
    return _make


@pytest.fixture
def physicians(client, users, login):
    """Hai bác sĩ mới, chưa có lượt khám nào (bs, bs2 dùng chung với test khác)."""
    names = [f"bstruc_{uuid.uuid4().hex[:6]}" for _ in range(2)]
    with SessionLocal() as db:
        for n in names:
            db.add(User(username=n, full_name=f"BS {n[-6:]}", role="Physician", password_hash=hash_password("Matkhau123")))
        db.commit()
    headers = [login(n) for n in names]
    yield headers
    for h in headers:
        client.delete("/api/v1/duty", headers=h)


def test_department_crud_and_rules(client, admin, nurse, make_dept, logs):
    d = make_dept(name="  Nhi  ")
    assert d["name"] == "Nhi" and d["is_active"] is True and d["doctors"] == []
    dup = client.post("/api/v1/admin/departments", headers=admin, json={"code": d["code"], "name": "X"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "DEPARTMENT_CODE_TAKEN"
    room = client.post("/api/v1/admin/departments", headers=admin, json={"code": _code(), "name": "Y", "room": d["room"]})
    assert room.status_code == 409 and room.json()["error"]["code"] == "ROOM_TAKEN"
    assert client.post("/api/v1/admin/departments", headers=nurse, json={"code": _code(), "name": "Z"}).status_code == 403

    r = client.patch(f"/api/v1/admin/departments/{d['department_id']}", headers=admin, json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    codes = [x["code"] for x in client.get("/api/v1/departments", headers=nurse).json()]
    assert d["code"] not in codes
    all_codes = [x["code"] for x in client.get("/api/v1/departments", headers=nurse, params={"include_inactive": True}).json()]
    assert d["code"] in all_codes
    # Khoa đã ngừng thì phòng được dùng lại
    assert client.post("/api/v1/admin/departments", headers=admin,
                       json={"code": _code(), "name": "Y", "room": d["room"]}).status_code == 201
    assert [x.new_values for x in logs(action="UPDATE", entity="department")] == [{"is_active": False}]


def test_user_profile_fields(client, admin, make_dept):
    d = make_dept()
    code = "NV" + uuid.uuid4().hex[:6].upper()
    body = {"username": f"bs_{uuid.uuid4().hex[:6]}", "full_name": "Bác sĩ Khoa", "role": "Physician",
            "password": "Matkhau123", "staff_code": code.lower(), "license_no": "000123/DNA-CCHN",
            "department_id": d["department_id"]}
    r = client.post("/api/v1/admin/users", headers=admin, json=body)
    assert r.status_code == 201, r.text
    u = r.json()
    assert u["staff_code"] == code and u["license_no"] == "000123/DNA-CCHN"
    assert u["department_id"] == d["department_id"] and u["department_name"] == d["name"]
    assert u["created_by"] == "Test admin" and u["last_login_at"] is None and u["locked_until"] is None
    doctors = [x for x in client.get("/api/v1/departments", headers=admin).json() if x["code"] == d["code"]][0]["doctors"]
    assert [x["full_name"] for x in doctors] == ["Bác sĩ Khoa"]

    dup = client.post("/api/v1/admin/users", headers=admin, json={**body, "username": f"bs_{uuid.uuid4().hex[:6]}"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "STAFF_CODE_TAKEN"
    client.patch(f"/api/v1/admin/departments/{d['department_id']}", headers=admin, json={"is_active": False})
    bad = client.patch(f"/api/v1/admin/users/{u['user_id']}", headers=admin, json={"department_id": d["department_id"]})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "INVALID_DEPARTMENT"


def test_password_needs_letters_and_digits(client, admin):
    r = client.post("/api/v1/admin/users", headers=admin, json={
        "username": f"nv_{uuid.uuid4().hex[:6]}", "full_name": "A", "role": "Nurse", "password": "chikhongcoso"})
    assert r.status_code == 422 and "chữ và số" in r.json()["error"]["details"][0]["message"]
    policy = client.get("/api/v1/auth/password-policy").json()
    assert policy == {"min_length": 8, "require_letters_and_digits": True, "max_failed_attempts": 5,
                      "failed_window_minutes": 15, "lock_minutes": 5}


def test_last_login_lock_and_unlock(client, admin, login):
    name = f"nv_{uuid.uuid4().hex[:6]}"
    uid = client.post("/api/v1/admin/users", headers=admin, json={
        "username": name, "full_name": "Khóa thử", "role": "Nurse", "password": "Matkhau123"}).json()["user_id"]
    client.post("/api/v1/auth/login", json={"username": name, "password": "Matkhau123"})
    assert client.get(f"/api/v1/admin/users/{uid}", headers=admin).json()["last_login_at"] is not None
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"username": name, "password": "sai"})
    assert client.post("/api/v1/auth/login", json={"username": name, "password": "Matkhau123"}).status_code == 429
    assert client.get(f"/api/v1/admin/users/{uid}", headers=admin).json()["locked_until"] is not None

    r = client.post(f"/api/v1/admin/users/{uid}/unlock", headers=admin)
    assert r.status_code == 200 and r.json()["locked_until"] is None
    assert client.post("/api/v1/auth/login", json={"username": name, "password": "Matkhau123"}).status_code == 200


def test_duty_flow_and_visit_department(client, admin, nurse, physicians, make_dept, logs):
    doctor, doctor2 = physicians
    d1, d2 = make_dept(name="Nội"), make_dept(name="Nhi")
    r = client.post("/api/v1/duty/start", headers=doctor, json={"department_id": d1["department_id"]})
    assert r.status_code == 200 and r.json()["status"] == "on" and r.json()["room"] == d1["room"]
    taken = client.post("/api/v1/duty/start", headers=doctor2, json={"department_id": d1["department_id"]})
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "ROOM_TAKEN"
    assert client.post("/api/v1/duty/start", headers=nurse, json={"department_id": d2["department_id"]}).status_code == 403
    assert client.post("/api/v1/duty/start", headers=doctor2, json={}).json()["error"]["code"] == "DEPARTMENT_REQUIRED"

    assert client.patch("/api/v1/duty/break", headers=doctor, json={"on": True}).json()["status"] == "break"
    assert client.patch("/api/v1/duty/break", headers=doctor, json={"on": False}).json()["status"] == "on"

    pid = client.post("/api/v1/patients", headers=nurse, json={
        "full_name": f"Trực {uuid.uuid4().hex[:6]}", "date_of_birth": "1990-01-01", "gender": "Female"}).json()["patient_id"]
    vid = client.post("/api/v1/visits", headers=nurse, json={
        "patient_id": pid, "chief_complaint": "Sốt", "department_id": d2["department_id"]}).json()["visit_id"]
    client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse)
    moved = client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"department_id": d1["department_id"]})
    assert moved.status_code == 200 and moved.json()["department_id"] == d1["department_id"]
    assert client.patch(f"/api/v1/visits/{vid}", headers=nurse, json={"chief_complaint": "Ho"}).status_code == 409
    item = [x for x in client.get("/api/v1/queue", headers=nurse).json() if x["visit_id"] == vid][0]
    assert item["department_name"] == "Nội" and item["room"] == d1["room"]

    client.post("/api/v1/duty/start", headers=doctor, json={"department_id": d2["department_id"]})
    assert client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doctor).json()["department_id"] == d2["department_id"]
    mine = [x for x in client.get("/api/v1/duty", headers=nurse).json() if x["department_id"] == d2["department_id"]][0]
    assert mine["status"] == "examining" and mine["examining_visit_id"] == vid
    # Đổi phòng thì ca cũ đóng, phòng cũ trống cho bác sĩ khác
    assert client.post("/api/v1/duty/start", headers=doctor2, json={"department_id": d1["department_id"]}).status_code == 200

    off = client.patch(f"/api/v1/admin/departments/{d2['department_id']}", headers=admin, json={"is_active": False})
    assert off.status_code == 409 and off.json()["error"]["code"] == "DEPARTMENT_ON_DUTY"
    assert client.delete("/api/v1/duty", headers=doctor).status_code == 204
    assert client.patch("/api/v1/duty/break", headers=doctor, json={"on": True}).json()["error"]["code"] == "NOT_ON_DUTY"
    client.patch(f"/api/v1/visits/{vid}/release", headers=doctor)
    started = [x.new_values for x in logs(action="CREATE", entity="doctor_duty") if "department_code" in x.new_values]
    denied = [x.new_values for x in logs(action="CREATE", entity="doctor_duty") if x.new_values.get("result") == "denied"]
    assert len(started) == 3 and len(denied) == 1
