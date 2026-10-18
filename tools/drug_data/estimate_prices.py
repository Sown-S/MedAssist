"""Ước tính giá bán cho thuốc CHƯA có giá trong server/data/drugs.csv (dùng khi không tra được giá web).

    python -m drug_data.estimate_prices              # điền sale_price còn trống
    python -m drug_data.estimate_prices --with-batch # + giá nhập, lô ban đầu để demo cấp phát được
    python -m drug_data.estimate_prices --dry-run    # chỉ in, không ghi

Quy tắc (theo thứ tự, dừng ở quy tắc đầu tiên áp dụng được):
  1. cung-hoat-chat : thuốc CÙNG hoạt chất, CÙNG dạng bào chế đã có giá -> lấy giá thuốc có hàm lượng gần nhất,
                      điều chỉnh theo tỉ lệ hàm lượng (giới hạn 0,5–2 lần).
  2. trung-vi-nhom  : giá trung vị các thuốc cùng nhóm (drug_class) và cùng đơn vị bán.
  3. trung-vi-don-vi: giá trung vị các thuốc cùng đơn vị bán (viên, gói, chai...).
Giá làm tròn 100 đ. Không ghi đè giá đã có. Cột price_source ghi 'uoc-tinh:<quy tắc>' — giá tra được
sau đó (fetch_prices apply) sẽ ghi đè. Chỉ ĐỌC/GHI drugs.csv, không truy cập mạng.
"""
import argparse
import statistics
import sys
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from drug_data.tt19_catalog import DRUGS_CSV, _numbers, _our_category, read_csv, strip_accents, write_csv

IMPORT_RATIO = Decimal("0.65")                                  # giá nhập ước tính = 65% giá bán
DEFAULT_BATCH = {"viên": 200, "gói": 100, "chai": 20, "lọ": 20, "tuýp": 20, "bình": 10, "ống": 50}
SHELF_LIFE_DAYS = 720


def _round100(x: Decimal) -> int:
    return max(100, int((x / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 100))


def _first_number(strength: str) -> Decimal | None:
    nums = sorted(_numbers(strength), key=lambda n: strength.find(n.split(".")[0]))
    return Decimal(nums[0]) if nums else None


def _key(s: str) -> str:
    return strip_accents(s).strip()


def estimate(drugs: list[dict], with_batch: bool = False) -> tuple[list[dict], list[str]]:
    priced = [d for d in drugs if (d.get("sale_price") or "").strip()]
    log, out = [], []
    for d in drugs:
        if (d.get("sale_price") or "").strip():
            out.append(d)
            continue
        price, rule = None, ""
        # 1. cùng hoạt chất + cùng dạng bào chế
        same = [p for p in priced if _key(p["generic_name"]) == _key(d["generic_name"])
                and _our_category(p["dosage_form"]) == _our_category(d["dosage_form"]) and p["unit"] == d["unit"]]
        mine = _first_number(d["strength"])
        if same:
            ref = min(same, key=lambda p: abs((_first_number(p["strength"]) or 0) - (mine or 0)))
            ratio = Decimal(1)
            theirs = _first_number(ref["strength"])
            if mine and theirs:
                ratio = min(max(mine / theirs, Decimal("0.5")), Decimal(2))
            price, rule = Decimal(ref["sale_price"]) * ratio, f"cung-hoat-chat ({ref['trade_name']})"
        # 2. trung vị nhóm + đơn vị
        if price is None:
            grp = [Decimal(p["sale_price"]) for p in priced
                   if p.get("drug_class") and p["drug_class"] == d.get("drug_class") and p["unit"] == d["unit"]]
            if len(grp) >= 2:
                price, rule = Decimal(statistics.median(grp)), f"trung-vi-nhom ({d['drug_class']}, {len(grp)} thuốc)"
        # 3. trung vị đơn vị
        if price is None:
            unit = [Decimal(p["sale_price"]) for p in priced if p["unit"] == d["unit"]]
            if unit:
                price, rule = Decimal(statistics.median(unit)), f"trung-vi-don-vi ({d['unit']}, {len(unit)} thuốc)"
        if price is None:
            log.append(f"  KHÔNG ước tính được: {d['trade_name']} (đơn vị '{d['unit']}' chưa có thuốc nào có giá)")
            out.append(d)
            continue
        sale = _round100(price)
        new = {**d, "sale_price": str(sale), "price_source": f"uoc-tinh:{rule}",
               "price_retrieved_at": date.today().isoformat()}
        if with_batch and not (d.get("batch_quantity") or "").strip():
            new.update(import_price=str(_round100(Decimal(sale) * IMPORT_RATIO) if sale >= 200 else max(50, sale // 2)),
                       batch_quantity=str(DEFAULT_BATCH.get(d["unit"], 50)), shelf_life_days=str(SHELF_LIFE_DAYS))
        log.append(f"  {d['trade_name']:<45} {sale:>8} đ  <- {rule}")
        out.append(new)
    return out, log


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Ước tính giá cho thuốc chưa có giá trong drugs.csv")
    p.add_argument("--with-batch", action="store_true", help="Điền thêm giá nhập + lô ban đầu (để demo cấp phát)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ in kết quả, không ghi file")
    args = p.parse_args(argv)
    fields, drugs = read_csv(DRUGS_CSV)
    for extra in ("price_source", "price_retrieved_at"):
        if extra not in fields:
            fields.append(extra)
    updated, log = estimate(drugs, with_batch=args.with_batch)
    print("\n".join(log))
    filled = sum(1 for a, b in zip(drugs, updated) if not a.get("sale_price") and b.get("sale_price"))
    if not args.dry_run:
        write_csv(DRUGS_CSV, fields, updated)
    print(f"{'(thử) ' if args.dry_run else ''}Ước tính giá {filled} thuốc"
          f"{' + lô ban đầu' if args.with_batch else ''} -> {DRUGS_CSV.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
