"""Danh mục thuốc thiết yếu — Thông tư 19/2018/TT-BYT, Phụ lục I (nguồn: Cơ sở dữ liệu quốc gia về VBPL).

Chạy trong tools/. Đường dẫn nguồn ở config.toml. vbpl.vn chặn công cụ tự động, nên cách chắc chắn là tải
file bằng nút "Tải về" trên trình duyệt rồi thả vào inbox/. Đọc thẳng .docx/.html; .doc Word 97-2003 tự chuyển
bằng Word (hoặc LibreOffice); .pdf chỉ lưu làm minh chứng.

    python -m drug_data.tt19_catalog run            # cả chuỗi dưới đây (đường dẫn đọc từ config.toml)
    python -m drug_data.tt19_catalog fetch          # lưu minh chứng: file trong inbox/ hoặc tải theo config.toml
    python -m drug_data.tt19_catalog extract        # trích Phụ lục I -> output/tt19_2018_phu_luc_1.csv
    python -m drug_data.tt19_catalog check          # đối chiếu server/data/drugs.csv với Phụ lục I
    python -m drug_data.tt19_catalog candidates     # thuốc ngoại trú chưa có -> output/drug_candidates.csv
    python -m drug_data.tt19_catalog merge [--auto] # gộp dòng chon = x (--auto: + mọi ứng viên đủ thông tin)

Công cụ chỉ GHI vào server/data/drugs.csv; không import gì từ server/app.

Văn bản quy phạm pháp luật không thuộc đối tượng bảo hộ quyền tác giả (Luật SHTT, Điều 15).
"""
import argparse
import csv
import difflib
import hashlib
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
REPO_DIR = TOOL_DIR.parents[1]
OUTPUT_DIR = TOOL_DIR / "output"
SOURCE_DIR = TOOL_DIR / "sources" / "tt19_2018"
CONFIG_FILE = TOOL_DIR / "config.toml"
MIN_EXPECTED_DRUGS = 400        # Phụ lục I có ~480 thuốc; ít hơn ngưỡng này = đọc sai bảng
DOCX_FILE = SOURCE_DIR / "tt19_2018_chuyen_doi.docx"          # chỉ khi nguồn là .doc Word 97-2003
MANIFEST = SOURCE_DIR / "manifest.json"
APPENDIX_CSV = OUTPUT_DIR / "tt19_2018_phu_luc_1.csv"
DRUGS_CSV = REPO_DIR / "server" / "data" / "drugs.csv"          # đầu ra cuối cùng, server/scripts/seed_drugs đọc
CANDIDATES_CSV = OUTPUT_DIR / "drug_candidates.csv"
CHECK_REPORT = OUTPUT_DIR / "tt19_check_report.csv"
SOURCE_LABEL = "TT 19/2018/TT-BYT, Phụ lục I, STT {stt}"
USER_AGENT = "MedAssist-C1SE28/0.1 (do an tot nghiep; thu thap van ban phap luat cong khai)"
APPENDIX_FIELDS = ["stt", "nhom", "nhom_con", "ten_thuoc", "duong_dung", "dang_bao_che", "ham_luong", "dau_sao"]


# ============================================================================ cấu hình
def load_config() -> dict:
    """config.toml (commit) + config.local.toml (KHÔNG commit, ghi đè từng khóa: email cá nhân...)."""
    import tomllib
    if not CONFIG_FILE.exists():
        raise SystemExit(f"Thiếu {CONFIG_FILE}")
    with open(CONFIG_FILE, "rb") as f:
        cfg = tomllib.load(f)
    local = CONFIG_FILE.with_name("config.local.toml")
    if local.exists():
        with open(local, "rb") as f:
            for section, values in tomllib.load(f).items():
                cfg.setdefault(section, {}).update(values)
    return cfg


# ============================================================================ tiện ích chung
def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\u00a0", " ")).strip()


def strip_accents(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower()).replace("đ", "d")
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


_NEXT_STEP = {"tt19_2018_phu_luc_1.csv": "python -m drug_data.tt19_catalog fetch, rồi extract",
              "drug_candidates.csv": "python -m drug_data.tt19_catalog candidates",
              "price_review.csv": "python -m drug_data.fetch_prices search --contact ten@email.com"}


