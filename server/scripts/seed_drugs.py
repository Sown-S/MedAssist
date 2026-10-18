"""Nạp danh mục thuốc (và một lô cho mỗi thuốc) từ server/data/drugs.csv — xem server/data/README.md.

Dùng cho máy dev, demo, và (với --no-batches) khi cài máy admin. Chạy lại nhiều lần an toàn:
thuốc đã có (cùng hoạt chất + tên thương mại + hàm lượng + dạng bào chế) thì bỏ qua; lô "SEED-<mã>"
chỉ tạo khi thuốc chưa có lô đó. Đi qua inventory_service (kiểm tra, ghi nhật ký) bằng tài khoản 'system'.

Chạy trong server/:
    python -m scripts.seed_drugs                 # thuốc + lô
    python -m scripts.seed_drugs --no-batches    # chỉ danh mục (máy admin khi cài đặt)
    python -m scripts.seed_drugs --file data/khac.csv
    python -m scripts.seed_drugs --deactivate-others   # ngừng dùng thuốc đang dùng nhưng KHÔNG có trong file
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
from app.schemas.inventory import BatchCreate, DrugCreate, DrugUpdate
from app.services import inventory_service

DEFAULT_FILE = Path(__file__).resolve().parents[1] / "data" / "drugs.csv"
_DRUG_FIELDS = ("generic_name", "trade_name", "strength", "dosage_form", "unit", "sale_price",
                "reorder_level", "drug_class")


def _find(db, row) -> Drug | None:
    return db.scalar(select(Drug).where(
        func.lower(Drug.generic_name) == row["generic_name"].strip().lower(),
        func.lower(Drug.trade_name) == row["trade_name"].strip().lower(),
        func.lower(Drug.strength) == row["strength"].strip().lower(),
        func.lower(Drug.dosage_form) == row["dosage_form"].strip().lower()))


def seed(path: Path = DEFAULT_FILE, with_batches: bool = True, deactivate_others: bool = False) -> dict:
    stats = {"drugs_created": 0, "drugs_existing": 0, "batches_created": 0, "deactivated": 0, "no_price": []}
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    with SessionLocal() as db:
        system = db.get(User, SYSTEM_USER_ID)
        today = inventory_service.today(db)
        in_file: set = set()
        for n, row in enumerate(rows, start=2):           # dòng 1 là tiêu đề
            try:
                if not (row.get("sale_price") or "").strip():
                    # CSDL bắt buộc giá bán (sale_price NOT NULL): chờ có giá (tools/drug_data/fetch_prices) rồi nạp
                    stats["no_price"].append(f"{row['generic_name']} {row['strength']} ({row['trade_name']})")
                    continue
                drug = _find(db, row)
                if drug is None:
                    data = DrugCreate(**{k: row[k] for k in _DRUG_FIELDS if row.get(k) not in (None, "")})
                    drug = inventory_service.create_drug(db, data, system)
                    stats["drugs_created"] += 1
                else:
                    stats["drugs_existing"] += 1
                in_file.add(drug.drug_id)
                if with_batches and int(row.get("batch_quantity") or 0) > 0 and (row.get("import_price") or "").strip() \
                        and (row.get("shelf_life_days") or "").strip():
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
        if deactivate_others:
            # Không xóa (thuốc đã kê đơn / có lô vẫn cần giữ); ngừng dùng qua service để có nhật ký
            for drug in db.scalars(select(Drug).where(Drug.is_active.is_(True), Drug.drug_id.not_in(in_file))).all():
                inventory_service.update_drug(db, drug.drug_id, DrugUpdate(is_active=False), system)
                stats["deactivated"] += 1
        db.commit()
    return stats


def main() -> int:
    p = argparse.ArgumentParser(description="Nạp danh mục thuốc")
    p.add_argument("--file", type=Path, default=DEFAULT_FILE)
    p.add_argument("--no-batches", action="store_true", help="Chỉ nạp danh mục, không tạo lô")
    p.add_argument("--deactivate-others", action="store_true",
                   help="Ngừng dùng (is_active = false) các thuốc đang dùng nhưng không có trong file")
    args = p.parse_args()
    stats = seed(args.file, with_batches=not args.no_batches, deactivate_others=args.deactivate_others)
    print(f"Thuốc mới: {stats['drugs_created']}, đã có: {stats['drugs_existing']}, "
          f"lô mới: {stats['batches_created']}, ngừng dùng: {stats['deactivated']}, "
          f"bỏ qua vì chưa có giá: {len(stats['no_price'])}")
    for name in stats["no_price"]:
        print(f"  chưa có giá: {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
