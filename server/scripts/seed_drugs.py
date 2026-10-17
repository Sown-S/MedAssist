"""Nạp danh mục thuốc mẫu (và một lô cho mỗi thuốc) từ server/data/drugs_sample.csv.

Dùng cho máy dev và demo. Giá trong file là GIẢ LẬP. Chạy lại nhiều lần an toàn:
thuốc đã có (cùng hoạt chất + tên thương mại + hàm lượng + dạng bào chế) thì bỏ qua; lô "SEED-<mã>"
chỉ tạo khi thuốc chưa có lô đó. Đi qua inventory_service (kiểm tra, ghi nhật ký) bằng tài khoản 'system'.

Chạy trong server/:
    python -m scripts.seed_drugs                 # thuốc + lô
    python -m scripts.seed_drugs --no-batches    # chỉ danh mục (máy admin khi cài đặt)
    python -m scripts.seed_drugs --file data/khac.csv
"""
import argparse
import csv
import sys
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.exceptions import AppError
from app.models import Drug, InventoryBatch, User
from app.models.user import SYSTEM_USER_ID
from app.schemas.inventory import BatchCreate, DrugCreate
from app.services import inventory_service

DEFAULT_FILE = Path(__file__).resolve().parents[1] / "data" / "drugs_sample.csv"
_DRUG_FIELDS = ("generic_name", "trade_name", "strength", "dosage_form", "unit", "sale_price",
                "reorder_level", "drug_class")


def _find(db, row) -> Drug | None:
    return db.scalar(select(Drug).where(
        func.lower(Drug.generic_name) == row["generic_name"].strip().lower(),
        func.lower(Drug.trade_name) == row["trade_name"].strip().lower(),
        func.lower(Drug.strength) == row["strength"].strip().lower(),
        func.lower(Drug.dosage_form) == row["dosage_form"].strip().lower()))


def seed(path: Path = DEFAULT_FILE, with_batches: bool = True) -> dict:
    stats = {"drugs_created": 0, "drugs_existing": 0, "batches_created": 0}
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    with SessionLocal() as db:
        system = db.get(User, SYSTEM_USER_ID)
        today = inventory_service.today(db)
        for n, row in enumerate(rows, start=2):           # dòng 1 là tiêu đề
            try:
                drug = _find(db, row)
                if drug is None:
                    data = DrugCreate(**{k: row[k] for k in _DRUG_FIELDS if row.get(k) not in (None, "")})
                    drug = inventory_service.create_drug(db, data, system)
                    stats["drugs_created"] += 1
                else:
                    stats["drugs_existing"] += 1
                if with_batches and int(row.get("batch_quantity") or 0) > 0:
                    batch_no = f"SEED-{str(drug.drug_id)[:8].upper()}"
                    if not db.scalar(select(InventoryBatch.batch_id).where(
                            InventoryBatch.drug_id == drug.drug_id, InventoryBatch.batch_number == batch_no)):
                        inventory_service.create_batch(db, BatchCreate(
                            drug_id=drug.drug_id, batch_number=batch_no,
                            expiry_date=today + timedelta(days=int(row["shelf_life_days"])),
                            quantity=int(row["batch_quantity"]), import_price=Decimal(row["import_price"])), system)
                        stats["batches_created"] += 1
            except (AppError, ValueError) as exc:
                db.rollback()
                raise SystemExit(f"Lỗi ở dòng {n} ({row.get('generic_name')}): {exc}") from None
        db.commit()
    return stats


def main() -> int:
    p = argparse.ArgumentParser(description="Nạp danh mục thuốc mẫu")
    p.add_argument("--file", type=Path, default=DEFAULT_FILE)
    p.add_argument("--no-batches", action="store_true", help="Chỉ nạp danh mục, không tạo lô")
    args = p.parse_args()
    stats = seed(args.file, with_batches=not args.no_batches)
    print(f"Thuốc mới: {stats['drugs_created']}, đã có: {stats['drugs_existing']}, "
          f"lô mới: {stats['batches_created']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
