"""Refresh token, giới hạn đăng nhập sai, tự đổi mật khẩu (bước 4)."""
import uuid

import pytest

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import create_access_token, hash_password
from app.models import User

PW = "Matkhau123"


@pytest.fixture
def fresh_user(users):
    with SessionLocal() as db:
        u = User(username=f"u_{uuid.uuid4().hex[:8]}", password_hash=hash_password(PW),
                 full_name="Người thử", role="Nurse")
        db.add(u)
        db.commit()
        return u


def _login(client, username, password=PW):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_login_returns_both_tokens(client, fresh_user):
    body = _login(client, fresh_user.username).json()
    assert body["expires_in"] == 15 * 60 and body["refresh_expires_in"] == 8 * 3600
    assert body["access_token"] != body["refresh_token"]


def test_refresh_issues_new_pair_and_rejects_misuse(client, fresh_user):
    tokens = _login(client, fresh_user.username).json()
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    new = r.json()
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new['access_token']}"}).status_code == 200
    # access token không dùng làm refresh được, và ngược lại
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]}).status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}).status_code == 401
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": "x" * 40}).json()["error"]["code"] == "UNAUTHORIZED"


def test_refresh_rejected_after_account_locked_and_reads_new_role(client, fresh_user):
    tokens = _login(client, fresh_user.username).json()
    with SessionLocal() as db:
        u = db.get(User, fresh_user.user_id)
        u.role = "Physician"
        db.commit()
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).json()["role"] == "Physician"
    with SessionLocal() as db:
        db.get(User, fresh_user.user_id).is_active = False
        db.commit()
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_lock_after_five_failures_per_username(client, fresh_user, logs):
    for _ in range(settings.LOGIN_MAX_FAILURES_PER_USER):
        assert _login(client, fresh_user.username, "sai").status_code == 401
    r = _login(client, fresh_user.username)                     # đúng mật khẩu vẫn bị chặn
    assert r.status_code == 429
    err = r.json()["error"]
    assert err["code"] == "RATE_LIMITED"
    assert 0 < err["details"][0]["retry_after_seconds"] <= settings.LOGIN_LOCK_MINUTES * 60
    locked = [x for x in logs(action="LOGIN_FAILED") if x.new_values.get("reason") == "locked"]
    assert len(locked) == 1
    # lượt bị chặn không được đếm thêm: vẫn đúng 5 lần sai thật
    real = [x for x in logs(action="LOGIN_FAILED") if x.new_values.get("reason") == "bad_password"]
    assert len(real) == settings.LOGIN_MAX_FAILURES_PER_USER


def test_successful_login_resets_counter(client, fresh_user):
    for _ in range(settings.LOGIN_MAX_FAILURES_PER_USER - 1):
        _login(client, fresh_user.username, "sai")
    assert _login(client, fresh_user.username).status_code == 200
    for _ in range(settings.LOGIN_MAX_FAILURES_PER_USER - 1):
        _login(client, fresh_user.username, "sai")
    assert _login(client, fresh_user.username).status_code == 200      # chưa tới ngưỡng sau lần thành công


def test_unknown_usernames_are_limited_too(client, users):
    name = f"khongco_{uuid.uuid4().hex[:6]}"
    for _ in range(settings.LOGIN_MAX_FAILURES_PER_USER):
        _login(client, name, "x")
    assert _login(client, name, "x").status_code == 429


def test_lock_per_ip(client, users, monkeypatch):
    from sqlalchemy import func, select

    from app.models import AuditLog
    with SessionLocal() as db:
        already = db.scalar(select(func.count()).select_from(AuditLog).where(
            AuditLog.action_type == "LOGIN_FAILED", AuditLog.ip_address == "testclient",
            AuditLog.created_at >= func.now() - func.make_interval(0, 0, 0, 0, 0, settings.LOGIN_WINDOW_MINUTES),
            func.coalesce(AuditLog.new_values["reason"].astext, "") != "locked"))
    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES_PER_IP", already + 3)
    for i in range(3):                                           # ba tên khác nhau từ cùng một IP
        assert _login(client, f"do_{i}_{uuid.uuid4().hex[:6]}", "x").status_code == 401
    assert _login(client, f"do_x_{uuid.uuid4().hex[:6]}", "x").status_code == 429


