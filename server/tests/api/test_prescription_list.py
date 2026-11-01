"""Danh sách đơn đã xác nhận theo kỳ (GET /prescriptions): màn Đơn thuốc của bác sĩ và lễ tân."""
from datetime import timedelta


def test_list_confirmed_by_day_and_physician(client, doctor, doctor2, nurse, login, prescribed, drug, today, logs):
    did, _ = drug({90: 100}, price=3000)
    vid, invoice = prescribed([(did, 4)])
    no_rx, _ = prescribed([])

    rows = client.get("/api/v1/prescriptions", headers=doctor).json()
    mine = [r for r in rows if r["visit_id"] == vid]
    assert len(mine) == 1 and all(r["visit_id"] != no_rx for r in rows)
    row = mine[0]
    assert row["status"] == "Confirmed" and row["patient_code"].startswith("BN-")
    assert row["items"][0]["quantity"] == 4 and row["items"][0]["dispense_status"] == "Pending"
    assert row["drug_total"] == 12000
    assert row["invoice_status"] == "Pending" and row["invoice_total"] == invoice["total_amount"]

    me = client.get("/api/v1/auth/me", headers=doctor).json()["user_id"]
    other = client.get("/api/v1/auth/me", headers=doctor2).json()["user_id"]
    assert any(r["visit_id"] == vid for r in client.get(f"/api/v1/prescriptions?physician_id={me}", headers=nurse).json())
    assert client.get(f"/api/v1/prescriptions?physician_id={other}", headers=nurse).json() == []

    yesterday = (today - timedelta(days=1)).isoformat()
    assert client.get(f"/api/v1/prescriptions?date_from={yesterday}&date_to={yesterday}", headers=doctor).json() == []
    week = client.get(f"/api/v1/prescriptions?date_from={(today - timedelta(days=6)).isoformat()}&date_to={today.isoformat()}",
                      headers=doctor).json()
    assert any(r["visit_id"] == vid for r in week)
    assert logs(action="VIEW", entity="prescription")


def test_list_rejects_bad_range_and_admin(client, doctor, login, today):
    r = client.get(f"/api/v1/prescriptions?date_from={today.isoformat()}&date_to={(today - timedelta(days=1)).isoformat()}",
                   headers=doctor)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_RANGE"
    assert client.get("/api/v1/prescriptions", headers=login("admin")).status_code == 403
