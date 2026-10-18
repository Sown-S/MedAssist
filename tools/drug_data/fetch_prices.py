"""Tham khảo giá bán lẻ công khai (Nhà thuốc Long Châu, Pharmacity) cho data/drugs.csv — BÁN TỰ ĐỘNG.

Chạy trong tools/:
    python -m drug_data.fetch_prices refresh                 # CÁCH DÙNG CHÍNH: đọc giá từ product_url dán tay
    python -m drug_data.fetch_prices search [--auto] [--only-missing] [--limit 20]   # xem TRẠNG THÁI bên dưới

TRẠNG THÁI (18/10/2026, đã thử trên trang thật): 'search' KHÔNG tìm được sản phẩm —
  * Long Châu: robots.txt không cho công cụ tự động truy cập trang tìm kiếm (/tim-kiem) -> script dừng đúng quy định.
  * Pharmacity: trang tìm kiếm chỉ là khung Next.js, kết quả tải bằng JavaScript sau khi mở trang -> HTML thô
    không có sản phẩm. Không gọi API nội bộ, không dùng trình duyệt tự động (quyết định của nhóm).
  => Thuốc chưa có giá: python -m drug_data.estimate_prices. Cần giá thật cho thuốc nào: mở trang sản phẩm trên
     trình duyệt, dán đường dẫn vào cột product_url của output/price_review.csv (thêm dòng: generic_name,
     trade_name, strength như drugs.csv), chạy 'refresh', duyệt (cột duyet = x), rồi 'apply'.
    python -m drug_data.fetch_prices apply                   # ghi các dòng đã duyệt (cột duyet = x) vào drugs.csv

--auto: giá có ĐỘ TIN CẬY CAO được ghi thẳng vào server/data/drugs.csv (duyet = auto); còn lại vào
output/price_review.csv để duyệt tay. Độ tin cậy cao = tên thuốc + hàm lượng khớp tên sản phẩm, quy được ra
giá/đơn vị, giá đọc từ JSON-LD hoặc thẻ meta, và nếu cả hai trang có giá thì chênh lệch <= 30%.

Nguyên tắc thu thập: chỉ đọc giá hiển thị công khai; đọc robots.txt và DỪNG với trang không cho phép;
User-Agent khai báo rõ (không giả trình duyệt); giãn cách mặc định 3 giây/lần; lưu mọi trang đã tải
(data/sources/prices/cache) làm minh chứng. Đọc điều khoản sử dụng của từng trang trước khi chạy.
Giao diện các trang có thể thay đổi: SITES bên dưới là cấu hình mặc định, sửa được qua tham số dòng lệnh.
"""
import argparse
import hashlib
import html
import json
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from urllib.parse import quote_plus, urljoin, urlparse
from urllib.robotparser import RobotFileParser

from drug_data.tt19_catalog import DRUGS_CSV, OUTPUT_DIR, TOOL_DIR, _numbers, read_csv, strip_accents, write_csv

DATA_DIR = TOOL_DIR                                   # đường dẫn cache_file trong file duyệt tính từ đây
PRICE_DIR = TOOL_DIR / "sources" / "prices"
CACHE_DIR = PRICE_DIR / "cache"
APPROVED_DIR = PRICE_DIR / "approved"
REVIEW_CSV = OUTPUT_DIR / "price_review.csv"
AUTO_MAX_SPREAD = Decimal("1.30")                     # hai trang lệch nhau quá 30% -> phải duyệt tay

SITES = {
    "longchau": {"name": "Nhà thuốc Long Châu", "base": "https://nhathuoclongchau.com.vn",
                 "search": "/tim-kiem?s={q}", "product_re": r'href="((?:https://nhathuoclongchau\.com\.vn)?/thuoc/[^"#?]+\.html)"'},
    "pharmacity": {"name": "Pharmacity", "base": "https://www.pharmacity.vn",
                   "search": "/search?keyword={q}", "product_re": r'href="((?:https://www\.pharmacity\.vn)?/[a-z0-9-]+\.html)"'},
}
REVIEW_FIELDS = ["duyet", "gia_ban_duyet", "generic_name", "trade_name", "strength", "dosage_form", "unit",
                 "gia_hien_tai", "site", "query", "product_name", "product_url", "retrieved_at", "listed_price",
                 "pack_text", "units_per_pack", "price_per_unit", "match_score", "note", "cache_file"]
PRODUCTS_PER_QUERY = 3


