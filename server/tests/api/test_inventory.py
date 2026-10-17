"""Danh mục thuốc và kho (US05): thuốc, nhập lô, nhập thêm, điều chỉnh, tồn, cảnh báo, sổ cái."""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from app.core.database import SessionLocal, engine
from app.models import InventoryBatch


@pytest.fixture
def nurse(login):
    return login("yta")


@pytest.fixture
def admin(login):
    return login("admin")


@pytest.fixture
def today(users):
    """Ngày theo múi giờ CSDL (Asia/Ho_Chi_Minh) — có thể khác ngày của máy chạy test."""
    with engine.connect() as conn:
        return conn.scalar(text("SELECT CURRENT_DATE"))


def _drug(client, headers, **over):
    tag = uuid.uuid4().hex[:6]
    body = {"generic_name": f"Paracetamol {tag}", "trade_name": f"Panadol {tag}", "strength": "500 mg",
            "dosage_form": "viên nén", "unit": "viên", "sale_price": 1500, "reorder_level": 50, **over}
    return client.post("/api/v1/drugs", json=body, headers=headers)


def _batch(client, headers, drug_id, **over):
    body = {"drug_id": drug_id, "batch_number": f"L{uuid.uuid4().hex[:6]}",
            # hạn đủ xa: lệch ngày giữa máy chạy test và CSDL không ảnh hưởng
            "expiry_date": (date.today() + timedelta(days=400)).isoformat(), "quantity": 100,
            "import_price": 900, **over}
    return client.post("/api/v1/inventory/batches", json=body, headers=headers)


def test_create_drug_and_duplicate_identity(client, users, nurse, logs):
    r = _drug(client, nurse)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["is_active"] and d["sale_price"] == 1500
    dup = client.post("/api/v1/drugs", headers=nurse, json={**{k: d[k] for k in (
        "generic_name", "trade_name", "strength", "dosage_form", "unit")}, "sale_price": 2000,
        "trade_name": d["trade_name"].upper()})                          # khác hoa thường vẫn trùng
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "DUPLICATE_DRUG"
    (row,) = logs(action="CREATE", entity="drug")
    assert row.new_values["generic_name"] == d["generic_name"]


def test_drug_validation_and_permissions(client, users, nurse, login):
    assert _drug(client, nurse, sale_price=-1).status_code == 422
    assert _drug(client, nurse, unit="").status_code == 422
    assert _drug(client, login("bs")).status_code == 403                 # bác sĩ chỉ xem
    assert client.get("/api/v1/drugs", headers=login("bs")).status_code == 200


def test_update_and_deactivate_drug(client, users, nurse, logs):
    did = _drug(client, nurse).json()["drug_id"]
    r = client.patch(f"/api/v1/drugs/{did}", headers=nurse, json={"sale_price": 2000, "is_active": False})
    assert r.status_code == 200 and r.json()["sale_price"] == 2000 and r.json()["is_active"] is False
    (upd,) = logs(action="UPDATE", entity="drug")
    assert upd.old_values == {"sale_price": "1500.00", "is_active": True}
    listed = client.get("/api/v1/drugs", headers=nurse, params={"limit": 200}).json()["items"]
    assert did not in [x["drug_id"] for x in listed]                      # mặc định chỉ thuốc đang dùng
    assert _batch(client, nurse, did).json()["error"]["code"] == "DRUG_INACTIVE"


def test_search_drug_unaccented(client, users, nurse):
    tag = uuid.uuid4().hex[:6]
    did = _drug(client, nurse, generic_name=f"Ô-xy già {tag}", trade_name=f"Oxy {tag}").json()["drug_id"]
    found = client.get("/api/v1/drugs", headers=nurse, params={"q": f"o-xy gia {tag}"}).json()["items"]
    assert [x["drug_id"] for x in found] == [did]


def test_batch_import_validation(client, users, nurse, today):
    did = _drug(client, nurse).json()["drug_id"]
    assert _batch(client, nurse, did, expiry_date=today.isoformat()).status_code == 422
    r = _batch(client, nurse, did, manufacturing_date=(today + timedelta(days=1)).isoformat())
    assert r.status_code == 422
    assert _batch(client, nurse, did, quantity=0).status_code == 422
    assert _batch(client, nurse, str(uuid.uuid4())).status_code == 404
    ok = _batch(client, nurse, did, batch_number="A01").json()
    assert ok["remaining_quantity"] == ok["initial_quantity"] == 100 and ok["batch_status"] == "Usable"
    again = _batch(client, nurse, did, batch_number="A01")
    assert again.status_code == 409 and again.json()["error"]["code"] == "BATCH_EXISTS"


