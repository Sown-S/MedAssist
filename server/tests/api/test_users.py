"""Quản lý tài khoản — chỉ Admin (US07)."""
import uuid

import pytest

from app.models.user import SYSTEM_USER_ID

PW = "Matkhau123"


def _new(client, admin, **over):
    body = {"username": f"nv_{uuid.uuid4().hex[:8]}", "full_name": "  Trần   Văn  B ", "role": "Nurse",
            "password": PW, "phone": "+84 905 123 456", **over}
    return client.post("/api/v1/admin/users", json=body, headers=admin)


@pytest.fixture
def admin(login):
    return login("admin")


def test_create_user_normalizes_and_audits_without_password(client, users, admin, logs):
    r = _new(client, admin, email="B@Clinic.VN")
    assert r.status_code == 201, r.text
    u = r.json()
    assert u["full_name"] == "Trần Văn B" and u["phone"] == "0905123456" and u["email"] == "b@clinic.vn"
    assert "password" not in u and "password_hash" not in u
    (row,) = logs(action="CREATE", entity="users")
    assert row.new_values["password_set"] is True and PW not in str(row.new_values)
    assert client.post("/api/v1/auth/login", json={"username": u["username"], "password": PW}).status_code == 200


@pytest.mark.parametrize("over, field", [
    ({"username": "Ab"}, "username"), ({"username": "có dấu"}, "username"), ({"username": "system"}, "username"),
    ({"role": "Doctor"}, "role"), ({"password": "ngan"}, "password"), ({"phone": "12345"}, "phone"),
    ({"email": "khong-phai-email"}, "email"), ({"full_name": "   "}, "full_name"),
])
def test_create_user_validation(client, users, admin, over, field):
    r = _new(client, admin, **over)
    assert r.status_code == 422
    assert field in {d["field"] for d in r.json()["error"]["details"]}


def test_duplicate_username(client, users, admin):
    name = f"trung_{uuid.uuid4().hex[:6]}"
    assert _new(client, admin, username=name).status_code == 201
    r = _new(client, admin, username=name.upper())             # không phân biệt hoa thường
    assert r.status_code == 409 and r.json()["error"]["code"] == "USERNAME_TAKEN"


def test_non_admin_forbidden_and_logged(client, users, login, logs):
    assert _new(client, login("bs")).status_code == 403
    assert client.get("/api/v1/admin/users", headers=login("yta")).status_code == 403
    denied = [r for r in logs(entity="users") if r.action_type != "LOGIN"]
    assert {r.action_type for r in denied} == {"CREATE", "VIEW"}
    assert all(r.new_values["result"] == "denied" for r in denied)


def test_list_and_get_hide_system_account(client, users, admin):
    page = client.get("/api/v1/admin/users", params={"limit": 200}, headers=admin).json()
    assert all(u["username"] != "system" for u in page["items"])
    assert client.get(f"/api/v1/admin/users/{SYSTEM_USER_ID}", headers=admin).status_code == 404
    found = client.get("/api/v1/admin/users", params={"q": "tran van"}, headers=admin).json()
    assert all("Trần" in u["full_name"] or "tran" in u["username"] for u in found["items"])


def test_update_role_and_lock_with_audit_diff(client, users, admin, logs):
    uid = _new(client, admin).json()["user_id"]
    r = client.patch(f"/api/v1/admin/users/{uid}", json={"role": "Physician", "is_active": False}, headers=admin)
    assert r.status_code == 200 and r.json()["role"] == "Physician" and r.json()["is_active"] is False
    (row,) = logs(action="UPDATE", entity="users")
    assert row.old_values == {"role": "Nurse", "is_active": True}
    assert row.new_values == {"role": "Physician", "is_active": False}
    # không đổi gì -> không ghi nhật ký
    client.patch(f"/api/v1/admin/users/{uid}", json={"role": "Physician"}, headers=admin)
    assert len(logs(action="UPDATE", entity="users")) == 1


def test_username_cannot_be_changed(client, users, admin):
    uid = _new(client, admin).json()["user_id"]
    r = client.patch(f"/api/v1/admin/users/{uid}", json={"username": "doi_ten"}, headers=admin)
    assert r.status_code == 422


def test_admin_cannot_lock_or_demote_self(client, users, admin):
    me = users["admin"].user_id
    for body in ({"is_active": False}, {"role": "Nurse"}):
        r = client.patch(f"/api/v1/admin/users/{me}", json=body, headers=admin)
        assert r.status_code == 422 and r.json()["error"]["code"] == "SELF_LOCKOUT"


def test_system_account_is_untouchable(client, users, admin):
    r = client.patch(f"/api/v1/admin/users/{SYSTEM_USER_ID}", json={"is_active": True}, headers=admin)
    assert r.status_code == 403 and r.json()["error"]["code"] == "SYSTEM_ACCOUNT"
    r = client.post(f"/api/v1/admin/users/{SYSTEM_USER_ID}/reset-password", json={"new_password": PW}, headers=admin)
    assert r.status_code == 403


def test_reset_password(client, users, admin, logs):
    u = _new(client, admin).json()
    r = client.post(f"/api/v1/admin/users/{u['user_id']}/reset-password",
                    json={"new_password": "DatLai12345"}, headers=admin)
    assert r.status_code == 204
    assert client.post("/api/v1/auth/login", json={"username": u["username"], "password": "DatLai12345"}).status_code == 200
    assert client.post("/api/v1/auth/login", json={"username": u["username"], "password": PW}).status_code == 401
    assert [r.new_values for r in logs(action="UPDATE", entity="users")] == [{"password_reset_by_admin": True}]


def test_unknown_user_404(client, users, admin):
    assert client.patch(f"/api/v1/admin/users/{uuid.uuid4()}", json={"role": "Nurse"}, headers=admin).status_code == 404
