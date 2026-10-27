"""Hồ sơ nhân viên, chính sách mật khẩu, khóa và mở khóa tài khoản (ERD v1.9, Alembic 0005)."""
import uuid

import pytest


@pytest.fixture
def admin(login):
    return login("admin")


def test_user_profile_fields(client, admin):
    code = "NV" + uuid.uuid4().hex[:6].upper()
    body = {"username": f"bs_{uuid.uuid4().hex[:6]}", "full_name": "Bác sĩ Hồ sơ", "role": "Physician",
            "password": "Matkhau123", "staff_code": code.lower(), "license_no": "000123/DNA-CCHN"}
    r = client.post("/api/v1/admin/users", headers=admin, json=body)
    assert r.status_code == 201, r.text
    u = r.json()
    assert u["staff_code"] == code and u["license_no"] == "000123/DNA-CCHN" and u["room_id"] is None
    assert u["created_by"] == "Test admin" and u["last_login_at"] is None and u["locked_until"] is None

    dup = client.post("/api/v1/admin/users", headers=admin, json={**body, "username": f"bs_{uuid.uuid4().hex[:6]}"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "STAFF_CODE_TAKEN"


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