# ============================================================================ HTTP lịch sự
class PoliteClient:
    def __init__(self, client, contact: str, delay: float):
        self.client, self.delay, self._last = client, delay, 0.0
        self.ua = f"MedAssist-C1SE28-price-check/0.1 (do an tot nghiep; lien he: {contact})"
        self._robots: dict[str, RobotFileParser | None] = {}

    def _robots_for(self, url: str) -> RobotFileParser | None:
        root = "{0.scheme}://{0.netloc}".format(urlparse(url))
        if root not in self._robots:
            rp = RobotFileParser()
            try:
                r = self._get(root + "/robots.txt")
                if r.status_code >= 500:
                    rp = None                                     # không đọc được robots: không thu thập
                elif r.status_code >= 400:
                    rp.parse([])                                  # không có robots.txt: được phép
                else:
                    rp.parse(r.text.splitlines())
            except Exception:
                rp = None
            self._robots[root] = rp
        return self._robots[root]

    def allowed(self, url: str) -> bool:
        rp = self._robots_for(url)
        return rp is not None and rp.can_fetch(self.ua, url)

    def _get(self, url: str):
        wait = self.delay - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
        return self.client.get(url, headers={"User-Agent": self.ua}, follow_redirects=True, timeout=30)

    def fetch(self, url: str, site: str) -> tuple[str, str]:
        """Trả (html, đường dẫn file lưu). Lỗi robots/HTTP -> PermissionError / RuntimeError."""
        if not self.allowed(url):
            raise PermissionError(f"robots.txt không cho phép: {url}")
        r = self._get(url)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}: {url}")
        digest = hashlib.sha256(url.encode()).hexdigest()[:16]
        path = CACHE_DIR / site / f"{digest}.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"<!-- url: {url} | retrieved_at: {_now()} -->\n" + r.text, encoding="utf-8")
        return r.text, str(path.relative_to(DATA_DIR))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ============================================================================ đọc trang sản phẩm
def _walk(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk(v)


def parse_product(page: str) -> dict:
    """Tên + giá theo thứ tự tin cậy: JSON-LD schema.org Product -> thẻ meta -> __NEXT_DATA__."""
    for block in re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S | re.I):
        try:
            data = json.loads(html.unescape(block.strip()))
        except ValueError:
            continue
        for node in _walk(data):
            types = node.get("@type")
            if (types == "Product" or (isinstance(types, list) and "Product" in types)) and node.get("offers"):
                offers = node["offers"]
                offer = offers[0] if isinstance(offers, list) else offers
                price = offer.get("price") or offer.get("lowPrice")
                if price not in (None, ""):
                    return {"name": _txt(node.get("name")), "price": Decimal(str(price)), "how": "json-ld",
                            "description": _txt(node.get("description"))}
    meta_price = re.search(r'<meta[^>]+property="product:price:amount"[^>]+content="([\d.]+)"', page, re.I)
    title = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', page, re.I)
    if meta_price:
        return {"name": _txt(title.group(1) if title else ""), "price": Decimal(meta_price.group(1)), "how": "meta",
                "description": ""}
    nd = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if nd:
        m = re.search(r'"price"\s*:\s*(\d{3,9})', nd.group(1))
        if m:
            return {"name": _txt(title.group(1) if title else ""), "price": Decimal(m.group(1)),
                    "how": "next-data (độ tin cậy thấp)", "description": ""}
    return {}


def _txt(s) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(s or "")))).strip()


_PACK_PATTERNS = [
    (re.compile(r"(?:hộp|hop)\s*(\d+)\s*(?:vỉ|vi|túi|tui)\s*x\s*(\d+)\s*(viên|vien|gói|goi|ống|ong)", re.I), "a*b"),
    (re.compile(r"(?:hộp|hop)\s*(\d+)\s*(viên|vien|gói|goi|ống|ong|chai|lọ|lo|tuýp|tuyp)", re.I), "a"),
    (re.compile(r"(?:vỉ|vi)\s*(\d+)\s*(viên|vien)", re.I), "a"),
    (re.compile(r"(chai|lọ|lo|tuýp|tuyp|bình|binh|ống xịt|bình xịt)\s*(?:x\s*)?\d+(?:[.,]\d+)?\s*(?:ml|g|liều|lieu)", re.I), "1"),
]
_UNIT_ALIASES = {"vien": "viên", "goi": "gói", "ong": "ống", "lo": "lọ", "tuyp": "tuýp", "binh": "bình"}


