"""scripts/seed_drugs.py + data/drugs.csv: nạp đúng, chạy lại không trùng, dữ liệu hợp lệ, lỗi báo rõ dòng."""
import csv
import re

import pytest
from sqlalchemy import func, select, text

from app.core.database import SessionLocal, engine
from app.models import AuditLog, Drug, InventoryBatch
from app.models.user import SYSTEM_USER_ID
from scripts import seed_drugs


def _rows():
    with open(seed_drugs.DEFAULT_FILE, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def test_catalog_file_is_well_formed():
    rows = _rows()
    assert len(rows) == 100
    keys = [(r["generic_name"].lower(), r["trade_name"].lower(), r["strength"].lower(), r["dosage_form"].lower())
            for r in rows]
    assert len(set(keys)) == len(keys)                                   # khớp uq_drug_identity
    for r in rows:
        assert re.fullmatch(r"TT 19/2018/TT-BYT, Phụ lục I, STT \d+", r["source"]), r
        assert int(r["sale_price"]) >= int(r["import_price"]) > 0
        assert int(r["batch_quantity"]) > 0 and int(r["shelf_life_days"]) >= 365
    # Thuốc không có trong Phụ lục I Thông tư 19/2018 không được đưa vào
    names = {r["generic_name"].lower() for r in rows}
    assert not names & {"cetirizin", "domperidon", "losartan", "kẽm gluconat"}


def test_seed_is_idempotent_and_goes_through_services(users):
    first = seed_drugs.seed()
    second = seed_drugs.seed()
    assert second["drugs_created"] == 0 and second["batches_created"] == 0
    assert second["drugs_existing"] == first["drugs_created"] + first["drugs_existing"] == 100
    with SessionLocal() as db:
        para = db.scalar(select(Drug).where(Drug.trade_name == "Panadol"))
        assert para.sale_price == 1500 and para.unit == "viên"
        batch = db.scalar(select(InventoryBatch).where(InventoryBatch.drug_id == para.drug_id,
                                                       InventoryBatch.batch_number.like("SEED-%")))
        assert batch.remaining_quantity == batch.initial_quantity == 1000 and batch.created_by == SYSTEM_USER_ID
        assert db.scalar(select(func.count()).select_from(AuditLog).where(
            AuditLog.action_type == "CREATE", AuditLog.target_entity == "drug",
            AuditLog.user_id == SYSTEM_USER_ID)) >= 100
    with engine.connect() as conn:
        assert conn.execute(text("SELECT * FROM v_inventory_reconciliation")).all() == []


def test_deactivate_others(users):
    seed_drugs.seed()
    with SessionLocal() as db:
        extra = Drug(generic_name="Cetirizin", trade_name="Zyrtec", strength="10 mg", dosage_form="viên nén",
                     unit="viên", sale_price=3000)
        db.add(extra)
        db.commit()
        extra_id = extra.drug_id
    stats = seed_drugs.seed(with_batches=False, deactivate_others=True)
    assert stats["deactivated"] >= 1
    with SessionLocal() as db:
        assert db.get(Drug, extra_id).is_active is False
        assert db.scalar(select(func.count()).select_from(Drug).where(Drug.is_active.is_(True))) == 100
        assert db.scalar(select(AuditLog).where(AuditLog.entity_id == extra_id, AuditLog.action_type == "UPDATE"))


def test_seed_reports_bad_row(tmp_path, users):
    bad = tmp_path / "bad.csv"
    bad.write_text("generic_name,trade_name,strength,dosage_form,unit,sale_price,reorder_level,drug_class,"
                   "import_price,batch_quantity,shelf_life_days,source\nThuốc X,X,1 mg,viên,viên,-5,0,,1,1,100,\n",
                   encoding="utf-8")
    with pytest.raises(SystemExit, match="dòng 2"):
        seed_drugs.seed(bad)
