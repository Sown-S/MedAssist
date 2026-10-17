"""Lượt 6c: cấp phát, bỏ qua thuốc (hoàn kho + lập lại hóa đơn), sửa hóa đơn, thu tiền, Finished, hủy ở Prescribed."""
import pytest
from sqlalchemy import text

from app.core.database import engine


def _remaining(client, nurse, batch_id):
    return client.get(f"/api/v1/inventory/batches/{batch_id}", headers=nurse).json()["remaining_quantity"]


def _items(client, nurse, vid):
    return {i["drug_id"]: i for i in client.get(f"/api/v1/visits/{vid}/prescription", headers=nurse).json()["items"]}


def _status(client, doctor, vid):
    return client.get(f"/api/v1/visits/{vid}", headers=doctor).json()["status"]


def test_dispense_skip_reissue_pay_finish(client, nurse, doctor, drug, prescribed, login, logs):
    a, ab = drug({300: 50}, price=2000)
    b, bb = drug({300: 50}, price=5000)
    vid, inv1 = prescribed([(a, 10), (b, 4)])
    assert inv1["drug_fee"] == 40000 and inv1["total_amount"] == 140000
    items = _items(client, nurse, vid)

    r = client.patch(f"/api/v1/prescription-items/{items[a]['item_id']}/dispense", headers=nurse, json={"action": "Dispensed"})
    assert r.status_code == 200 and r.json()["visit_finished"] is False
    assert r.json()["invoice"]["invoice_code"] == inv1["invoice_code"]                    # cấp phát không đổi hóa đơn

    r = client.patch(f"/api/v1/prescription-items/{items[b]['item_id']}/dispense", headers=nurse,
                     json={"action": "Skipped", "skip_reason": "Bệnh nhân đã có thuốc ở nhà"})
    inv2 = r.json()["invoice"]
    assert inv2["invoice_code"] != inv1["invoice_code"] and inv2["drug_fee"] == 20000 and inv2["total_amount"] == 120000
    assert [i["item_type"] for i in inv2["items"]].count("Drug") == 1
    assert (_remaining(client, nurse, ab[300]), _remaining(client, nurse, bb[300])) == (40, 50)   # b được hoàn kho

    r = client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={"payment_method": "BankingTransfer"})
    assert r.status_code == 200 and r.json()["visit_finished"] is True
    assert r.json()["invoice"]["payment_status"] == "Paid" and r.json()["invoice"]["payment_method"] == "BankingTransfer"
    v = client.get(f"/api/v1/visits/{vid}", headers=doctor).json()
    assert v["status"] == "Finished" and v["finished_at"]
    assert client.get(f"/api/v1/visits/{vid}/prescription", headers=nurse).json()["status"] == "Dispensed"
    assert vid not in [x["visit_id"] for x in client.get("/api/v1/billing/awaiting", headers=nurse).json()]
    assert client.get("/api/v1/inventory/reconciliation", headers=login("admin")).json() == []
    paid = [x for x in logs(entity="invoice", action="UPDATE") if x.new_values.get("payment_status") == "Paid"]
    assert len(paid) == 1 and paid[0].new_values["payment_method"] == "BankingTransfer"


def test_pay_first_then_dispense_finishes(client, nurse, doctor, drug, prescribed):
    a, _ = drug({300: 50})
    vid, _ = prescribed([(a, 3)])
    r = client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={})
    assert r.json()["visit_finished"] is False and _status(client, doctor, vid) == "Prescribed"
    item = _items(client, nurse, vid)[a]
    r = client.patch(f"/api/v1/prescription-items/{item['item_id']}/dispense", headers=nurse,
                     json={"action": "Skipped", "skip_reason": "Không muốn lấy"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ALREADY_PAID"
    r = client.post(f"/api/v1/visits/{vid}/dispense-all", headers=nurse)
    assert r.json()["visit_finished"] is True and _status(client, doctor, vid) == "Finished"
    assert client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={}).status_code == 409


def test_no_prescription_pay_finishes_immediately(client, nurse, doctor, prescribed):
    vid, inv = prescribed([])
    assert inv["total_amount"] == 100000
    r = client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={"payment_method": "Cash"})
    assert r.json()["visit_finished"] is True and _status(client, doctor, vid) == "Finished"