def parse_pack(text: str) -> tuple[str, int | None, str]:
    """Quy cách đóng gói -> (đoạn văn bản, số đơn vị/gói hàng, đơn vị). Không chắc -> (.., None, '')."""
    for pat, kind in _PACK_PATTERNS:
        m = pat.search(text or "")
        if not m:
            continue
        if kind == "a*b":
            unit = strip_accents(m.group(3))
            return m.group(0), int(m.group(1)) * int(m.group(2)), _UNIT_ALIASES.get(unit, m.group(3).lower())
        if kind == "a":
            unit = strip_accents(m.group(2))
            return m.group(0), int(m.group(1)), _UNIT_ALIASES.get(unit, m.group(2).lower())
        container = strip_accents(m.group(1)).split()[-1]
        return m.group(0), 1, _UNIT_ALIASES.get(container, container)
    return "", None, ""


def per_unit_price(listed: Decimal, units: int | None, pack_unit: str, our_unit: str) -> Decimal | None:
    if units is None:
        return None
    same = strip_accents(pack_unit) == strip_accents(our_unit) or (
        units == 1 and strip_accents(our_unit) in {"chai", "lo", "tuyp", "binh"})
    if not same:
        return None
    return (listed / units).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def match_score(drug: dict, product_name: str) -> tuple[int, list[str]]:
    name = strip_accents(product_name)
    score, notes = 0, []
    if _numbers(drug["strength"]) <= _numbers(product_name):
        score += 2
    else:
        notes.append("hàm lượng không thấy trong tên sản phẩm")
    brand = strip_accents(re.split(r"\s+\d", drug["trade_name"])[0])
    if brand and brand in name:
        score += 2
    elif strip_accents(drug["generic_name"].split()[0]) in name:
        score += 1
        notes.append("chỉ khớp hoạt chất, khác tên thương mại")
    else:
        notes.append("tên sản phẩm không chứa tên thuốc")
    return score, notes


# ============================================================================ search / refresh / apply
def _query(drug: dict) -> str:
    trade = drug["trade_name"]
    generic_like = strip_accents(trade).startswith(strip_accents(drug["generic_name"].split()[0]))
    return trade if not generic_like else f"{drug['generic_name']} {drug['strength']}"


def _row_from_product(drug, site, query, url, page, cache_file) -> dict:
    p = parse_product(page)
    row = {"generic_name": drug["generic_name"], "trade_name": drug["trade_name"], "strength": drug["strength"],
           "dosage_form": drug["dosage_form"], "unit": drug["unit"], "gia_hien_tai": drug.get("sale_price", ""),
           "site": site, "query": query, "product_url": url, "retrieved_at": _now(), "cache_file": cache_file}
    if not p:
        return {**row, "match_score": 0, "note": "không đọc được giá trên trang"}
    pack_text, units, pack_unit = parse_pack(p["name"] + " " + p["description"] + " " + _txt(page)[:20000])
    ppu = per_unit_price(p["price"], units, pack_unit, drug["unit"])
    score, notes = match_score(drug, p["name"])
    if ppu is None:
        notes.append("không quy được ra giá/đơn vị — tự tính và ghi gia_ban_duyet")
    notes.append(f"giá đọc từ {p['how']}")
    return {**row, "product_name": p["name"], "listed_price": str(p["price"].normalize()), "pack_text": pack_text,
            "units_per_pack": units or "", "price_per_unit": ppu if ppu is not None else "",
            "match_score": score, "note": "; ".join(notes)}


def high_confidence(row: dict) -> bool:
    return (str(row.get("match_score")) == "4" and str(row.get("price_per_unit", "")) not in ("", "None")
            and "next-data" not in (row.get("note") or ""))


