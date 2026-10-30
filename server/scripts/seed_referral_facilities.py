"""Nạp danh mục cơ sở nhận chuyển tuyến từ server/data/hospitals.csv (tạo bằng tools/hospital_data).

Định danh theo tỉnh + tên không dấu (uq_referral_facility_identity): chạy lại thì cập nhật, không tạo trùng.
Ghi nhật ký bằng tài khoản 'system'. Chạy trong server/:
    python -m scripts.seed_referral_facilities
    python -m scripts.seed_referral_facilities --deactivate-others   # ngừng dùng cơ sở không còn trong file
"""
import argparse
import csv
import sys
from pathlib import Path

from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.models import ReferralFacility
from app.models.referral_facility import FACILITY_TYPES, OWNERSHIPS
from app.models.user import SYSTEM_USER_ID
from app.services import audit_service as audit

DEFAULT_FILE = Path(__file__).resolve().parents[1] / "data" / "hospitals.csv"
FIELDS = ("address", "facility_type", "ownership", "tech_level", "kcb_code", "source_doc", "source_file")


def _clean(row: dict, n: int) -> dict:
    out = {k: (row.get(k) or "").strip() or None for k in ("name", "province", *FIELDS)}
    if not out["name"] or not out["province"]:
        raise SystemExit(f"Dòng {n}: thiếu name hoặc province")
    if out["facility_type"] not in FACILITY_TYPES:
        raise SystemExit(f"Dòng {n} ({out['name']}): facility_type phải là {'/'.join(FACILITY_TYPES)}")
    if out["ownership"] not in (None, *OWNERSHIPS):
        raise SystemExit(f"Dòng {n} ({out['name']}): ownership phải là {'/'.join(OWNERSHIPS)} hoặc để trống")
    return out


def seed(path: Path = DEFAULT_FILE, deactivate_others: bool = False) -> dict:
    stats = {"created": 0, "updated": 0, "unchanged": 0, "deactivated": 0}
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = [_clean(r, n) for n, r in enumerate(csv.DictReader(f), start=2)]
    with SessionLocal() as db:
        seen = set()
        for row in rows:
            facility = db.scalar(select(ReferralFacility).where(
                ReferralFacility.province == row["province"],
                func.lower(func.f_unaccent(ReferralFacility.name)) == func.lower(func.f_unaccent(row["name"]))))
            if facility is None:
                facility = ReferralFacility(**row)
                db.add(facility)
                db.flush()
                audit.record(db, action="CREATE", entity="referral_facility", entity_id=facility.facility_id,
                             actor_id=SYSTEM_USER_ID, new_values={"name": row["name"], "province": row["province"]})
                stats["created"] += 1
            else:
                changed = {k: row[k] for k in ("name", *FIELDS) if getattr(facility, k) != row[k]}
                if not facility.is_active:
                    changed["is_active"] = True
                for k, v in changed.items():
                    setattr(facility, k, v)
                if changed:
                    facility.updated_at = func.now()
                    audit.record(db, action="UPDATE", entity="referral_facility", entity_id=facility.facility_id,
                                 actor_id=SYSTEM_USER_ID, new_values={"changed_fields": sorted(changed)})
                    stats["updated"] += 1
                else:
                    stats["unchanged"] += 1
            seen.add(facility.facility_id)
        if deactivate_others:
            for facility in db.scalars(select(ReferralFacility).where(
                    ReferralFacility.is_active.is_(True), ReferralFacility.facility_id.not_in(seen))).all():
                facility.is_active, facility.updated_at = False, func.now()
                audit.record(db, action="UPDATE", entity="referral_facility", entity_id=facility.facility_id,
                             actor_id=SYSTEM_USER_ID, new_values={"is_active": False})
                stats["deactivated"] += 1
        db.commit()
    return stats


def main() -> int:
    p = argparse.ArgumentParser(description="Nạp danh mục cơ sở nhận chuyển tuyến")
    p.add_argument("--file", type=Path, default=DEFAULT_FILE)
    p.add_argument("--deactivate-others", action="store_true",
                   help="Ngừng dùng (is_active = false) các cơ sở đang dùng nhưng không có trong file")
    args = p.parse_args()
    s = seed(args.file, deactivate_others=args.deactivate_others)
    print(f"Mới: {s['created']}, cập nhật: {s['updated']}, không đổi: {s['unchanged']}, ngừng dùng: {s['deactivated']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
