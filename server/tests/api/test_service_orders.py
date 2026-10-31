"""Danh mục dịch vụ, gói khám, phiếu chỉ định cận lâm sàng và hóa đơn tự lấy dòng chỉ định (ERD v2.1)."""
import uuid

import pytest
from sqlalchemy import text

from app.core.database import engine


@pytest.fixture
def admin(login):
    return login("admin")


@pytest.fixture
def service(client, admin):
    """Tạo dịch vụ có mã ngẫu nhiên (không đụng mã DV01 mà phí khám mặc định trỏ tới)."""
    def _make(name="Siêu âm ổ bụng", kind="Service", group="diagnostic", price=150000, **over):
        r = client.post("/api/v1/admin/services", headers=admin, json={
            "code": f"T{uuid.uuid4().hex[:8]}", "name": name, "kind": kind, "group_key": group, "price": price, **over})
        assert r.status_code == 201, r.text
        return r.json()
    return _make


@pytest.fixture
def package(client, admin):
    def _make(items, price=300000, name="Gói thử"):
        r = client.post("/api/v1/admin/service-packages", headers=admin, json={
            "code": f"G{uuid.uuid4().hex[:8]}", "name": name, "price": price,
            "items": [{"service_id": s["service_id"]} for s in items]})
        assert r.status_code == 201, r.text
        return r.json()
    return _make


def _finish_exam(client, doctor, vid):
    client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json={"diagnosis_name": "Đau bụng"})
    r = client.post(f"/api/v1/visits/{vid}/complete-exam", headers=doctor)
    assert r.status_code == 200, r.text
    return r.json()


def _lines(invoice, kind="Paraclinical"):
    return sorted((i["item_name"], i["unit_price"], i["service_order_id"] is not None)
                  for i in invoice["items"] if i["item_type"] == kind)


# ---------------------------------------------------------------------------- danh mục
def test_admin_manages_catalog_and_price_history(client, admin, nurse, service, logs):
    s = service(name="Siêu âm tuyến giáp", price=120000)
    dup = client.post("/api/v1/admin/services", headers=admin, json={
        "code": s["code"].lower(), "name": "Trùng", "kind": "Service", "group_key": "diagnostic", "price": 1})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "SERVICE_CODE_TAKEN"
    assert client.post("/api/v1/admin/services", headers=nurse, json={
        "code": "X1", "name": "x", "kind": "Service", "group_key": "x", "price": 1}).status_code == 403
    r = client.patch(f"/api/v1/admin/services/{s['service_id']}", headers=admin, json={"price": 135000})
    assert r.status_code == 200 and r.json()["price"] == 135000
    hist = client.get(f"/api/v1/admin/services/{s['service_id']}/price-history", headers=admin).json()
    assert [(h["price"], h["old_price"]) for h in hist] == [(135000, 120000), (120000, None)]
    assert hist[0]["changed_by_name"] == "Test admin"
    found = client.get("/api/v1/services", headers=nurse, params={"q": "sieu am tuyen", "kind": "Service"}).json()
    assert [x["code"] for x in found] == [s["code"]]
    client.patch(f"/api/v1/admin/services/{s['service_id']}", headers=admin, json={"is_active": False})
    assert client.get("/api/v1/services", headers=nurse, params={"q": s["code"]}).json() == []
    assert len(client.get("/api/v1/services", headers=admin,
                          params={"q": s["code"], "include_inactive": True}).json()) == 1
    assert len(logs(action="UPDATE", entity="service")) == 2


def test_lab_reference_range_is_checked(client, admin, service):
    lab = service(name="Glucose thử", kind="Lab", group="biochemistry", price=30000, unit="mmol/L",
                  ref_low=3.9, ref_high=6.4, sample="blood")
    assert (lab["ref_low"], lab["ref_high"], lab["unit"]) == (3.9, 6.4, "mmol/L")
    r = client.patch(f"/api/v1/admin/services/{lab['service_id']}", headers=admin, json={"ref_low": 7})
    assert r.status_code == 422
    assert client.patch(f"/api/v1/admin/services/{lab['service_id']}", headers=admin,
                        json={"price": None}).status_code == 422