def test_edit_invoice_reissues(client, nurse, drug, prescribed):
    a, _ = drug({300: 50}, price=3000)
    vid, inv1 = prescribed([(a, 2)])
    r = client.patch(f"/api/v1/visits/{vid}/invoice", headers=nurse, json={
        "consultation_fee": 150000,
        "paraclinical_items": [{"item_name": "Công thức máu", "unit_price": 80000},
                               {"item_name": "Siêu âm bụng", "quantity": 1, "unit_price": 120000}]})
    assert r.status_code == 200, r.text
    inv2 = r.json()
    assert inv2["invoice_code"] != inv1["invoice_code"]
    assert (inv2["consultation_fee"], inv2["paraclinical_fee"], inv2["drug_fee"], inv2["total_amount"]) == \
           (150000, 200000, 6000, 356000)
    # chỉ sửa phí khám: giữ nguyên dòng cận lâm sàng
    inv3 = client.patch(f"/api/v1/visits/{vid}/invoice", headers=nurse, json={"consultation_fee": 120000}).json()
    assert inv3["paraclinical_fee"] == 200000 and inv3["total_amount"] == 326000
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT payment_status FROM invoice WHERE invoice_id=:i"),
                           {"i": inv1["invoice_id"]}) == "Cancelled"
    assert client.patch(f"/api/v1/visits/{vid}/invoice", headers=nurse,
                        json={"consultation_fee": -1}).status_code == 422
    client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={})
    r = client.patch(f"/api/v1/visits/{vid}/invoice", headers=nurse, json={"consultation_fee": 1})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ALREADY_PAID"


def test_cancel_at_prescribed_restores_everything(client, nurse, doctor, drug, prescribed, login):
    a, ab = drug({300: 30})
    vid, inv = prescribed([(a, 10)])
    assert _remaining(client, nurse, ab[300]) == 20
    r = client.patch(f"/api/v1/visits/{vid}/cancel", headers=nurse, json={"reason": "Bệnh nhân bỏ về"})
    assert r.status_code == 200 and r.json()["status"] == "Cancelled"
    assert _remaining(client, nurse, ab[300]) == 30
    assert client.get(f"/api/v1/visits/{vid}/invoice", headers=nurse).status_code == 404
    assert client.get(f"/api/v1/visits/{vid}/prescription", headers=nurse).json()["status"] is None
    assert client.get("/api/v1/inventory/reconciliation", headers=login("admin")).json() == []


def test_cancel_at_prescribed_blocked_after_dispense_or_payment(client, nurse, drug, prescribed):
    a, _ = drug({300: 30})
    vid, _ = prescribed([(a, 2)])
    client.patch(f"/api/v1/prescription-items/{_items(client, nurse, vid)[a]['item_id']}/dispense", headers=nurse,
                 json={"action": "Dispensed"})
    r = client.patch(f"/api/v1/visits/{vid}/cancel", headers=nurse, json={"reason": "Bỏ về"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ALREADY_DISPENSED"
    vid2, _ = prescribed([])
    client.post(f"/api/v1/visits/{vid2}/invoice/pay", headers=nurse, json={})          # đã Finished
    assert client.patch(f"/api/v1/visits/{vid2}/cancel", headers=nurse, json={"reason": "Bỏ về"}).status_code == 409


def test_dispense_validation_and_permissions(client, nurse, doctor, drug, prescribed, login):
    a, _ = drug({300: 30})
    vid, _ = prescribed([(a, 2)])
    item = _items(client, nurse, vid)[a]["item_id"]
    url = f"/api/v1/prescription-items/{item}/dispense"
    assert client.patch(url, headers=nurse, json={"action": "Skipped"}).json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.patch(url, headers=doctor, json={"action": "Dispensed"}).status_code == 403
    assert client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=doctor, json={}).status_code == 403
    assert client.get(f"/api/v1/visits/{vid}/invoice", headers=login("admin")).status_code == 403
    assert client.patch(url, headers=nurse, json={"action": "Dispensed"}).status_code == 200
    assert client.patch(url, headers=nurse, json={"action": "Dispensed"}).json()["error"]["code"] == "ALREADY_PROCESSED"


def test_awaiting_list_and_print(client, nurse, drug, prescribed, login):
    client.put("/api/v1/admin/settings/clinic.profile", headers=login("admin"),
               json={"value": {"name": "Phòng khám Thử", "address": "Đà Nẵng", "phone": "0236"}})
    a, _ = drug({300: 30})
    vid, inv = prescribed([(a, 2)])
    row = next(x for x in client.get("/api/v1/billing/awaiting", headers=nurse).json() if x["visit_id"] == vid)
    assert row["pending_items"] == 1 and row["payment_status"] == "Pending" and row["total_amount"] == inv["total_amount"]
    p = client.get(f"/api/v1/visits/{vid}/invoice/print", headers=nurse).json()
    assert p["clinic"]["name"] == "Phòng khám Thử" and p["physician_name"] == "Test bs"
    assert p["patient"]["full_name"].startswith("Kê Đơn") and p["invoice"]["invoice_code"] == inv["invoice_code"]
