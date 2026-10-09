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
    headers = {"Authorization": "Bearer " + create_access_token(fresh_user.user_id, "Nurse")[0]}
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