def test_change_own_password(client, fresh_user, logs):
    headers = {"Authorization": "Bearer " + create_access_token(fresh_user.user_id, "Nurse", fresh_user.password_hash)[0]}
    bad = client.post("/api/v1/auth/change-password", headers=headers,
                      json={"old_password": "sai", "new_password": "MatkhauMoi1"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "WRONG_PASSWORD"
    same = client.post("/api/v1/auth/change-password", headers=headers,
                       json={"old_password": PW, "new_password": PW})
    assert same.status_code == 422
    short = client.post("/api/v1/auth/change-password", headers=headers,
                        json={"old_password": PW, "new_password": "ngan"})
    assert short.status_code == 422
    ok = client.post("/api/v1/auth/change-password", headers=headers,
                     json={"old_password": PW, "new_password": "MatkhauMoi1"})
    assert ok.status_code == 204
    assert _login(client, fresh_user.username, "MatkhauMoi1").status_code == 200
    (row,) = [r for r in logs(action="UPDATE", entity="users")]
    assert row.new_values == {"password_changed": True} and "MatkhauMoi1" not in str(row.new_values)


# ---- Dấu mật khẩu: đổi / đặt lại mật khẩu thu hồi mọi token cũ ----------------------------
def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_change_password_revokes_old_tokens(client, fresh_user):
    old = _login(client, fresh_user.username).json()
    other_device = _login(client, fresh_user.username).json()
    r = client.post("/api/v1/auth/change-password", headers=_bearer(old["access_token"]),
                    json={"old_password": PW, "new_password": "MatkhauMoi1"})
    assert r.status_code == 204
    for tokens in (old, other_device):
        assert client.get("/api/v1/auth/me", headers=_bearer(tokens["access_token"])).status_code == 401
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    new = _login(client, fresh_user.username, "MatkhauMoi1").json()
    assert client.get("/api/v1/auth/me", headers=_bearer(new["access_token"])).status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": new["refresh_token"]}).status_code == 200


def test_admin_reset_password_revokes_old_tokens(client, fresh_user, login):
    old = _login(client, fresh_user.username).json()
    r = client.post(f"/api/v1/admin/users/{fresh_user.user_id}/reset-password", headers=login("admin"),
                    json={"new_password": "DatLai12345"})
    assert r.status_code == 204, r.text
    assert client.get("/api/v1/auth/me", headers=_bearer(old["access_token"])).status_code == 401
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]}).status_code == 401


def test_token_without_password_stamp_rejected(client, fresh_user):
    import jwt
    from datetime import UTC, datetime, timedelta
    now = datetime.now(UTC)
    forged_old_format = jwt.encode({"sub": str(fresh_user.user_id), "role": "Nurse", "type": "access",
                                    "iat": now, "exp": now + timedelta(minutes=5)},
                                   settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    assert client.get("/api/v1/auth/me", headers=_bearer(forged_old_format)).status_code == 401


def test_password_stamp_does_not_expose_hash(fresh_user):
    import jwt
    token, _ = create_access_token(fresh_user.user_id, "Nurse", fresh_user.password_hash)
    payload = jwt.decode(token, options={"verify_signature": False})
    assert len(payload["pwd"]) == 16 and payload["pwd"] not in fresh_user.password_hash


# ---- Mật khẩu do Admin đặt: phải đổi trước khi dùng API khác ----------------------------
def test_admin_set_password_must_be_changed_before_other_api(client, users, login):
    admin = login("admin")
    username = f"nv_{uuid.uuid4().hex[:8]}"
    r = client.post("/api/v1/admin/users", headers=admin,
                    json={"username": username, "full_name": "Nhân viên mới", "role": "Nurse", "password": PW})
    assert r.status_code == 201 and r.json()["must_change_password"] is True
    user_id = r.json()["user_id"]

    tokens = _login(client, username).json()
    me = client.get("/api/v1/auth/me", headers=_bearer(tokens["access_token"]))
    assert me.status_code == 200 and me.json()["must_change_password"] is True
    blocked = client.get("/api/v1/_test/patients", headers=_bearer(tokens["access_token"]))
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    r = client.post("/api/v1/auth/change-password", headers=_bearer(tokens["access_token"]),
                    json={"old_password": PW, "new_password": "MatkhauMoi1"})
    assert r.status_code == 204
    new = _login(client, username, "MatkhauMoi1").json()
    assert client.get("/api/v1/auth/me", headers=_bearer(new["access_token"])).json()["must_change_password"] is False
    assert client.get("/api/v1/_test/patients", headers=_bearer(new["access_token"])).status_code == 200

    r = client.post(f"/api/v1/admin/users/{user_id}/reset-password", headers=admin,
                    json={"new_password": "DatLai12345"})
    assert r.status_code == 204
    again = _login(client, username, "DatLai12345").json()
    assert client.get("/api/v1/_test/patients", headers=_bearer(again["access_token"])).status_code == 403
