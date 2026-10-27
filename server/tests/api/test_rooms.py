"""Phòng khám, phòng xét nghiệm và phòng của bác sĩ (ERD v1.9, Alembic 0006)."""
import uuid

import pytest

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import User


def _code():
    return uuid.uuid4().hex[:8].upper()


@pytest.fixture
def admin(login):
    return login("admin")


@pytest.fixture
def make_room(client, admin):
    def _make(**over):
        r = client.post("/api/v1/admin/rooms", headers=admin, json={"code": _code(), "name": "Phòng khám", **over})
        assert r.status_code == 201, r.text
        return r.json()
    return _make


@pytest.fixture
def physician(users, login):
    """Bác sĩ mới, không dùng chung phòng với test khác."""
    name = f"bsphong_{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        u = User(username=name, full_name=f"BS {name[-6:]}", role="Physician", password_hash=hash_password("Matkhau123"))
        db.add(u)
        db.commit()
        return u.user_id, login(name)


def test_seeded_rooms(client, nurse):
    rooms = {r["code"]: r for r in client.get("/api/v1/rooms", headers=nurse).json()}
    assert {c: rooms[c]["room_type"] for c in ("01", "02", "03", "04")} == {
        "01": "Exam", "02": "Exam", "03": "Exam", "04": "Lab"}


def test_room_crud(client, admin, nurse, make_room, logs):
    r = make_room(name="  Phòng khám 9  ", room_type="Lab")
    assert r["name"] == "Phòng khám 9" and r["room_type"] == "Lab" and r["physician"] is None
    dup = client.post("/api/v1/admin/rooms", headers=admin, json={"code": r["code"], "name": "X"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "ROOM_CODE_TAKEN"
    assert client.post("/api/v1/admin/rooms", headers=nurse, json={"code": _code(), "name": "Y"}).status_code == 403
    assert client.patch(f"/api/v1/admin/rooms/{r['room_id']}", headers=admin,
                        json={"room_type": "Exam"}).status_code == 422

    off = client.patch(f"/api/v1/admin/rooms/{r['room_id']}", headers=admin, json={"is_active": False})
    assert off.status_code == 200 and off.json()["is_active"] is False
    assert r["code"] not in [x["code"] for x in client.get("/api/v1/rooms", headers=nurse).json()]
    assert r["code"] in [x["code"] for x in client.get("/api/v1/rooms", headers=nurse,
                                                         params={"include_inactive": True}).json()]
    assert [x.new_values for x in logs(entity="room", action="UPDATE")] == [{"is_active": False}]


def test_assign_room_one_physician_each(client, admin, make_room, physician):
    room = make_room()
    uid, _ = physician
    r = client.patch(f"/api/v1/admin/users/{uid}", headers=admin, json={"room_id": room["room_id"]})
    assert r.status_code == 200 and r.json()["room_code"] == room["code"] and r.json()["room_name"] == "Phòng khám"
    listed = next(x for x in client.get("/api/v1/rooms", headers=admin).json() if x["room_id"] == room["room_id"])
    assert listed["physician"]["user_id"] == str(uid)

    other = client.post("/api/v1/admin/users", headers=admin, json={
        "username": f"bs_{uuid.uuid4().hex[:6]}", "full_name": "BS Khác", "role": "Physician",
        "password": "Matkhau123", "room_id": room["room_id"]})
    assert other.status_code == 409 and other.json()["error"]["code"] == "ROOM_TAKEN"

    busy = client.patch(f"/api/v1/admin/rooms/{room['room_id']}", headers=admin, json={"is_active": False})
    assert busy.status_code == 409 and busy.json()["error"]["code"] == "ROOM_IN_USE"

    # Khóa tài khoản thì phòng được gán cho bác sĩ khác; mở lại tài khoản cũ bị chặn vì trùng phòng
    assert client.patch(f"/api/v1/admin/users/{uid}", headers=admin, json={"is_active": False}).status_code == 200
    new = client.post("/api/v1/admin/users", headers=admin, json={
        "username": f"bs_{uuid.uuid4().hex[:6]}", "full_name": "BS Mới", "role": "Physician",
        "password": "Matkhau123", "room_id": room["room_id"]})
    assert new.status_code == 201, new.text
    back = client.patch(f"/api/v1/admin/users/{uid}", headers=admin, json={"is_active": True})
    assert back.status_code == 409 and back.json()["error"]["code"] == "ROOM_TAKEN"


def test_room_rules(client, admin, make_room, physician, nurse):
    uid, _ = physician
    lab = make_room(room_type="Lab")
    bad = client.patch(f"/api/v1/admin/users/{uid}", headers=admin, json={"room_id": lab["room_id"]})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "INVALID_ROOM"

    room = make_room()
    nurse_acc = client.post("/api/v1/admin/users", headers=admin, json={
        "username": f"yt_{uuid.uuid4().hex[:6]}", "full_name": "Y tá", "role": "Nurse",
        "password": "Matkhau123", "room_id": room["room_id"]})
    assert nurse_acc.status_code == 422 and nurse_acc.json()["error"]["code"] == "ROOM_PHYSICIAN_ONLY"

    assert client.patch(f"/api/v1/admin/users/{uid}", headers=admin, json={"room_id": room["room_id"]}).status_code == 200
    demote = client.patch(f"/api/v1/admin/users/{uid}", headers=admin, json={"role": "Nurse"})
    assert demote.status_code == 422 and demote.json()["error"]["code"] == "ROOM_PHYSICIAN_ONLY"
    ok = client.patch(f"/api/v1/admin/users/{uid}", headers=admin, json={"role": "Nurse", "room_id": None})
    assert ok.status_code == 200 and ok.json()["room_id"] is None


def test_queue_and_me_show_physician_room(client, admin, nurse, make_room, physician):
    room = make_room(name="Phòng khám 7")
    uid, doc = physician
    assert client.patch(f"/api/v1/admin/users/{uid}", headers=admin, json={"room_id": room["room_id"]}).status_code == 200
    me = client.get("/api/v1/auth/me", headers=doc).json()
    assert me["room_id"] == room["room_id"] and me["room_code"] == room["code"]

    pid = client.post("/api/v1/patients", headers=nurse, json={
        "full_name": f"Phòng {uuid.uuid4().hex[:6]}", "date_of_birth": "1990-01-01", "gender": "Female"}).json()["patient_id"]
    vid = client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": "Sốt"}).json()["visit_id"]
    assert client.post("/api/v1/visits", headers=nurse,
                       json={"patient_id": pid, "chief_complaint": "Sốt", "department_id": room["room_id"]}).status_code == 422
    client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse)
    row = next(x for x in client.get("/api/v1/queue", headers=nurse).json() if x["visit_id"] == vid)
    assert row["room"] is None
    assert client.patch(f"/api/v1/visits/{vid}/start-exam", headers=doc).status_code == 200
    row = next(x for x in client.get("/api/v1/queue", headers=nurse).json() if x["visit_id"] == vid)
    assert (row["room"], row["room_name"]) == (room["code"], "Phòng khám 7")
    client.patch(f"/api/v1/visits/{vid}/cancel", headers=doc, json={"reason": "Kết thúc test"})
