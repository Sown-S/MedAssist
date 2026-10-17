"""scripts/seed_drugs.py: nạp đúng, chạy lại không trùng, lỗi dữ liệu báo rõ dòng."""
import pytest
from sqlalchemy import func, select, text

from app.core.database import SessionLocal, engine
from app.models import AuditLog, Drug, InventoryBatch
from app.models.user import SYSTEM_USER_ID
from scripts import seed_drugs


def test_seed_is_idempotent_and_goes_through_services(users):
    first = seed_drugs.seed()
    second = seed_drugs.seed()
    assert second["drugs_created"] == 0 and second["batches_created"] == 0
    assert second["drugs_existing"] == first["drugs_created"] + first["drugs_existing"] == 20
    with SessionLocal() as db:
        para = db.scalar(select(Drug).where(Drug.trade_name == "Panadol"))
        assert para.sale_price == 1500 and para.unit == "viên"
        batch = db.scalar(select(InventoryBatch).where(InventoryBatch.drug_id == para.drug_id))
        assert batch.remaining_quantity == batch.initial_quantity == 500 and batch.created_by == SYSTEM_USER_ID
        assert db.scalar(select(func.count()).select_from(AuditLog).where(
            AuditLog.action_type == "CREATE", AuditLog.target_entity == "drug",
            AuditLog.user_id == SYSTEM_USER_ID)) >= 20
    with engine.connect() as conn:
        assert conn.execute(text("SELECT * FROM v_inventory_reconciliation")).all() == []


def test_seed_reports_bad_row(tmp_path, users):
    bad = tmp_path / "bad.csv"
    bad.write_text("generic_name,trade_name,strength,dosage_form,unit,sale_price,reorder_level,drug_class,"
                   "import_price,batch_quantity,shelf_life_days\nThuốc X,X,1 mg,viên,viên,-5,0,,1,1,100\n",
                   encoding="utf-8")
    with pytest.raises(SystemExit, match="dòng 2"):
        seed_drugs.seed(bad)