def test_top_up_and_adjustments_go_through_ledger(client, users, nurse, admin):
    did = _drug(client, nurse).json()["drug_id"]
    bid = _batch(client, nurse, did).json()["batch_id"]
    r = client.post(f"/api/v1/inventory/batches/{bid}/top-up", headers=nurse, json={"quantity": 50, "note": "Đơn NCC 12"})
    assert r.json()["remaining_quantity"] == 150 and r.json()["initial_quantity"] == 100
    r = client.post(f"/api/v1/inventory/batches/{bid}/adjustments", headers=nurse,
                    json={"quantity_change": -20, "reason_code": "Damaged"})
    assert r.json()["remaining_quantity"] == 130
    r = client.post(f"/api/v1/inventory/batches/{bid}/adjustments", headers=nurse,
                    json={"quantity_change": -200, "reason_code": "Lost"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "INSUFFICIENT_STOCK"
    assert client.post(f"/api/v1/inventory/batches/{bid}/adjustments", headers=nurse,
                       json={"quantity_change": 5, "reason_code": "Other"}).status_code == 422   # Other cần ghi chú
    assert client.post(f"/api/v1/inventory/batches/{bid}/adjustments", headers=nurse,
                       json={"quantity_change": 0, "reason_code": "CountCorrection"}).status_code == 422
    moves = client.get(f"/api/v1/inventory/batches/{bid}/movements", headers=nurse).json()
    assert [(m["movement_type"], m["quantity_change"], m["reason_code"]) for m in moves] == [
        ("Adjustment", 50, "Other"), ("Adjustment", -20, "Damaged")]
    assert moves[0]["note"] == "Nhập thêm cùng lô: Đơn NCC 12"
    assert client.get("/api/v1/inventory/reconciliation", headers=admin).json() == []


def test_remaining_quantity_cannot_be_edited_directly(client, users, nurse):
    """Chốt chặn CSDL: chỉ sổ cái đổi được tồn (trg_inventory_batch_guard)."""
    from sqlalchemy.exc import DBAPIError
    bid = _batch(client, nurse, _drug(client, nurse).json()["drug_id"]).json()["batch_id"]
    with engine.connect() as conn:
        with pytest.raises(DBAPIError, match="chỉ thay đổi qua stock_movement"):
            conn.execute(text("UPDATE inventory_batch SET remaining_quantity = 999 WHERE batch_id = :b"), {"b": bid})


def test_stock_alerts_and_expiry(client, users, nurse, admin, today):
    tag = uuid.uuid4().hex[:6]
    did = _drug(client, nurse, generic_name=f"Amoxicillin {tag}", reorder_level=100).json()["drug_id"]
    _batch(client, nurse, did, quantity=60, expiry_date=(today + timedelta(days=30)).isoformat())
    _batch(client, nurse, did, quantity=30)
    with SessionLocal() as db:                       # lô đã hết hạn (giả lập hàng tồn cũ)
        db.add(InventoryBatch(drug_id=did, created_by=users["yta"].user_id, batch_number=f"OLD{tag}",
                              expiry_date=today - timedelta(days=1), initial_quantity=10,
                              remaining_quantity=10, import_price=1))
        db.commit()
    (row,) = client.get("/api/v1/inventory/stock", headers=nurse, params={"q": f"amoxicillin {tag}"}).json()
    assert row["usable_quantity"] == 90 and row["near_expiry_quantity"] == 60 and row["expired_quantity"] == 10
    assert row["is_low_stock"] is True                          # 90 <= 100, không tính 10 hết hạn
    a = client.get("/api/v1/inventory/alerts", headers=nurse).json()
    assert did in [x["drug_id"] for x in a["low_stock"]]
    assert did in [x["drug_id"] for x in a["near_expiry"]]
    expired = [x for x in a["expired_with_stock"] if x["drug_id"] == did]
    assert len(expired) == 1 and expired[0]["days_to_expiry"] == -1
    # hủy hàng hết hạn
    r = client.post(f"/api/v1/inventory/batches/{expired[0]['batch_id']}/adjustments", headers=nurse,
                    json={"quantity_change": -10, "reason_code": "Expired"})
    assert r.json()["batch_status"] == "Depleted"
    batches = client.get("/api/v1/inventory/batches", headers=nurse, params={"drug_id": did}).json()
    assert len(batches) == 2                                    # lô hết hàng bị ẩn mặc định
    assert [b["expiry_date"] for b in batches] == sorted(b["expiry_date"] for b in batches)   # FEFO


def test_alerts_and_reconciliation_permissions(client, users, login):
    assert client.get("/api/v1/inventory/alerts", headers=login("bs")).status_code == 403
    assert client.get("/api/v1/inventory/reconciliation", headers=login("yta")).status_code == 403
