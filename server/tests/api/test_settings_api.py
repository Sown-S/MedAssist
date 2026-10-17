"""API tham số vận hành SYSTEM_SETTING (Admin)."""
import pytest


@pytest.fixture
def admin(login):
    return login("admin")


def test_list_shows_defaults(client, users, admin):
    rows = {s["setting_key"]: s for s in client.get("/api/v1/admin/settings", headers=admin).json()}
    assert set(rows) == {"inventory.near_expiry_days", "inventory.min_remaining_shelf_days",
                         "clinic.profile", "billing.default_consultation_fee"}
    assert all("description" in r for r in rows.values())


def test_update_validates_audits_and_affects_views(client, users, admin, logs, login):
    r = client.put("/api/v1/admin/settings/inventory.near_expiry_days", headers=admin, json={"value": "abc"})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["field"].startswith("inventory.near_expiry_days")
    r = client.put("/api/v1/admin/settings/khong.co", headers=admin, json={"value": 1})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_SETTING"

    r = client.put("/api/v1/admin/settings/billing.default_consultation_fee", headers=admin, json={"value": 150000})
    assert r.status_code == 200 and r.json()["value"] == 150000 and r.json()["is_default"] is False
    r = client.put("/api/v1/admin/settings/billing.default_consultation_fee", headers=admin, json={"value": 200000})
    rows = logs(action="UPDATE", entity="system_setting")
    assert [(x.old_values["value"], x.new_values["value"]) for x in rows] == [(0, 150000), (150000, 200000)]
    client.put("/api/v1/admin/settings/billing.default_consultation_fee", headers=admin, json={"value": 200000})
    assert len(logs(action="UPDATE", entity="system_setting")) == 2           # không đổi thì không ghi

    r = client.put("/api/v1/admin/settings/clinic.profile", headers=admin,
                   json={"value": {"name": "Phòng khám Hòa Khánh", "phone": "0236 123"}})
    assert r.json()["value"] == {"name": "Phòng khám Hòa Khánh", "address": "", "phone": "0236 123"}
    assert client.put("/api/v1/admin/settings/clinic.profile", headers=login("yta"),
                      json={"value": {"name": "X"}}).status_code == 403
