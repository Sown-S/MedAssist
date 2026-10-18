"""scripts/fetch_prices.py: đọc giá (JSON-LD/meta), quy cách, robots.txt, luồng search -> duyệt -> apply.
Dùng httpx.MockTransport — không truy cập mạng."""
from decimal import Decimal

import httpx
import pytest

from drug_data import fetch_prices as fp

PANADOL = {"generic_name": "Paracetamol", "trade_name": "Panadol", "strength": "500 mg", "dosage_form": "viên nén",
           "unit": "viên", "sale_price": "1500"}
SYRUP = {"generic_name": "Clorpheniramin maleat", "trade_name": "Clorpheniramin 0,4 mg/ml", "strength": "0,4 mg/ml",
         "dosage_form": "sirô, chai 60 ml", "unit": "chai", "sale_price": "15000"}


def product_page(name, price, extra=""):
    return f"""<html><head><meta property="og:title" content="{name}">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"Product","name":"{name}",
"offers":{{"@type":"Offer","price":"{price}","priceCurrency":"VND"}}}}</script></head>
<body><h1>{name}</h1><p>Quy cách: {extra}</p></body></html>"""


def test_parse_product_jsonld_meta_and_none():
    p = fp.parse_product(product_page("Panadol 500mg hộp 12 vỉ x 10 viên", "198000"))
    assert p["price"] == Decimal("198000") and p["how"] == "json-ld" and "Panadol" in p["name"]
    meta = '<meta property="og:title" content="Thuốc X 10mg"><meta property="product:price:amount" content="45000">'
    assert fp.parse_product(meta)["price"] == Decimal("45000")
    assert fp.parse_product("<html>không có giá</html>") == {}


@pytest.mark.parametrize("text,units,unit", [
    ("Hộp 12 vỉ x 10 viên", 120, "viên"), ("Hộp 10 vỉ x 10 Viên nang", 100, "viên"),
    ("Hộp 30 gói x 1,5g", 30, "gói"), ("Chai 60ml", 1, "chai"), ("Lọ 10 ml", 1, "lọ"),
    ("Tuýp 20g", 1, "tuýp"), ("không rõ", None, "")])
def test_parse_pack(text, units, unit):
    _, n, u = fp.parse_pack(text)
    assert (n, u) == (units, unit)


def test_per_unit_and_match():
    assert fp.per_unit_price(Decimal("198000"), 120, "viên", "viên") == Decimal("1650")
    assert fp.per_unit_price(Decimal("35000"), 1, "chai", "chai") == Decimal("35000")
    assert fp.per_unit_price(Decimal("198000"), 120, "viên", "gói") is None
    assert fp.match_score(PANADOL, "Panadol 500mg hộp 12 vỉ")[0] == 4
    score, notes = fp.match_score(PANADOL, "Hapacol 650mg")
    assert score == 0 and len(notes) == 2


def _transport(routes: dict, seen: list):
    def handler(request: httpx.Request):
        seen.append(str(request.url))
        assert "MedAssist-C1SE28" in request.headers["user-agent"] and "sv@dtu.edu.vn" in request.headers["user-agent"]
        for prefix, (status, body) in routes.items():
            if str(request.url).startswith(prefix):
                return httpx.Response(status, text=body)
        return httpx.Response(404, text="")
    return httpx.MockTransport(handler)


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    monkeypatch.setattr(fp, "DATA_DIR", tmp_path)
    monkeypatch.setattr(fp, "CACHE_DIR", tmp_path / "sources" / "prices" / "cache")
    monkeypatch.setattr(fp, "APPROVED_DIR", tmp_path / "sources" / "prices" / "approved")
    return tmp_path


def test_robots_disallow_stops_before_fetch(sandbox):
    seen = []
    routes = {"https://nhathuoclongchau.com.vn/robots.txt": (200, "User-agent: *\nDisallow: /tim-kiem\n")}
    client = fp.PoliteClient(httpx.Client(transport=_transport(routes, seen)), "sv@dtu.edu.vn", delay=0)
    rows = fp.search(client, [PANADOL], ["longchau"], log=lambda *_: None)
    assert "robots.txt không cho phép" in rows[0]["note"]
    assert seen == ["https://nhathuoclongchau.com.vn/robots.txt"]            # không tải trang tìm kiếm


