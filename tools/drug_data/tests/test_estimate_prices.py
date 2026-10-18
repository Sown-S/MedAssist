"""drug_data/estimate_prices.py: ước tính giá theo cùng hoạt chất -> trung vị nhóm -> trung vị đơn vị."""
from drug_data import estimate_prices as ep
from drug_data import tt19_catalog as tt


def D(generic, trade, strength, form, unit, price="", cls=""):
    return {"generic_name": generic, "trade_name": trade, "strength": strength, "dosage_form": form, "unit": unit,
            "sale_price": price, "drug_class": cls, "import_price": "", "batch_quantity": "", "shelf_life_days": ""}


BASE = [D("Diclofenac", "Voltaren 50", "50 mg", "viên nén bao tan ở ruột", "viên", "3500", "Giảm đau"),
        D("Ibuprofen", "Gofen 400", "400 mg", "viên nang mềm", "viên", "2500", "Giảm đau"),
        D("Meloxicam", "Mobic 7.5", "7,5 mg", "viên nén", "viên", "5500", "Giảm đau"),
        D("Oresol", "Oresol 245", "4,1 g", "gói bột pha dung dịch uống", "gói", "2500", "Bù nước")]


def test_same_active_ingredient_scaled_and_clamped():
    out, _ = ep.estimate(BASE + [D("Diclofenac", "Diclofenac 25 mg", "25 mg", "viên", "viên"),
                                 D("Diclofenac", "Diclofenac 100 mg", "100 mg", "viên", "viên"),
                                 D("Diclofenac", "Diclofenac 5 mg", "5 mg", "viên", "viên")])
    got = {d["trade_name"]: d for d in out}
    assert got["Diclofenac 25 mg"]["sale_price"] == "1800"        # 3500 x 0,5 = 1750 -> 1800
    assert got["Diclofenac 100 mg"]["sale_price"] == "7000"       # x2
    assert got["Diclofenac 5 mg"]["sale_price"] == "1800"         # tỉ lệ 0,1 bị giới hạn 0,5
    assert got["Diclofenac 25 mg"]["price_source"].startswith("uoc-tinh:cung-hoat-chat (Voltaren 50)")


def test_group_median_then_unit_median_and_no_overwrite():
    out, log = ep.estimate(BASE + [D("Piroxicam", "Piroxicam 20 mg", "20 mg", "viên", "viên", cls="Giảm đau"),
                                   D("Kẽm", "Kẽm 10 mg", "10 mg", "gói cốm", "gói", cls="Vi chất"),
                                   D("X", "X 1%", "1%", "kem", "tuýp")])
    got = {d["trade_name"]: d for d in out}
    assert got["Piroxicam 20 mg"]["sale_price"] == "3500"         # trung vị 2500, 3500, 5500
    assert "trung-vi-nhom" in got["Piroxicam 20 mg"]["price_source"]
    assert got["Kẽm 10 mg"]["sale_price"] == "2500" and "trung-vi-don-vi" in got["Kẽm 10 mg"]["price_source"]
    assert got["X 1%"]["sale_price"] == "" and any("KHÔNG ước tính" in x for x in log)
    assert got["Voltaren 50"] == BASE[0]                         # giá có sẵn giữ nguyên


def test_with_batch_fills_stock_fields():
    out, _ = ep.estimate(BASE + [D("Diclofenac", "Diclofenac 25 mg", "25 mg", "viên", "viên")], with_batch=True)
    d = out[-1]
    assert (d["import_price"], d["batch_quantity"], d["shelf_life_days"]) == ("1200", "200", "720")


def test_cli_on_copy(tmp_path, monkeypatch):
    f = tmp_path / "drugs.csv"
    tt.write_csv(f, list(BASE[0]) + ["source"], BASE + [D("Diclofenac", "Diclofenac 25 mg", "25 mg", "viên", "viên")])
    monkeypatch.setattr(ep, "DRUGS_CSV", f)
    assert ep.main(["--dry-run"]) == 0
    assert tt.read_csv(f)[1][-1]["sale_price"] == ""             # dry-run không ghi
    assert ep.main([]) == 0
    fields, rows = tt.read_csv(f)
    assert rows[-1]["sale_price"] == "1800" and "price_source" in fields
