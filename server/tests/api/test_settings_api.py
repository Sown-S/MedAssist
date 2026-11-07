"""API tham số vận hành SYSTEM_SETTING (Admin)."""

import pytest


@pytest.fixture
def admin(login):
    return login("admin")


def test_list_shows_defaults(client, users, admin):
    rows = {s["setting_key"]: s for s in client.get("/api/v1/admin/settings", headers=admin).json()}
    assert set(rows) == {
        "inventory.near_expiry_days",
        "inventory.min_remaining_shelf_days",
        "clinic.profile",
        "billing.default_consultation_fee",
        "billing.consultation_service_code",
        "security.idle_logout_minutes",
    }
    assert all("description" in r for r in rows.values())


def test_update_validates_audits_and_affects_views(client, users, admin, logs, login):
    r = client.put("/api/v1/admin/settings/inventory.near_expiry_days", headers=admin, json={"value": "abc"})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["field"].startswith("inventory.near_expiry_days")
    r = client.put("/api/v1/admin/settings/khong.co", headers=admin, json={"value": 1})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_SETTING"

    before = {s["setting_key"]: s["value"] for s in client.get("/api/v1/admin/settings", headers=admin).json()}
    start = before["billing.default_consultation_fee"]  # test khác có thể đã đổi giá trị
    r = client.put("/api/v1/admin/settings/billing.default_consultation_fee", headers=admin, json={"value": 150001})
    assert r.status_code == 200 and r.json()["value"] == 150001 and r.json()["is_default"] is False
    r = client.put("/api/v1/admin/settings/billing.default_consultation_fee", headers=admin, json={"value": 200000})
    rows = logs(action="UPDATE", entity="system_setting")
    assert [(x.old_values["value"], x.new_values["value"]) for x in rows] == [(start, 150001), (150001, 200000)]
    client.put("/api/v1/admin/settings/billing.default_consultation_fee", headers=admin, json={"value": 200000})
    assert len(logs(action="UPDATE", entity="system_setting")) == 2  # không đổi thì không ghi

    r = client.put(
        "/api/v1/admin/settings/clinic.profile",
        headers=admin,
        json={"value": {"name": "Phòng khám Hòa Khánh", "phone": "0236 123"}},
    )
    assert r.json()["value"] == {
        "name": "Phòng khám Hòa Khánh",
        "address": "",
        "phone": "0236 123",
        "email": "",
        "tax_code": "",
        "license_no": "",
        "license_date": "",
        "license_issuer": "",
        "director": "",
        "director_license": "",
        "logo": "",
        "print_header": "",
        "print_footer": "",
        "show_logo": True,
    }
    assert (
        client.put(
            "/api/v1/admin/settings/clinic.profile", headers=login("yta"), json={"value": {"name": "X"}}
        ).status_code
        == 403
    )


def test_client_config_is_public_and_follows_settings(client, users, admin):
    r = client.get("/api/v1/auth/client-config")
    assert r.status_code == 200 and set(r.json()) == {"clinic", "idle_logout_minutes"}
    logo = "data:image/png;base64,iVBORw0KGgo="
    client.put(
        "/api/v1/admin/settings/clinic.profile",
        headers=admin,
        json={
            "value": {"name": "PK Thử", "tax_code": "0401234567", "director": "BS A", "logo": logo, "show_logo": False}
        },
    )
    client.put("/api/v1/admin/settings/security.idle_logout_minutes", headers=admin, json={"value": 30})
    cfg = client.get("/api/v1/auth/client-config").json()
    assert cfg["idle_logout_minutes"] == 30
    assert (cfg["clinic"]["name"], cfg["clinic"]["tax_code"], cfg["clinic"]["logo"]) == ("PK Thử", "0401234567", logo)
    assert cfg["clinic"]["show_logo"] is False and cfg["clinic"]["print_footer"] == ""


def test_old_clinic_profile_row_gets_new_fields(client, users, admin):
    from app.core.database import SessionLocal
    from app.models import SystemSetting

    with SessionLocal() as db:
        row = db.get(SystemSetting, "clinic.profile")
        if row is None:
            row = SystemSetting(
                setting_key="clinic.profile", value={}, description="x", updated_by=users["admin"].user_id
            )
            db.add(row)
        row.value = {"name": "PK Cũ", "address": "", "phone": ""}
        db.commit()
    clinic = client.get("/api/v1/auth/client-config").json()["clinic"]
    assert clinic["name"] == "PK Cũ" and clinic["director"] == "" and clinic["logo"] == ""
