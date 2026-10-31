"""Nạp danh mục dịch vụ, xét nghiệm và gói khám ban đầu từ server/data/services.csv, service_packages.csv.

Giá trong file là giá mẫu chép từ danh mục mẫu của client; Admin sửa giá thật trên màn danh mục.
Chỉ tạo mã chưa có, không ghi đè dòng đã có (giữ giá Admin đã sửa). Ghi nhật ký bằng tài khoản 'system'.
Chạy trong server/:
    python -m scripts.seed_services
"""
import argparse
import csv
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Service, ServicePackage
from app.models.service import SERVICE_KINDS
from app.models.user import SYSTEM_USER_ID
from app.services import audit_service as audit

DATA = Path(__file__).resolve().parents[1] / "data"


def _num(v: str) -> Decimal | None:
    return Decimal(v) if v.strip() else None


def _services(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    out = []
    for n, r in enumerate(rows, start=2):
        if not r["code"].strip() or not r["name"].strip() or r["kind"] not in SERVICE_KINDS:
            raise SystemExit(f"{path.name} dòng {n}: thiếu mã/tên hoặc kind không phải {'/'.join(SERVICE_KINDS)}")
        out.append({"code": r["code"].strip(), "name": r["name"].strip(), "kind": r["kind"],
                    "group_key": r["group_key"].strip(), "unit": r["unit"].strip() or None,
                    "price": Decimal(r["price"]), "ref_low": _num(r["ref_low"]), "ref_high": _num(r["ref_high"]),
                    "ref_text": r["ref_text"].strip() or None, "sample": r["sample"].strip() or None})
    return out


def seed(services_file: Path = DATA / "services.csv", packages_file: Path = DATA / "service_packages.csv") -> dict:
    stats = {"services": 0, "packages": 0, "skipped": 0}
    with SessionLocal() as db:
        existing = set(db.scalars(select(Service.code)))
        for row in _services(services_file):
            if row["code"] in existing:
                stats["skipped"] += 1
                continue
            service = Service(**row)
            db.add(service)
            db.flush()
            audit.record(db, action="CREATE", entity="service", entity_id=service.service_id,
                         actor_id=SYSTEM_USER_ID, new_values=row)
            stats["services"] += 1
        ids = dict(db.execute(select(Service.code, Service.service_id)).all())
        have = set(db.scalars(select(ServicePackage.code)))
        with open(packages_file, encoding="utf-8-sig", newline="") as f:
            for n, r in enumerate(csv.DictReader(f), start=2):
                if r["code"] in have:
                    stats["skipped"] += 1
                    continue
                items = []
                for part in filter(None, r["items"].split(";")):
                    code, qty = part.split(":")
                    if code not in ids:
                        raise SystemExit(f"{packages_file.name} dòng {n}: không có dịch vụ {code}")
                    items.append({"service_id": str(ids[code]), "quantity": int(qty)})
                package = ServicePackage(code=r["code"], name=r["name"], price=Decimal(r["price"]), items=items)
                db.add(package)
                db.flush()
                audit.record(db, action="CREATE", entity="service_package", entity_id=package.package_id,
                             actor_id=SYSTEM_USER_ID, new_values={"code": package.code, "price": package.price,
                                                                  "items": items})
                stats["packages"] += 1
        db.commit()
    return stats


def main() -> int:
    argparse.ArgumentParser(description="Nạp danh mục dịch vụ, xét nghiệm, gói khám ban đầu").parse_args()
    s = seed()
    print(f"Dịch vụ mới: {s['services']}, gói mới: {s['packages']}, bỏ qua (đã có): {s['skipped']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