def test_package_requires_active_services(client, admin, service, package):
    a, b = service(), service(kind="Lab", group="hematology", price=90000)
    p = package([a, b, a])
    assert {(i["code"], i["quantity"]) for i in p["items"]} == {(a["code"], 2), (b["code"], 1)}
    client.patch(f"/api/v1/admin/services/{b['service_id']}", headers=admin, json={"is_active": False})
    r = client.post("/api/v1/admin/service-packages", headers=admin, json={
        "code": f"G{uuid.uuid4().hex[:6]}", "name": "Hỏng", "price": 1, "items": [{"service_id": b["service_id"]}]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_SERVICE"
    listed = next(x for x in client.get("/api/v1/service-packages", headers=admin).json()
                  if x["package_id"] == p["package_id"])
    assert any(not i["is_active"] for i in listed["items"])


# ---------------------------------------------------------------------------- chỉ định, kết quả, hóa đơn
def test_order_results_and_invoice(client, nurse, doctor, doctor2, examining, service, logs):
    us, xq, ecg = service(), service(name="X-quang ngực", kind="Lab", group="imaging", price=120000), \
        service(name="Điện tim", price=80000)
    vid = examining()
    body = {"service_ids": [us["service_id"], xq["service_id"], ecg["service_id"], us["service_id"]],
            "other_items": ["Nội soi dạ dày"], "diagnosis": "Đau bụng chưa rõ nguyên nhân"}
    assert client.post(f"/api/v1/visits/{vid}/service-orders", headers=doctor2, json=body).status_code == 409
    assert client.post(f"/api/v1/visits/{vid}/service-orders", headers=nurse, json=body).status_code == 403
    r = client.post(f"/api/v1/visits/{vid}/service-orders", headers=doctor, json=body)
    assert r.status_code == 201, r.text
    order = r.json()
    assert len(order["items"]) == 4 and order["ordered_by_name"] == "Test bs"
    assert client.get(f"/api/v1/visits/{vid}", headers=doctor).json()["lab_out_at"]
    items = {i["item_name"]: i for i in order["items"]}
    assert items["Nội soi dạ dày"]["unit_price"] is None

    r = client.put(f"/api/v1/visits/{vid}/service-orders/results", headers=doctor, json={
        "items": [{"item_id": items[us["name"]]["item_id"], "result": "Gan nhiễm mỡ độ I"}],
        "conclusions": [{"order_id": order["order_id"], "conclusion": "Theo dõi gan nhiễm mỡ"}]})
    assert r.status_code == 200, r.text
    saved = {i["item_name"]: i for i in r.json()[0]["items"]}
    assert saved[us["name"]]["result"] == "Gan nhiễm mỡ độ I" and saved[us["name"]]["result_at"]
    assert r.json()[0]["conclusion"] == "Theo dõi gan nhiễm mỡ"
    assert client.post(f"/api/v1/service-order-items/{items[us['name']]['item_id']}/cancel", headers=doctor,
                       json={"reason": "Không làm"}).json()["error"]["code"] == "ORDER_ITEM_HAS_RESULT"
    r = client.post(f"/api/v1/service-order-items/{items[ecg['name']]['item_id']}/cancel", headers=doctor,
                    json={"reason": "Bệnh nhân từ chối"})
    assert r.status_code == 200 and r.json()["status"] == "Cancelled"
    assert client.put(f"/api/v1/visits/{vid}/service-orders/results", headers=doctor, json={
        "items": [{"item_id": items[ecg["name"]]["item_id"], "result": "x"}]}).json()["error"]["code"] == \
        "ORDER_ITEM_CANCELLED"

    invoice = _finish_exam(client, doctor, vid)
    assert _lines(invoice) == sorted([(us["name"], 150000, True), (xq["name"], 120000, True)])
    assert invoice["paraclinical_fee"] == 270000
    assert [u["item_name"] for u in invoice["unbilled_items"]] == ["Nội soi dạ dày"]

    # Quầy thêm tay dòng ngoài danh mục: dòng từ chỉ định không bị nhân đôi khi lập lại hóa đơn
    r = client.patch(f"/api/v1/visits/{vid}/invoice", headers=nurse, json={
        "paraclinical_items": [{"item_name": "Nội soi dạ dày", "unit_price": 500000}]})
    assert r.status_code == 200, r.text
    assert _lines(r.json()) == sorted([(us["name"], 150000, True), (xq["name"], 120000, True),
                                       ("Nội soi dạ dày", 500000, False)])

    # Quầy hủy dòng chưa làm trước khi thu tiền: hóa đơn lập lại, giữ dòng nhập tay
    r = client.post(f"/api/v1/service-order-items/{items[xq['name']]['item_id']}/cancel", headers=nurse,
                    json={"reason": "Không chụp"})
    assert r.status_code == 200
    invoice = client.get(f"/api/v1/visits/{vid}/invoice", headers=nurse).json()
    assert _lines(invoice) == sorted([(us["name"], 150000, True), ("Nội soi dạ dày", 500000, False)])
    assert client.post(f"/api/v1/service-order-items/{items[us['name']]['item_id']}/cancel", headers=doctor,
                       json={"reason": "abc"}).json()["error"]["code"] == "ORDER_ITEM_HAS_RESULT"

    assert client.post(f"/api/v1/visits/{vid}/invoice/pay", headers=nurse, json={}).status_code == 200
    other = client.post(f"/api/v1/visits/{vid}/service-orders", headers=doctor, json=body)
    assert other.json()["error"]["code"] == "NOT_YOUR_VISIT"
    record = client.get(f"/api/v1/visits/{vid}/record", headers=doctor).json()
    assert record["service_orders"][0]["conclusion"] == "Theo dõi gan nhiễm mỡ"
    assert {(x.new_values or {}).get("status") for x in logs(action="UPDATE", entity="service_order_item")} == {"Cancelled"}


def test_package_order_covers_consultation(client, nurse, doctor, examining, service, package):
    consult = service(name="Khám tổng quát", group="consult", price=80000)
    cbc = service(name="Công thức máu", kind="Lab", group="hematology", price=90000)
    extra = service(name="Siêu âm tim", price=200000)
    p = package([consult, cbc], price=150000, name="Khám tổng quát cơ bản")
    vid = examining()
    r = client.post(f"/api/v1/visits/{vid}/service-orders", headers=doctor, json={
        "package_id": p["package_id"], "service_ids": [cbc["service_id"], extra["service_id"]], "send_out": False})
    assert r.status_code == 201, r.text
    assert sorted((i["item_name"], i["in_package"]) for i in r.json()["items"]) == sorted(
        [(consult["name"], True), (cbc["name"], True), (extra["name"], False)])
    assert client.get(f"/api/v1/visits/{vid}", headers=doctor).json()["lab_out_at"] is None
    invoice = _finish_exam(client, doctor, vid)
    assert _lines(invoice) == sorted([("Gói: Khám tổng quát cơ bản", 150000, True), (extra["name"], 200000, True)])
    (consult_line,) = [i for i in invoice["items"] if i["item_type"] == "Consultation"]
    assert consult_line["unit_price"] == 0 and "Khám tổng quát cơ bản" in consult_line["item_name"]


def test_consultation_fee_from_catalog(client, admin, nurse, doctor, examining, service):
    consult, kid = service(name="Khám bệnh thử", group="consult", price=85000), \
        service(name="Khám Nhi thử", group="consult", price=110000)
    key = "/api/v1/admin/settings/billing.consultation_service_code"
    assert client.put(key, headers=admin, json={"value": consult["code"]}).status_code == 200
    try:
        invoice = _finish_exam(client, doctor, examining())
        (line,) = [i for i in invoice["items"] if i["item_type"] == "Consultation"]
        assert (line["item_name"], line["unit_price"]) == ("Khám bệnh thử", 85000)
        r = client.patch(f"/api/v1/visits/{invoice['visit_id']}/invoice", headers=nurse,
                         json={"consultation_service_id": kid["service_id"]})
        (line,) = [i for i in r.json()["items"] if i["item_type"] == "Consultation"]
        assert (line["item_name"], line["unit_price"]) == ("Khám Nhi thử", 110000)
        r = client.patch(f"/api/v1/visits/{invoice['visit_id']}/invoice", headers=nurse, json={"consultation_fee": 50000})
        (line,) = [i for i in r.json()["items"] if i["item_type"] == "Consultation"]
        assert (line["item_name"], line["unit_price"]) == ("Khám Nhi thử", 50000)
        lab = service(kind="Lab", group="hematology")
        assert client.patch(f"/api/v1/visits/{invoice['visit_id']}/invoice", headers=nurse,
                            json={"consultation_service_id": lab["service_id"]}).status_code == 422
    finally:
        client.put(key, headers=admin, json={"value": "DV01"})


def test_order_validation(client, admin, doctor, examining, service):
    vid = examining()
    assert client.post(f"/api/v1/visits/{vid}/service-orders", headers=doctor, json={}).status_code == 422
    s = service()
    client.patch(f"/api/v1/admin/services/{s['service_id']}", headers=admin, json={"is_active": False})
    r = client.post(f"/api/v1/visits/{vid}/service-orders", headers=doctor, json={"service_ids": [s["service_id"]]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_SERVICE"
    other = examining()
    item = client.post(f"/api/v1/visits/{other}/service-orders", headers=doctor,
                       json={"other_items": ["Siêu âm"]}).json()["items"][0]
    r = client.put(f"/api/v1/visits/{vid}/service-orders/results", headers=doctor,
                   json={"items": [{"item_id": item["item_id"], "result": "x"}]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_ORDER_ITEM"


def test_db_blocks_order_line_from_other_visit(client, doctor, examining, service):
    s = service()
    a, b = examining(), examining()
    order_a = client.post(f"/api/v1/visits/{a}/service-orders", headers=doctor,
                          json={"service_ids": [s["service_id"]]}).json()["order_id"]
    invoice_b = _finish_exam(client, doctor, b)
    with pytest.raises(Exception, match="thuộc lượt khám khác"):
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO invoice_item (invoice_id, item_type, item_name, quantity, unit_price, subtotal, "
                "service_order_id) VALUES (:i, 'Paraclinical', 'x', 1, 0, 0, :o)"),
                {"i": invoice_b["invoice_id"], "o": order_a})
    with pytest.raises(Exception, match="chk_service_order_item_price"):
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO service_order_item (order_id, item_name, in_package) "
                              "VALUES (:o, 'x', true)"), {"o": order_a})
