"""Đăng nhập, token và nhật ký LOGIN / LOGIN_FAILED / LOGOUT (US07, US09)."""
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.models import User

GENERIC = "Tên đăng nhập hoặc mật khẩu không đúng"


def test_password_hashing():
    h = hash_password("Matkhau123")
    assert h.startswith("$argon2id$")
    assert verify_password("Matkhau123", h) and not verify_password("sai", h)
    assert verify_password("x", "!disabled-no-login") is False      # hash vô hiệu của 'system'
    with pytest.raises(ValueError):
        hash_password("ngan")


def test_login_success_logs_login(client, users, logs):
    r = client.post("/api/v1/auth/login", json={"username": "bs", "password": "Matkhau123"},
                    headers={"User-Agent": "MedAssist-Desktop/0.1"})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "Physician" and body["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    payload = decode_access_token(body["access_token"])
    assert payload["sub"] == str(users["bs"].user_id) and payload["type"] == "access"

    (row,) = logs(action="LOGIN")
    assert row.user_id == users["bs"].user_id and row.entity_id == users["bs"].user_id
    assert row.user_agent == "MedAssist-Desktop/0.1" and row.ip_address


@pytest.mark.parametrize("username, password, reason, has_user_id", [
    ("bs", "sai-mat-khau", "bad_password", True),       # tài khoản có thật: vẫn ghi user_id (ERD v1.8)
    ("khong_ton_tai", "x", "unknown_user", False),      # không tồn tại: user_id NULL
    ("khoa", "Matkhau123", "inactive", True),            # đúng mật khẩu nhưng bị khóa
    ("system", "!disabled-no-login", "bad_password", True),
])
def test_login_failures_same_message_and_logged(client, users, logs, username, password, reason, has_user_id):
    r = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    err = r.json()["error"]
    assert r.status_code == 401 and err["message"] == GENERIC and err["code"] == "UNAUTHORIZED"

    (row,) = logs(action="LOGIN_FAILED")
    assert row.attempted_username == username
    assert row.new_values == {"reason": reason}
    assert (row.user_id is not None) is has_user_id


def test_login_validation_error_is_not_logged(client, users, logs):
    assert client.post("/api/v1/auth/login", json={"username": "", "password": "x"}).status_code == 422
    assert logs() == []


def test_me_and_logout(client, users, login, logs):
    headers = login("yta")
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["username"] == "yta" and me["role"] == "Nurse" and "password_hash" not in me

    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    (row,) = logs(action="LOGOUT")
    assert row.user_id == users["yta"].user_id


def _token(**overrides) -> str:
    now = datetime.now(UTC)
    payload = {"sub": str(uuid.uuid4()), "type": "access", "iat": now, "exp": now + timedelta(minutes=5)}
    payload.update(overrides)
    return jwt.encode({k: v for k, v in payload.items() if v is not None},
                      settings.JWT_SECRET_KEY, algorithm="HS256")


@pytest.mark.parametrize("authorization", [
    None,
    "Bearer khong-phai-jwt",
    "Basic abc",
    "Bearer " + jwt.encode({"sub": "x", "type": "access", "iat": 0, "exp": 9999999999},
                           "khoa-bi-mat-khac-dai-it-nhat-32-ky-tu!!", algorithm="HS256"),
])
def test_me_rejects_bad_credentials(client, users, authorization):
    headers = {"Authorization": authorization} if authorization else {}
    r = client.get("/api/v1/auth/me", headers=headers)
    assert r.status_code == 401 and r.headers.get("www-authenticate") == "Bearer"


def test_me_rejects_expired_wrong_type_and_missing_claims(client, users):
    uid = str(users["bs"].user_id)
    past = datetime.now(UTC) - timedelta(hours=1)
    for token in (_token(sub=uid, iat=past - timedelta(minutes=5), exp=past),   # hết hạn
                  _token(sub=uid, type="refresh"),                              # sai loại
                  _token(sub=uid, type=None)):                                  # thiếu "type"
        assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_deactivated_user_token_stops_working_immediately(client, users):
    with SessionLocal() as db:
        u = User(username=f"tam_{uuid.uuid4().hex[:6]}", password_hash=hash_password("Matkhau123"),
                 full_name="Tạm", role="Nurse")
        db.add(u)
        db.commit()
        token, _ = create_access_token(u.user_id, u.role)
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 200

        u.is_active = False
        db.commit()
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
