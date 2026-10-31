"""scripts/seed_services.py: nạp dịch vụ và gói, chạy lại không ghi đè giá đã sửa, lỗi báo rõ dòng."""
import csv
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Service, ServicePackage
from scripts import seed_services as seed_mod

SERVICE_HEADER = ["code", "name", "kind", "group_key", "unit", "price", "ref_low", "ref_high", "ref_text", "sample"]


def _write(path, header, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        for r in rows:
            w.writerow({k: "" for k in header} | r)
    return path


def test_seed_creates_once_and_keeps_edited_price(tmp_path, users):
    tag = uuid.uuid4().hex[:6].upper()
    services = _write(tmp_path / "s.csv", SERVICE_HEADER, [
        {"code": f"S{tag}", "name": "Khám thử seed", "kind": "Service", "group_key": "consult", "unit": "lần",
         "price": "80000"},
        {"code": f"L{tag}", "name": "Glucose thử seed", "kind": "Lab", "group_key": "biochemistry",
         "unit": "mmol/L", "price": "30000", "ref_low": "3.9", "ref_high": "6.4", "sample": "blood"}])
    packages = _write(tmp_path / "p.csv", ["code", "name", "price", "items"], [
        {"code": f"G{tag}", "name": "Gói thử seed", "price": "100000", "items": f"S{tag}:1;L{tag}:2"}])
    assert seed_mod.seed(services, packages) == {"services": 2, "packages": 1, "skipped": 0}
    with SessionLocal() as db:
        lab = db.scalar(select(Service).where(Service.code == f"L{tag}"))
        assert (lab.ref_low, lab.sample) == (Decimal("3.900"), "blood")
        pkg = db.scalar(select(ServicePackage).where(ServicePackage.code == f"G{tag}"))
        assert [i["quantity"] for i in pkg.items] == [1, 2]
        lab.price = Decimal("35000")
        db.commit()
    assert seed_mod.seed(services, packages) == {"services": 0, "packages": 0, "skipped": 3}
    with SessionLocal() as db:
        assert db.scalar(select(Service.price).where(Service.code == f"L{tag}")) == Decimal("35000.00")


def test_seed_reports_bad_rows(tmp_path, users):
    bad = _write(tmp_path / "s.csv", SERVICE_HEADER, [{"code": "X", "name": "Sai loại", "kind": "Other",
                                                     "group_key": "x", "price": "1"}])
    with pytest.raises(SystemExit, match="dòng 2"):
        seed_mod.seed(bad, tmp_path / "none.csv")
    ok = _write(tmp_path / "ok.csv", SERVICE_HEADER, [])
    pk = _write(tmp_path / "p.csv", ["code", "name", "price", "items"],
                [{"code": f"G{uuid.uuid4().hex[:6]}", "name": "Thiếu", "price": "1", "items": "KHONGCO:1"}])
    with pytest.raises(SystemExit, match="KHONGCO"):
        seed_mod.seed(ok, pk)


def test_bundled_data_files_are_valid():
    rows = seed_mod._services(seed_mod.DATA / "services.csv")
    codes = {r["code"] for r in rows}
    assert {"DV01", "XN01"} <= codes and len(codes) == len(rows)
    with open(seed_mod.DATA / "service_packages.csv", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            assert {p.split(":")[0] for p in r["items"].split(";")} <= codes
