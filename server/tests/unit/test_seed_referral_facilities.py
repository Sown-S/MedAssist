"""scripts/seed_referral_facilities.py: nạp, chạy lại không trùng, cập nhật, ngừng dùng, lỗi báo rõ dòng."""
import csv

import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import ReferralFacility
from scripts import seed_referral_facilities as seed_mod

HEADER = ["name", "province", "address", "facility_type", "ownership", "tech_level", "kcb_code", "source_doc",
          "source_file"]


def _write(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER)
        w.writeheader()
        for r in rows:
            w.writerow({k: "" for k in HEADER} | r)
    return path


def _get(name):
    with SessionLocal() as db:
        return db.scalar(select(ReferralFacility).where(ReferralFacility.name == name))


def test_seed_is_idempotent_and_updates(tmp_path, users):
    rows = [{"name": "Bệnh viện Thử Seed A", "province": "Đà Nẵng", "facility_type": "Hospital", "ownership": "Public",
             "source_doc": "TB 6539/TB-SYT"},
            {"name": "Trung tâm Y tế Thử Seed B", "province": "Đà Nẵng", "facility_type": "HealthCenter"}]
    f = _write(tmp_path / "a.csv", rows)
    assert seed_mod.seed(f)["created"] == 2
    again = seed_mod.seed(f)
    assert again["created"] == 0 and again["unchanged"] == 2

    rows[0] |= {"name": "BỆNH VIỆN THỬ SEED A", "address": "124 Hải Phòng"}   # cùng tên không dấu, khác hoa thường
    s = seed_mod.seed(_write(tmp_path / "b.csv", rows[:1]), deactivate_others=True)
    assert s["created"] == 0 and s["updated"] == 1 and s["deactivated"] >= 1
    a = _get("BỆNH VIỆN THỬ SEED A")
    assert a.address == "124 Hải Phòng" and a.is_active
    assert not _get("Trung tâm Y tế Thử Seed B").is_active


@pytest.mark.parametrize("row, msg", [
    ({"name": "", "province": "Huế", "facility_type": "Hospital"}, "thiếu name"),
    ({"name": "BV X", "province": "Huế", "facility_type": "Clinic"}, "facility_type"),
    ({"name": "BV X", "province": "Huế", "facility_type": "Hospital", "ownership": "Công lập"}, "ownership"),
])
def test_seed_rejects_bad_rows(tmp_path, users, row, msg):
    with pytest.raises(SystemExit, match=msg):
        seed_mod.seed(_write(tmp_path / "bad.csv", [row]))


def test_main_prints_stats(tmp_path, users, monkeypatch, capsys):
    f = _write(tmp_path / "m.csv", [{"name": "Bệnh viện Thử Main", "province": "Gia Lai", "facility_type": "Hospital"}])
    monkeypatch.setattr("sys.argv", ["seed", "--file", str(f)])
    assert seed_mod.main() == 0
    assert "Mới: 1" in capsys.readouterr().out