def test_robots_unreachable_means_no_crawl(sandbox):
    routes = {"https://www.pharmacity.vn/robots.txt": (503, "")}
    client = fp.PoliteClient(httpx.Client(transport=_transport(routes, [])), "sv@dtu.edu.vn", delay=0)
    assert client.allowed("https://www.pharmacity.vn/search?q=x") is False


def test_search_review_apply_flow(sandbox):
    seen = []
    lc = "https://nhathuoclongchau.com.vn"
    routes = {
        lc + "/robots.txt": (200, "User-agent: *\nDisallow: /gio-hang\n"),
        lc + "/tim-kiem": (200, '<a href="/thuoc/hapacol-650.html">x</a><a href="/thuoc/panadol-500mg.html">y</a>'),
        lc + "/thuoc/panadol-500mg.html": (200, product_page("Panadol 500mg", "198000", "Hộp 12 vỉ x 10 viên")),
        lc + "/thuoc/hapacol-650.html": (200, product_page("Hapacol 650mg", "50000", "Hộp 10 vỉ x 10 viên")),
    }
    client = fp.PoliteClient(httpx.Client(transport=_transport(routes, seen)), "sv@dtu.edu.vn", delay=0)
    (row,) = fp.search(client, [PANADOL], ["longchau"], log=lambda *_: None)
    assert row["product_name"] == "Panadol 500mg" and row["price_per_unit"] == Decimal("1650")
    assert row["units_per_pack"] == 120 and row["match_score"] == 4
    assert (sandbox / row["cache_file"]).read_text(encoding="utf-8").startswith("<!-- url: " + lc)

    fields = ["generic_name", "trade_name", "strength", "dosage_form", "unit", "sale_price"]
    # chưa duyệt: không đổi gì
    f2, same, problems = fp.apply([{**row, "duyet": ""}], fields, [PANADOL])
    assert same[0]["sale_price"] == "1500" and problems == []
    # duyệt, người duyệt làm tròn giá
    f2, updated, problems = fp.apply([{**row, "duyet": "x", "gia_ban_duyet": "1700"}], fields, [PANADOL, SYRUP])
    assert f2[-2:] == ["price_source", "price_retrieved_at"]
    assert updated[0]["sale_price"] == "1700" and updated[0]["price_source"].endswith("panadol-500mg.html")
    assert updated[1] == SYRUP
    assert list((sandbox / "sources" / "prices" / "approved").iterdir())     # trang minh chứng được chép


def test_apply_rejects_missing_price_and_duplicates():
    row = {"generic_name": "Paracetamol", "trade_name": "Panadol", "strength": "500 mg", "duyet": "x"}
    _, _, problems = fp.apply([row], ["generic_name", "trade_name", "strength", "sale_price"], [PANADOL])
    assert "chưa có giá" in problems[0]
    ok = {**row, "price_per_unit": "1650"}
    _, _, problems = fp.apply([ok, ok], ["generic_name", "trade_name", "strength", "sale_price"], [PANADOL])
    assert "đã được duyệt ở dòng khác" in problems[0]


def test_refresh_uses_manual_url(sandbox):
    url = "https://www.pharmacity.vn/clorpheniramin-siro.html"
    routes = {"https://www.pharmacity.vn/robots.txt": (404, ""),
              url: (200, product_page("Clorpheniramin 0,4mg/ml siro", "16000", "Chai 60ml"))}
    client = fp.PoliteClient(httpx.Client(transport=_transport(routes, [])), "sv@dtu.edu.vn", delay=0)
    review = [{"generic_name": SYRUP["generic_name"], "trade_name": SYRUP["trade_name"], "strength": SYRUP["strength"],
               "product_url": url, "duyet": "", "gia_ban_duyet": ""}]
    (row,) = fp.refresh(client, review, [SYRUP], refetch_all=False, log=lambda *_: None)
    assert row["site"] == "pharmacity" and row["price_per_unit"] == Decimal("16000")