def read_csv(path: Path) -> tuple[list[str], list[dict]]:
    if not path.exists():
        hint = _NEXT_STEP.get(path.name)
        raise SystemExit(f"Chưa có {path}." + (f" Chạy trước: {hint}" if hint else ""))
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, fields: list[str], rows: list[dict], *, excel: bool = False) -> None:
    """excel=True: UTF-8 có BOM để Excel mở đúng tiếng Việt (file người dùng sẽ sửa tay)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig" if excel else "utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


# ============================================================================ fetch (nhận file tải tay)
SUPPORTED = (".html", ".htm", ".docx", ".doc")


def detect_kind(path: Path) -> str:
    """Loại nội dung thật (không tin đuôi file): 'html' | 'docx' | 'doc-ole' | 'pdf'."""
    head = path.read_bytes()[:4096]
    if head[:2] == b"PK":
        return "docx"
    if head[:4] == b"\xd0\xcf\x11\xe0":
        return "doc-ole"                                   # Word 97-2003
    if head[:5] == b"%PDF-":
        return "pdf"
    if b"<html" in head.lower() or b"<table" in head.lower() or head.lstrip()[:1] == b"<":
        return "html"                                      # kể cả .doc thực chất là HTML
    return "khac"


def convert_to_docx(src: Path, dst: Path) -> str:
    """DỰ PHÒNG cho .doc Word 97-2003: Microsoft Word (pywin32) nếu có, không thì LibreOffice."""
    if sys.platform == "win32":
        try:
            import win32com.client  # type: ignore
        except ImportError:
            raise SystemExit("File .doc dạng Word cũ. Cách đơn giản nhất: mở trang toàn văn trên trình duyệt, "
                             "Ctrl+S lưu dạng .html rồi chạy lại fetch --file <file .html>. "
                             "(Hoặc mở .doc bằng Word -> Lưu thành .docx.)") from None
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        try:
            doc = word.Documents.Open(str(src.resolve()), ReadOnly=True, ConfirmConversions=False)
            doc.SaveAs2(str(dst.resolve()), FileFormat=16)   # 16 = .docx
            doc.Close(False)
        finally:
            word.Quit()
        return "Microsoft Word"
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise SystemExit("File .doc dạng Word cũ: lưu trang toàn văn dạng .html hoặc mở bằng Word lưu thành .docx.")
    subprocess.run([soffice, "--headless", "--convert-to", "docx", "--outdir", str(dst.parent), str(src)],
                   check=True, capture_output=True)
    produced = dst.parent / (src.stem + ".docx")
    if produced != dst:
        produced.replace(dst)
    return "LibreOffice"


def source_file() -> Path:
    """File nguồn đã lưu (manifest.json ghi file nào dùng để trích)."""
    if not MANIFEST.exists():
        raise SystemExit("Chưa có minh chứng nguồn. Chạy trước: python -m drug_data.tt19_catalog fetch")
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return SOURCE_DIR / m["file_trich_xuat"]


_ORDER = {"docx": 0, "html": 1, "doc-ole": 2}               # ưu tiên file dễ đọc bảng nhất


def _collect_sources(cfg: dict, explicit: str | None) -> tuple[list[Path], str]:
    """File nguồn theo thứ tự: --file -> thư mục tải tay (inbox) -> tải tự động từ cấu hình."""
    if explicit:
        p = Path(explicit).expanduser()
        if not p.exists():
            raise SystemExit(f"Không thấy file {p}")
        return [p], "Tải tay bằng trình duyệt"
    inbox = TOOL_DIR / cfg.get("thu_muc_tai_tay", "inbox")
    files = sorted(f for f in inbox.glob("*") if f.is_file() and f.suffix.lower() in SUPPORTED + (".pdf",))
    if files:
        return files, "Tải tay bằng trình duyệt"
    urls = [u for u in cfg.get("tai_truc_tiep", []) if u]
    if urls:
        try:
            import httpx
        except ImportError:
            raise SystemExit("Thiếu thư viện: pip install -r drug_data/requirements.txt") from None
        got, errors = [], []
        tmp = SOURCE_DIR / "_tai_ve"
        tmp.mkdir(parents=True, exist_ok=True)
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True) as client:
            for n, url in enumerate(urls):
                name = Path(urlparse_path(url)).name or f"tep_{n}"
                try:
                    _download(client, url, tmp / name)
                    got.append(tmp / name)
                except httpx.HTTPError as exc:
                    errors.append(f"{url}: {exc}")
        if got:
            return got, "Script tải tự động"
        print("Không tải tự động được:\n  " + "\n  ".join(errors))
    raise SystemExit(f"Chưa có file nguồn. Mở trang tải về ({cfg.get('trang_tai_ve', 'xem config.toml')}), "
                     f"bấm tải file .doc/.docx (và .pdf nếu muốn lưu kèm), chép vào {inbox}, rồi chạy lại.")


def cmd_fetch(args) -> int:
    cfg = load_config().get("tt19", {})
    files, how = _collect_sources(cfg, getattr(args, "file", None))
    if SOURCE_DIR.exists():                                  # làm mới minh chứng, giữ thư mục
        for old in SOURCE_DIR.glob("tt19_2018_*"):
            old.unlink()
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {"van_ban": "Thông tư 19/2018/TT-BYT ngày 30/08/2018 — Ban hành danh mục thuốc thiết yếu",
                "co_quan_ban_hanh": "Bộ Y tế", "trang_van_ban": cfg.get("trang_van_ban"),
                "trang_tai_ve": cfg.get("trang_tai_ve"), "cach_lay": how,
                "thoi_diem_ghi_nhan": datetime.now(timezone.utc).isoformat(timespec="seconds"), "files": []}
    readable = []
    for src in files:
        kind = detect_kind(src)
        dest = SOURCE_DIR / f"tt19_2018_goc_{len(manifest['files']) + 1}{src.suffix.lower()}"
        shutil.copyfile(src, dest)
        manifest["files"].append({"file": dest.name, "ten_file_ban_dau": src.name, "dinh_dang": kind,
                                  "bytes": dest.stat().st_size, "sha256": _sha256(dest)})
        if kind in _ORDER:
            readable.append((_ORDER[kind], dest, kind))
    shutil.rmtree(SOURCE_DIR / "_tai_ve", ignore_errors=True)
    if not readable:
        raise SystemExit("Đã lưu minh chứng nhưng không có file đọc được bảng (PDF thường là ảnh scan). "
                         "Tải thêm bản .doc hoặc .docx từ trang tải về vào inbox/ rồi chạy lại.")
    _, best, kind = min(readable, key=lambda x: (x[0], x[1].name))
    if kind == "doc-ole":
        manifest["chuyen_doi_docx"] = convert_to_docx(best, DOCX_FILE)
        manifest["files"].append({"file": DOCX_FILE.name, "sha256": _sha256(DOCX_FILE), "ghi_chu": f"chuyển từ {best.name}"})
        best = DOCX_FILE
    manifest["file_trich_xuat"] = best.name
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    for f in manifest["files"]:
        print(f"  {f['file']:<28} {f.get('dinh_dang', 'docx'):<8} SHA-256 {f['sha256'][:16]}...")
    print(f"Đã lưu minh chứng ({how}) -> {MANIFEST.name}; trích bảng từ {best.name}")
    return 0


def urlparse_path(url: str) -> str:
    from urllib.parse import urlparse
    return urlparse(url).path


def _download(client, url: str, dest: Path) -> dict:
    r = client.get(url)
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    return {"url": url, "file": dest.name, "http_status": r.status_code, "bytes": len(r.content),
            "sha256": _sha256(dest), "content_type": r.headers.get("content-type"),
            "last_modified": r.headers.get("last-modified")}


# ============================================================================ extract
_ROMAN = re.compile(r"^[IVXL]+\.\s")
_SUB = re.compile(r"^(\d+|[a-zđ])\.\s|^♦")


def _read_text(path: Path) -> str:
    raw = path.read_bytes()
    m = re.search(rb'charset=["\']?([\w-]+)', raw[:4096], re.I)
    for enc in ([m.group(1).decode()] if m else []) + ["utf-8", "cp1258", "cp1252"]:
        try:
            return raw.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def tables_from_html(text: str) -> list[list[list[str]]]:
    """Bảng HTML -> lưới ô. colspan: lặp nội dung (dòng tiêu đề nhóm); rowspan: các dòng dưới để TRỐNG
    (đúng kiểu 'kế thừa từ dòng trên' của bảng gốc). Bảng lồng nhau được đọc riêng."""
    from html.parser import HTMLParser

    class P(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.stack, self.tables = [], []          # stack: mỗi bảng đang mở = {'rows','row','cell','spans'}

        def handle_starttag(self, tag, attrs):
            a = dict(attrs)
            if tag == "table":
                self.stack.append({"rows": [], "row": None, "cell": None})
            elif not self.stack:
                return
            elif tag == "tr":
                self.stack[-1]["row"] = []
            elif tag in ("td", "th") and self.stack[-1]["row"] is not None:
                span = lambda k: max(1, int(re.sub(r"\D", "", a.get(k) or "1") or 1))  # noqa: E731
                self.stack[-1]["cell"] = {"text": [], "colspan": span("colspan"), "rowspan": span("rowspan")}
            elif tag in ("br", "p", "div") and self.stack[-1]["cell"] is not None:
                self.stack[-1]["cell"]["text"].append(" ")

        def handle_endtag(self, tag):
            if not self.stack:
                return
            t = self.stack[-1]
            if tag in ("td", "th") and t["cell"] is not None and t["row"] is not None:
                t["row"].append(t["cell"])
                t["cell"] = None
            elif tag == "tr" and t["row"] is not None:
                t["rows"].append(t["row"])
                t["row"] = None
            elif tag == "table":
                self.tables.append(self.stack.pop()["rows"])

        def handle_data(self, data):
            if self.stack and self.stack[-1]["cell"] is not None:
                self.stack[-1]["cell"]["text"].append(data)

    parser = P()
    parser.feed(text)
    grids = []
    for rows in parser.tables:
        grid, pending = [], {}                       # pending[col] = số dòng còn bị rowspan chiếm
        for cells in rows:
            out, col = [], 0
            queue = list(cells)
            while queue or any(c >= col and n > 0 for c, n in pending.items()):
                if pending.get(col, 0) > 0:
                    out.append("")                    # ô bị rowspan từ dòng trên chiếm chỗ
                    pending[col] -= 1
                    col += 1
                    continue
                if not queue:
                    break
                c = queue.pop(0)
                txt = _clean("".join(c["text"]))
                for k in range(c["colspan"]):
                    out.append(txt)
                    if c["rowspan"] > 1:
                        pending[col + k] = c["rowspan"] - 1
                col += c["colspan"]
            grid.append(out)
        width = max((len(r) for r in grid), default=0)
        grids.append([r + [""] * (width - len(r)) for r in grid])
    return grids


def tables_from_docx(path: Path) -> list[list[list[str]]]:
    from docx import Document
    return [[[_clean(c.text) for c in r.cells] for r in t.rows] for t in Document(str(path)).tables]


def parse_appendix(path: Path) -> list[dict]:
    """Đọc bảng Phụ lục I từ .html hoặc .docx. Mỗi dạng bào chế là một bản ghi; ô trống được kế thừa
    từ dòng trên trong cùng STT (bảng gộp ô theo chiều dọc)."""
    kind = detect_kind(path)
    if kind == "doc-ole":
        raise SystemExit("File .doc Word 97-2003 cần chuyển .docx: chạy 'fetch' (tự chuyển bằng Word).")
    if kind not in ("html", "docx"):
        raise SystemExit(f"{path.name}: định dạng '{kind}' không đọc được bảng. Dùng .doc/.docx/.html.")
    tables = tables_from_html(_read_text(path)) if kind == "html" else tables_from_docx(path)
    for rows in tables:
        header_idx = next((i for i, r in enumerate(rows[:5]) if any("TÊN THUỐC" in c.upper() for c in r)), None)
        if header_idx is None:
            continue
        head = [c.upper() for c in rows[header_idx]]
        col = {k: next(i for i, c in enumerate(head) if key in c) for k, key in
               (("ten", "TÊN THUỐC"), ("duong", "ĐƯỜNG DÙNG"), ("dang", "DẠNG BÀO CHẾ"), ("ham", "HÀM LƯỢNG"))}
        tt_cols = [i for i, c in enumerate(head) if c in ("TT", "STT")]
        # Bảng gốc có 2 cột TT: một cột đánh số LIÊN TỤC cả phụ lục, một cột đánh số lại trong từng nhóm.
        # Cột liên tục = cột có giá trị lớn nhất; STT trong drugs.csv (cột source) theo cột này.
        def _max_num(i):
            nums = [int(r[i]) for r in rows[header_idx + 1:] if i < len(r) and re.fullmatch(r"\d+", r[i] or "")]
            return max(nums, default=0)
        if tt_cols:
            tt_cols = [max(tt_cols, key=_max_num)]
        out, nhom, nhom_con = [], "", ""
        cur = {"stt": None, "ten": "", "duong": ""}
        for r in rows[header_idx + 1:]:
            values = {c for c in r if c}
            if not values or all(re.fullmatch(r"\(\d\)", c) for c in values):
                continue                                         # dòng trống / dòng đánh số cột (1)..(5)
            if len(values) == 1 and not re.fullmatch(r"\d+", next(iter(values))):
                title = next(iter(values))                      # dòng tiêu đề nhóm (ô gộp ngang)
                if _ROMAN.match(title):
                    nhom, nhom_con = title, ""
                elif _SUB.match(title):
                    nhom_con = title
                continue
            stt = next((r[i] for i in tt_cols if re.fullmatch(r"\d+", r[i] or "")), "")
            if stt and cur["stt"] is not None and int(stt) < int(cur["stt"]):
                break                                           # STT giảm = sang phụ lục khác
            if stt and stt != cur["stt"]:
                cur = {"stt": stt, "ten": r[col["ten"]], "duong": r[col["duong"]]}
            elif cur["stt"] is None:
                continue
            else:
                # dòng tiếp của CÙNG thuốc: ô gộp dọc để trống (HTML) hoặc lặp lại nội dung (Word -> .docx)
                if r[col["ten"]]:
                    cur["ten"] = r[col["ten"]]                  # dạng muối khác của cùng STT
                if r[col["duong"]]:
                    cur["duong"] = r[col["duong"]]
            ten, duong = cur["ten"], cur["duong"]
            dang, ham = r[col["dang"]], r[col["ham"]]
            if not dang and not ham:
                continue
            star = "(*)" in ten or "(*)" in duong
            out.append({"stt": cur["stt"], "nhom": nhom, "nhom_con": nhom_con,
                        "ten_thuoc": _clean(ten.replace("(*)", "")), "duong_dung": _clean(duong.replace("(*)", "")),
                        "dang_bao_che": dang, "ham_luong": ham, "dau_sao": "x" if star else ""})
        if out:
            return out
    raise SystemExit(f"Không tìm thấy bảng Phụ lục I (cột 'TÊN THUỐC') trong {path.name}. "
                     "Kiểm tra file đã lưu đúng trang TOÀN VĂN của Thông tư 19/2018/TT-BYT.")


def cmd_extract(args) -> int:
    rows = parse_appendix(source_file())
    write_csv(APPENDIX_CSV, APPENDIX_FIELDS, rows)
    stts = {int(r["stt"]) for r in rows}
    n = len(stts)
    print(f"Đã trích {n} thuốc ({len(rows)} dạng bào chế) -> {APPENDIX_CSV.name}")
    gaps = sorted(set(range(1, max(stts) + 1)) - stts) if stts else []
    if gaps:
        print(f"  STT 1..{max(stts)}: thiếu {len(gaps)} số ({', '.join(map(str, gaps[:30]))}"
              f"{', ...' if len(gaps) > 30 else ''}) — dòng chỉ có tiêu đề/không có dạng bào chế, hoặc ô STT lỗi")
    if n < MIN_EXPECTED_DRUGS:
        print("CẢNH BÁO: Phụ lục I có khoảng 480 thuốc — số trích được quá ít. Chạy "
              "'python -m drug_data.tt19_catalog inspect' để kiểm tra.")
    return 0


# ============================================================================ check
_STT_RE = re.compile(r"Phụ lục I, STT (\d+)")


def _tokens(name: str) -> set[str]:
    s = strip_accents(re.sub(r"[()+,/]", " ", name))
    return {t for t in s.split() if t not in {"hoac", "va"}}


def name_match(ours: str, theirs: str) -> tuple[str, float]:
    a, b = _tokens(ours), _tokens(theirs)
    if a and a <= b:
        return "OK", 1.0
    ratio = difflib.SequenceMatcher(None, " ".join(sorted(a)), " ".join(sorted(b))).ratio()
    return ("WARN" if ratio >= 0.75 else "FAIL"), round(ratio, 2)


def form_category(text: str) -> str:
    s = strip_accents(text)
    for cat, keys in (("hit", ("hit", "khi dung", "binh xit")), ("xit_mui", ("xit mui",)),
                      ("nho_mat", ("nho mat", "tra mat")), ("nho_mui", ("nho mui",)),
                      ("dan", ("vien dan", "dat truc trang")), ("kem", ("kem", "mo", "lotion", "gel")),
                      ("sirô", ("siro", "si ro")), ("hon_dich", ("hon dich", "com pha")),
                      ("bot", ("bot", "goi", "com")), ("dung_dich", ("dung dich", "dd ")),
                      ("vien", ("vien", "nang"))):
        if any(k in s for k in keys):
            return cat
    return "khac"


def _numbers(text: str) -> set[str]:
    """Các con số trong chuỗi hàm lượng: '5.000 IU' -> 5000, '62,5mg' -> 62.5 (kiểu viết Việt Nam)."""
    from decimal import Decimal
    s = re.sub(r"(?<=\d)\.(?=\d{3}(?!\d))", "", text or "")     # dấu chấm hàng nghìn
    s = re.sub(r"(?<=\d),(?=\d)", ".", s)                         # dấu phẩy thập phân
    return {format(Decimal(n).normalize(), "f") for n in re.findall(r"\d+(?:\.\d+)?", s)}


def _their_categories(form: str, route: str) -> set[str]:
    return {form_category(part + " " + route) for part in (form or "").split(",") if part.strip()} or {"khac"}


def _our_category(dosage_form: str) -> str:
    return form_category(dosage_form.split(",")[0])


def check_rows(drugs: list[dict], appendix: list[dict]) -> list[dict]:
    by_stt: dict[str, list[dict]] = {}
    for r in appendix:
        by_stt.setdefault(r["stt"], []).append(r)
    report = []
    for d in drugs:
        out = {"generic_name": d["generic_name"], "trade_name": d["trade_name"], "strength": d["strength"],
               "dosage_form": d["dosage_form"], "source": d.get("source", "")}
        m = _STT_RE.search(d.get("source") or "")
        if not m or m.group(1) not in by_stt:
            report.append({**out, "ket_qua": "FAIL", "ghi_chu": "Không có STT hợp lệ trong Phụ lục I"})
            continue
        cands = by_stt[m.group(1)]
        status, ratio = max((name_match(d["generic_name"], c["ten_thuoc"]) for c in cands), key=lambda x: x[1])
        notes = [] if status == "OK" else [f"tên chỉ khớp gần đúng ({ratio}) với '{cands[0]['ten_thuoc']}'"]
        cat = _our_category(d["dosage_form"])
        same_form = [c for c in cands if cat in _their_categories(c["dang_bao_che"], c["duong_dung"])]
        if not same_form:
            notes.append("dạng bào chế không thấy trong STT này: "
                         + "; ".join(sorted({c["dang_bao_che"] for c in cands})))
        elif not any(_numbers(d["strength"]) <= _numbers(c["ham_luong"]) for c in same_form if c["ham_luong"]):
            notes.append("hàm lượng không thấy nguyên văn: "
                         + "; ".join(sorted({c["ham_luong"] or "(văn bản không ghi)" for c in same_form})))
        if status == "OK" and notes:
            status = "WARN"
        report.append({**out, "ket_qua": status, "ghi_chu": " | ".join(notes)})
    return report


def cmd_check(args) -> int:
    _, drugs = read_csv(DRUGS_CSV)
    _, appendix = read_csv(APPENDIX_CSV)
    report = check_rows(drugs, appendix)
    write_csv(CHECK_REPORT, ["ket_qua", "generic_name", "trade_name", "strength", "dosage_form", "source", "ghi_chu"],
              report, excel=True)
    counts = {k: sum(r["ket_qua"] == k for r in report) for k in ("OK", "WARN", "FAIL")}
    print(f"OK {counts['OK']}, WARN {counts['WARN']}, FAIL {counts['FAIL']} -> {CHECK_REPORT.name}")
    for r in report:
        if r["ket_qua"] == "FAIL":
            print(f"  FAIL  {r['generic_name']} {r['strength']}: {r['ghi_chu']}")
    return 1 if counts["FAIL"] else 0


# ============================================================================ candidates / merge
OUTPATIENT_ROUTES = ("uong", "dung ngoai", "nho mat", "nho mui", "nho tai", "xit mui", "tra mat",
                     "duong ho hap", "truc trang", "dung tai cho", "dat duoi luoi")
EXCLUDED_GROUPS = ("gay me", "giai doc", "ung thu", "parkinson", "che pham mau", "chan doan", "sinh pham",
                   "thuc de", "tham phan", "roi loan tam than", "tre so sinh thieu thang", "thuoc khac",
                   "gian co", "co giat")
EXCLUDED_SUBGROUPS = ("lao", "phong", "sot ret", "pneumocytis", "sao chep nguoc", "protease", "lieu co dinh",
                      "giam dau loai opi", "cham soc giam nhe", "tranh thai", "androgen", "estrogen", "rung trung", "progesteron",
                      "dai thao nhat", "giun chi", "san la")
DRUG_FIELDS = ["generic_name", "trade_name", "strength", "dosage_form", "unit", "sale_price", "reorder_level",
               "drug_class", "import_price", "batch_quantity", "shelf_life_days", "source"]
CANDIDATE_FIELDS = ["chon", "stt", "nhom", "nhom_con", "duong_dung", "ham_luong_goc"] + DRUG_FIELDS


def _split_strengths(text: str) -> list[str]:
    if not text:
        return [""]
    if re.match(r"(?i)^từ\s", text):
        return [text]
    parts = [p.strip(" .") for p in re.split(r"[;,.]\s+(?=\d)", text)]
    return [re.sub(r"(\d)\s*([a-zA-Zµ%])", r"\1 \2", p) for p in parts if p]


def _guess_unit(form: str, route: str) -> str:
    s = strip_accents(form + " " + route)
    for unit, keys in (("bình", ("hit", "khi dung")), ("lọ", ("nho mat", "nho mui", "nho tai", "xit mui")),
                       ("tuýp", ("kem", "mo", "tra mat")), ("viên", ("vien",)), ("gói", ("bot", "com")),
                       ("chai", ("dung dich", "siro", "si ro", "hon dich", "lotion"))):
        if any(k in s for k in keys):
            return unit
    return ""


def build_candidates(drugs: list[dict], appendix: list[dict]) -> list[dict]:
    have = set()
    for d in drugs:
        m = _STT_RE.search(d.get("source") or "")
        if m:
            have.add((m.group(1), _our_category(d["dosage_form"]), frozenset(_numbers(d["strength"]))))
    out = []
    for r in appendix:
        route, group, sub = strip_accents(r["duong_dung"]), strip_accents(r["nhom"]), strip_accents(r["nhom_con"])
        if not any(k in route for k in OUTPATIENT_ROUTES) or "tiem" in route:
            continue
        if any(k in group for k in EXCLUDED_GROUPS) or any(k in sub for k in EXCLUDED_SUBGROUPS):
            continue
        cats = _their_categories(r["dang_bao_che"], r["duong_dung"])
        for strength in _split_strengths(r["ham_luong"]):
            if any((r["stt"], c, frozenset(_numbers(strength))) in have for c in cats):
                continue
            out.append({"chon": "", "stt": r["stt"], "nhom": r["nhom"], "nhom_con": r["nhom_con"],
                        "duong_dung": r["duong_dung"], "ham_luong_goc": r["ham_luong"],
                        "generic_name": r["ten_thuoc"], "trade_name": "", "strength": strength,
                        "dosage_form": r["dang_bao_che"].lower(), "unit": _guess_unit(r["dang_bao_che"], r["duong_dung"]),
                        "sale_price": "", "reorder_level": "0", "drug_class": re.sub(r"^(\d+|[a-zđ])\.\s*|^♦\s*", "", r["nhom_con"] or r["nhom"]),
                        "import_price": "", "batch_quantity": "", "shelf_life_days": "",
                        "source": SOURCE_LABEL.format(stt=r["stt"])})
    return out


def cmd_candidates(args) -> int:
    _, drugs = read_csv(DRUGS_CSV)
    _, appendix = read_csv(APPENDIX_CSV)
    rows = build_candidates(drugs, appendix)
    write_csv(CANDIDATES_CSV, CANDIDATE_FIELDS, rows, excel=True)
    auto = sum(auto_eligible(r) for r in rows)
    print(f"{len(rows)} ứng viên -> {CANDIDATES_CSV.name} ({auto} đủ thông tin để 'merge --auto'). "
          "Hoặc ghi 'x' ở cột 'chon', điền trade_name/unit rồi chạy 'merge'.")
    return 0


def auto_eligible(c: dict) -> bool:
    """Ứng viên tự thêm được: đoán được đơn vị bán, hàm lượng là MỘT giá trị cụ thể (không phải khoảng)."""
    strength = _clean(c.get("strength", ""))
    return bool(_clean(c.get("unit", ""))) and bool(strength) and not re.match(r"(?i)^từ\s", strength)


def merge_candidates(drugs_fields: list[str], drugs: list[dict], candidates: list[dict],
                     auto: bool = False) -> tuple[list[dict], list[str]]:
    key = lambda d: tuple(_clean(d[k]).lower() for k in ("generic_name", "trade_name", "strength", "dosage_form"))  # noqa: E731
    existing = {key(d) for d in drugs}
    added, problems = [], []
    for n, c in enumerate(candidates, start=2):
        chosen = _clean(c.get("chon", "")).lower() in {"x", "1", "có", "co"}
        if not chosen and not (auto and auto_eligible(c)):
            continue
        row = {f: _clean(c.get(f, "")) for f in drugs_fields}
        row["trade_name"] = row["trade_name"] or f"{row['generic_name']} {row['strength']}".strip()
        missing = [f for f in ("generic_name", "strength", "dosage_form", "unit") if not row[f]]
        if missing:
            problems.append(f"dòng {n}: thiếu {', '.join(missing)}")
            continue
        if key(row) in existing:
            problems.append(f"dòng {n}: đã có trong drugs.csv ({row['trade_name']})")
            continue
        existing.add(key(row))
        added.append(row)
    return added, problems


def cmd_merge(args) -> int:
    fields, drugs = read_csv(DRUGS_CSV)
    _, candidates = read_csv(CANDIDATES_CSV)
    added, problems = merge_candidates(fields, drugs, candidates, auto=args.auto)
    for p in problems:
        print("  BỎ QUA", p)
    if added:
        write_csv(DRUGS_CSV, fields, drugs + added)
    no_price = sum(1 for a in added if not a.get("sale_price"))
    print(f"Đã thêm {len(added)} thuốc vào drugs.csv ({no_price} chưa có giá — seed sẽ bỏ qua cho tới khi có giá).")
    return 0


# ============================================================================ CLI
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Danh mục thuốc thiết yếu TT 19/2018/TT-BYT")
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="Lưu minh chứng nguồn (inbox/ hoặc tai_truc_tiep trong config.toml)")
    f.add_argument("--file", help="(tùy chọn) chỉ định một file cụ thể thay vì inbox/")
    sub.add_parser("inspect", help="Ghi các dòng đầu của từng bảng trong file nguồn -> output/tt19_bang_mau.txt")
    r = sub.add_parser("run", help="Chạy cả chuỗi: fetch, extract, check, candidates, merge --auto")
    r.add_argument("--no-merge", action="store_true", help="Dừng sau candidates (không tự thêm thuốc)")
    for name, h in (("extract", "Trích Phụ lục I ra CSV"), ("check", "Đối chiếu drugs.csv"),
                    ("candidates", "Sinh danh sách ứng viên")):
        sub.add_parser(name, help=h)
    m = sub.add_parser("merge", help="Gộp ứng viên đã chọn")
    m.add_argument("--auto", action="store_true",
                   help="Thêm cả mọi ứng viên đoán được đơn vị và có hàm lượng cụ thể (không cần đánh dấu)")
    args = p.parse_args(argv)
    return {"fetch": cmd_fetch, "extract": cmd_extract, "check": cmd_check, "candidates": cmd_candidates,
            "merge": cmd_merge, "run": cmd_run, "inspect": cmd_inspect}[args.cmd](args)


def cmd_inspect(args) -> int:
    """Chẩn đoán khi extract ra số thuốc bất thường: in cấu trúc từng bảng để đối chiếu."""
    path = source_file()
    kind = detect_kind(path)
    tables = tables_from_html(_read_text(path)) if kind == "html" else tables_from_docx(path)
    out = OUTPUT_DIR / "tt19_bang_mau.txt"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(f"Nguồn: {path.name} ({kind}), {len(tables)} bảng\n")
        for n, rows in enumerate(tables):
            f.write(f"\n===== Bảng {n}: {len(rows)} dòng x {max((len(r) for r in rows), default=0)} cột\n")
            picks = list(range(min(12, len(rows))))
            picks += [i for i in range(len(rows)) if i >= 12 and any(re.fullmatch(r"\d+", c or "") and c in
                      ("14", "15", "16", "17", "18") for c in rows[i])][:8]
            for i in picks:
                f.write(f"[{i}] " + " | ".join(rows[i]) + "\n")
    print(f"Đã ghi {out}")
    return 0


def cmd_run(args) -> int:
    steps = [("fetch", cmd_fetch, argparse.Namespace(file=None)), ("extract", cmd_extract, args),
             ("check", cmd_check, args), ("candidates", cmd_candidates, args)]
    if not args.no_merge:
        steps.append(("merge --auto", cmd_merge, argparse.Namespace(auto=True)))
    for name, fn, a in steps:
        print(f"== {name}")
        code = fn(a)
        if name == "extract" and len({r["stt"] for r in read_csv(APPENDIX_CSV)[1]}) < MIN_EXPECTED_DRUGS:
            raise SystemExit("Dừng: extract trích quá ít thuốc (lỗi đọc bảng, KHÔNG phải lỗi drugs.csv).")
        if name == "check" and code:
            raise SystemExit("Dừng: drugs.csv có dòng FAIL (xem output/tt19_check_report.csv), sửa rồi chạy lại.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