def mark_auto(rows: list[dict]) -> Decimal | None:
    """Các dòng của MỘT thuốc (mỗi trang một dòng). Đủ tin cậy -> ghi duyet = auto, gia_ban_duyet = giá
    trung bình các trang (làm tròn 100 đ) và trả giá; không thì để trống cho người duyệt."""
    good = [r for r in rows if high_confidence(r)]
    if not good:
        return None
    prices = [Decimal(str(r["price_per_unit"])) for r in good]
    if max(prices) > min(prices) * AUTO_MAX_SPREAD:
        for r in good:
            r["note"] = (r.get("note") or "") + "; các trang lệch nhau > 30% — duyệt tay"
        return None
    avg = sum(prices) / len(prices)
    price = (avg / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 100 if avg >= 1000 else avg.quantize(Decimal("1"))
    best = max(good, key=lambda r: r["site"] == "longchau")      # giữ 1 dòng làm minh chứng chính
    best.update(duyet="auto", gia_ban_duyet=str(price))
    if len(good) > 1:
        best["note"] = (best.get("note") or "") + f"; trung bình {len(good)} trang"
    return price


def search(client: PoliteClient, drugs: list[dict], sites: list[str], log=print, auto: bool = False) -> list[dict]:
    rows = []
    for drug in drugs:
        drug_rows_start = len(rows)
        query = _query(drug)
        for key in sites:
            cfg = SITES[key]
            url = cfg["base"] + cfg["search"].format(q=quote_plus(query))
            base = {"generic_name": drug["generic_name"], "trade_name": drug["trade_name"],
                    "strength": drug["strength"], "dosage_form": drug["dosage_form"], "unit": drug["unit"],
                    "gia_hien_tai": drug.get("sale_price", ""), "site": key, "query": query, "match_score": 0}
            try:
                page, _ = client.fetch(url, key)
            except (PermissionError, RuntimeError) as exc:
                log(f"  {key}: {exc}")
                rows.append({**base, "note": str(exc), "retrieved_at": _now()})
                continue
            links = list(dict.fromkeys(urljoin(cfg["base"], h) for h in re.findall(cfg["product_re"], page)))
            found = []
            for link in links[:PRODUCTS_PER_QUERY]:
                try:
                    ppage, cache = client.fetch(link, key)
                except (PermissionError, RuntimeError) as exc:
                    log(f"  {key}: {exc}")
                    continue
                found.append(_row_from_product(drug, key, query, link, ppage, cache))
            if not found:
                rows.append({**base, "note": "không tìm thấy sản phẩm — dán product_url bằng tay rồi chạy refresh",
                             "retrieved_at": _now()})
                continue
            best = max(found, key=lambda r: int(r["match_score"]))
            rows.append(best)
            log(f"  {key}: {best.get('product_name', '?')} -> {best.get('price_per_unit') or best.get('listed_price')}")
        if auto:
            price = mark_auto(rows[drug_rows_start:])
            log(f"  => {'TỰ GHI ' + str(price) if price else 'cần duyệt tay'}: {drug['trade_name']}")
    return rows


def refresh(client: PoliteClient, review: list[dict], drugs: list[dict], refetch_all: bool, log=print) -> list[dict]:
    by_key = {(d["generic_name"], d["trade_name"], d["strength"]): d for d in drugs}
    out = []
    for row in review:
        url = (row.get("product_url") or "").strip()
        if not url or (row.get("listed_price") and not refetch_all):
            out.append(row)
            continue
        drug = by_key.get((row["generic_name"], row["trade_name"], row["strength"]))
        site = next((k for k, c in SITES.items() if urlparse(c["base"]).netloc == urlparse(url).netloc), "khac")
        try:
            page, cache = client.fetch(url, site)
            new = _row_from_product(drug or row, site, row.get("query", ""), url, page, cache)
            out.append({**new, "duyet": row.get("duyet", ""), "gia_ban_duyet": row.get("gia_ban_duyet", "")})
            log(f"  {row['trade_name']}: {new.get('listed_price', '?')}")
        except (PermissionError, RuntimeError) as exc:
            out.append({**row, "note": str(exc)})
    return out


def apply(review: list[dict], fields: list[str], drugs: list[dict]) -> tuple[list[str], list[dict], list[str]]:
    """Dòng duyet = x -> sale_price (gia_ban_duyet nếu có, không thì price_per_unit). Trả (fields, drugs, vấn đề)."""
    for extra in ("price_source", "price_retrieved_at"):
        if extra not in fields:
            fields = fields + [extra]
    problems, chosen = [], {}
    for n, r in enumerate(review, start=2):
        if (r.get("duyet") or "").strip().lower() not in {"x", "1", "có", "co", "auto"}:
            continue
        price = (r.get("gia_ban_duyet") or r.get("price_per_unit") or "").strip()
        if not re.fullmatch(r"\d+(\.\d+)?", price or "x"):
            problems.append(f"dòng {n}: chưa có giá/đơn vị — ghi gia_ban_duyet")
            continue
        key = (r["generic_name"], r["trade_name"], r["strength"])
        if key in chosen:
            problems.append(f"dòng {n}: {r['trade_name']} đã được duyệt ở dòng khác")
            continue
        chosen[key] = (price, r)
    updated = []
    for d in drugs:
        hit = chosen.get((d["generic_name"], d["trade_name"], d["strength"]))
        if hit:
            price, r = hit
            d = {**d, "sale_price": str(int(Decimal(price))), "price_source": r.get("product_url", ""),
                 "price_retrieved_at": (r.get("retrieved_at") or "")[:10]}
            if r.get("cache_file") and (DATA_DIR / r["cache_file"]).exists():
                APPROVED_DIR.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(DATA_DIR / r["cache_file"], APPROVED_DIR / Path(r["cache_file"]).name)
        updated.append(d)
    missing = set(chosen) - {(d["generic_name"], d["trade_name"], d["strength"]) for d in drugs}
    problems += [f"không có trong drugs.csv: {k[1]}" for k in missing]
    return fields, updated, problems


# ============================================================================ CLI
def _contact(args) -> str:
    if args.contact:
        return args.contact
    from drug_data.tt19_catalog import load_config
    return load_config().get("gia", {}).get("email_lien_he", "")


def _client(args):
    try:
        import httpx
    except ImportError:
        raise SystemExit("Thiếu thư viện: pip install -r drug_data/requirements.txt") from None
    contact = _contact(args)
    if not contact or "@" not in contact:
        raise SystemExit("Cần email liên hệ: điền email_lien_he trong drug_data/config.toml (hoặc --contact).")
    return PoliteClient(httpx.Client(), contact, args.delay)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Tham khảo giá bán lẻ (bán tự động, cần duyệt)")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("search", "refresh"):
        s = sub.add_parser(name)
        s.add_argument("--contact", default="", help="Email khai báo trong User-Agent (mặc định: config.toml)")
        s.add_argument("--delay", type=float, default=3.0, help="Giây giữa hai lần tải (tối thiểu 2)")
    s = sub.choices["search"]
    s.add_argument("--sites", default="longchau,pharmacity")
    s.add_argument("--only-missing", action="store_true", help="Chỉ thuốc chưa có giá")
    s.add_argument("--limit", type=int, default=0, help="Giới hạn số thuốc (thử nghiệm)")
    s.add_argument("--auto", action="store_true", help="Ghi thẳng giá có độ tin cậy cao vào drugs.csv")
    sub.choices["refresh"].add_argument("--all", action="store_true", help="Tải lại cả dòng đã có giá")
    sub.add_parser("apply")
    args = p.parse_args(argv)
    fields, drugs = read_csv(DRUGS_CSV)
    if args.cmd in ("search", "refresh") and args.delay < 2:
        raise SystemExit("--delay tối thiểu 2 giây")
    if args.cmd == "search":
        sites = [s.strip() for s in args.sites.split(",") if s.strip() in SITES]
        targets = [d for d in drugs if not args.only_missing or not d.get("sale_price", "").strip()]
        if args.limit:
            targets = targets[:args.limit]
        print("LƯU Ý: 'search' hiện không tìm được sản phẩm (Long Châu chặn bằng robots.txt, Pharmacity hiển thị "
              "kết quả bằng JavaScript). Dùng estimate_prices, hoặc dán product_url rồi 'refresh'. Vẫn chạy thử...")
        print(f"Tra giá {len(targets)} thuốc trên {', '.join(SITES[s]['name'] for s in sites)}...")
        rows = search(_client(args), targets, sites, auto=args.auto)
        if args.auto:
            auto_rows = [r for r in rows if r.get("duyet") == "auto"]
            fields, updated, problems = apply(auto_rows, fields, drugs)
            for pr in problems:
                print("  BỎ QUA", pr)
            write_csv(DRUGS_CSV, fields, updated)
            print(f"Tự ghi giá {len(auto_rows)} thuốc vào {DRUGS_CSV.name}.")
            rows = [{**r, "duyet": "da-ghi-auto"} if r.get("duyet") == "auto" else r for r in rows]
        old = read_csv(REVIEW_CSV)[1] if REVIEW_CSV.exists() else []
        write_csv(REVIEW_CSV, REVIEW_FIELDS, old + rows, excel=True)
        pending = sum(1 for r in rows if not r.get("duyet"))
        print(f"Đã ghi {len(rows)} dòng vào {REVIEW_CSV.name} ({pending} dòng cần duyệt: cột duyet = x rồi 'apply').")
    elif args.cmd == "refresh":
        _, review = read_csv(REVIEW_CSV)
        write_csv(REVIEW_CSV, REVIEW_FIELDS, refresh(_client(args), review, drugs, args.all), excel=True)
        print(f"Đã cập nhật {REVIEW_CSV.name}.")
    else:
        _, review = read_csv(REVIEW_CSV)
        fields, updated, problems = apply(review, fields, drugs)
        for pr in problems:
            print("  BỎ QUA", pr)
        changed = sum(1 for a, b in zip(drugs, updated) if a.get("sale_price") != b.get("sale_price"))
        write_csv(DRUGS_CSV, fields, updated)
        print(f"Đã cập nhật giá {changed} thuốc; trang minh chứng chép vào {APPROVED_DIR.relative_to(TOOL_DIR)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