def test_cli_requires_contact_and_min_delay(tmp_path, monkeypatch):
    from drug_data import tt19_catalog as tt
    cfg = tmp_path / "config.toml"
    cfg.write_text('[gia]\nemail_lien_he = ""\n', encoding="utf-8")
    monkeypatch.setattr(tt, "CONFIG_FILE", cfg)
    with pytest.raises(SystemExit, match="email_lien_he"):
        fp.main(["search", "--limit", "1"])
    (tmp_path / "config.local.toml").write_text('[gia]\nemail_lien_he = "sv@dtu.edu.vn"\n', encoding="utf-8")
    assert fp._contact(type("A", (), {"contact": ""})()) == "sv@dtu.edu.vn"   # config.local.toml ghi đè
    with pytest.raises(SystemExit):
        fp.main(["search", "--contact", "khong-phai-email"])
    with pytest.raises(SystemExit, match="tối thiểu 2"):
        fp.main(["search", "--contact", "a@b.c", "--delay", "0.5"])


def _r(site, ppu, score=4, note="giá đọc từ json-ld"):
    return {"site": site, "price_per_unit": ppu, "match_score": score, "note": note}


def test_mark_auto_rules():
    rows = [_r("longchau", Decimal("1650")), _r("pharmacity", Decimal("1550"))]
    assert fp.mark_auto(rows) == Decimal("1600")                           # trung bình, làm tròn 100 đ
    assert rows[0]["duyet"] == "auto" and "duyet" not in rows[1]
    spread = [_r("longchau", Decimal("1000")), _r("pharmacity", Decimal("1400"))]
    assert fp.mark_auto(spread) is None and "lệch nhau" in spread[0]["note"]
    assert fp.mark_auto([_r("longchau", Decimal("1650"), score=3)]) is None   # chỉ khớp hoạt chất
    assert fp.mark_auto([_r("longchau", "")]) is None                         # không quy được giá/đơn vị
    assert fp.mark_auto([_r("longchau", Decimal("1650"), note="giá đọc từ next-data (độ tin cậy thấp)")]) is None
    assert fp.mark_auto([_r("longchau", Decimal("350"))]) == Decimal("350")   # dưới 1.000 đ: làm tròn đồng


def test_search_auto_writes_drugs_csv(sandbox, monkeypatch):
    import csv as _csv
    lc = "https://nhathuoclongchau.com.vn"
    routes = {lc + "/robots.txt": (404, ""),
              lc + "/tim-kiem": (200, '<a href="/thuoc/panadol-500mg.html">y</a>'),
              lc + "/thuoc/panadol-500mg.html": (200, product_page("Panadol 500mg", "198000", "Hộp 12 vỉ x 10 viên"))}
    client = fp.PoliteClient(httpx.Client(transport=_transport(routes, [])), "sv@dtu.edu.vn", delay=0)
    drugs_csv = sandbox / "drugs.csv"
    with open(drugs_csv, "w", encoding="utf-8", newline="") as f:
        w = _csv.DictWriter(f, fieldnames=list(PANADOL), lineterminator="\n")
        w.writeheader()
        w.writerow({**PANADOL, "sale_price": ""})
    monkeypatch.setattr(fp, "DRUGS_CSV", drugs_csv)
    monkeypatch.setattr(fp, "REVIEW_CSV", sandbox / "review.csv")
    monkeypatch.setattr(fp, "_client", lambda args: client)
    monkeypatch.setattr(fp, "TOOL_DIR", sandbox)
    assert fp.main(["search", "--contact", "sv@dtu.edu.vn", "--sites", "longchau", "--auto", "--only-missing"]) == 0
    _, rows = fp.read_csv(drugs_csv)
    assert rows[0]["sale_price"] == "1700" and rows[0]["price_source"].endswith("panadol-500mg.html")   # 1650 -> 1700
    _, review = fp.read_csv(sandbox / "review.csv")
    assert review[0]["duyet"] == "da-ghi-auto"
