"""Đọc từng loại file nguồn thành các dòng thô {ten, dia_chi, so_huu, cap_cmkt, vi_tri}.

Mỗi hàm chỉ đọc đúng cấu trúc của văn bản nguồn; lọc, chuẩn hóa, gộp trùng nằm ở build.py.
"""
import re
from pathlib import Path

_WS = re.compile(r"\s+")


def clean(s) -> str:
    return _WS.sub(" ", str(s or "")).strip()


def _row(ten, dia_chi="", so_huu="", cap_cmkt="", vi_tri="") -> dict:
    return {"ten": clean(ten), "dia_chi": clean(dia_chi), "so_huu": so_huu, "cap_cmkt": clean(cap_cmkt),
            "vi_tri": vi_tri}


def _pdf_tables(path: Path, drop_font: str | None = None):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        for no, page in enumerate(pdf.pages, start=1):
            if drop_font:
                # Chữ ký số chèn chữ Helvetica chồng lên bảng (vd TB 6539 Đà Nẵng): bỏ trước khi tách bảng
                page = page.filter(lambda o: not (o.get("object_type") == "char" and o.get("fontname") == drop_font))
            for table in page.extract_tables():
                for row in table:
                    yield no, [clean(c) for c in row]


def byt_xep_cap(path: Path, cfg: dict) -> list[dict]:
    """Bảng 6 cột: STT, Đơn vị, Địa chỉ, Mô hình, Xếp cấp CMKT, Điểm."""
    return [_row(r[1], cap_cmkt=r[4], so_huu="Ministry", vi_tri=f"tr.{p} STT {r[0].rstrip('.')}")
            for p, r in _pdf_tables(path) if len(r) >= 5 and re.fullmatch(r"\d+\.?", r[0])]


def hcm_ksk(path: Path, cfg: dict) -> list[dict]:
    """Bảng 11 cột: TT, Tên, Số GPHĐ, Số nhà và đường, Phường/xã, 5 cột loại hình, Hình thức."""
    so_huu = {"Công lập": "Public", "Tư nhân": "Private"}
    return [_row(r[1], f"{r[3]}, {r[4]}", so_huu.get(r[10], ""), vi_tri=f"tr.{p} TT {r[0]}")
            for p, r in _pdf_tables(path) if len(r) == 11 and r[0].isdigit()]


def danang_ksk(path: Path, cfg: dict) -> list[dict]:
    """Bảng 8 cột: STT, Đơn vị công bố, Tên cơ sở, Địa chỉ, 4 cột loại hình. Dòng bị ngắt trang nối vào dòng trước."""
    out: list[dict] = []
    for p, r in _pdf_tables(path, drop_font="Helvetica"):
        if len(r) < 4 or r[0] == "STT":
            continue
        if r[0].isdigit():
            out.append(_row(r[2], r[3], vi_tri=f"tr.{p} STT {r[0]}"))
        elif out and (r[2] or r[3]) and not r[1]:
            out[-1]["ten"] = clean(f"{out[-1]['ten']} {r[2]}")
            out[-1]["dia_chi"] = clean(f"{out[-1]['dia_chi']} {r[3]}")
    return out


def gialai_cv(path: Path, cfg: dict) -> list[dict]:
    """Phụ lục 2 cột chia 3 mục: I trực thuộc Sở, II bộ/ngành, III tư nhân."""
    muc = {"I": "Public", "II": "Ministry", "III": "Private"}
    out, so_huu = [], ""
    for p, r in _pdf_tables(path):
        m = re.match(r"^(I|II|III)\.", r[0])
        if m:
            so_huu = muc[m.group(1)]
        elif r[0].isdigit() and len(r) > 1:
            out.append(_row(r[1], so_huu=so_huu, vi_tri=f"tr.{p} STT {r[0]}"))
    return out


def html_table(path: Path, cfg: dict) -> list[dict]:
    """Bảng HTML đầu tiên; cot_ten, cot_dia_chi (danh sách) đánh số từ 0."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="ignore"), "html.parser")
    out = []
    for i, tr in enumerate(soup.find("table").find_all("tr")):
        cells = [clean(td.get_text(" ")) for td in tr.find_all("td")]
        if len(cells) <= cfg["cot_ten"] or not cells[0].isdigit():
            continue
        dia_chi = ", ".join(cells[c] for c in cfg.get("cot_dia_chi", []) if c < len(cells) and cells[c])
        out.append(_row(cells[cfg["cot_ten"]], dia_chi, cfg.get("so_huu", ""), vi_tri=f"dòng {cells[0]}"))
    return out


def xlsx_table(path: Path, cfg: dict) -> list[dict]:
    """Sheet `sheet` (mặc định sheet đầu); hàng tiêu đề có cột 'Tên cơ sở', 'Địa chỉ', tùy chọn 'Số văn bản'."""
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[cfg["sheet"]] if cfg.get("sheet") else wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head = next(i for i, r in enumerate(rows) if r and "Tên cơ sở" in [clean(c) for c in r])
    cols = [clean(c) for c in rows[head]]
    ten, dc = cols.index("Tên cơ sở"), cols.index("Địa chỉ")
    vb = cols.index("Số văn bản") if "Số văn bản" in cols else None
    return [_row(r[ten], r[dc], cfg.get("so_huu", ""),
                 vi_tri=f"dòng {head + 1 + k}" + (f" (VB {clean(r[vb])})" if vb is not None else ""))
            for k, r in enumerate(rows[head + 1:], start=1) if r and r[ten]]


PARSERS = {f.__name__: f for f in (byt_xep_cap, hcm_ksk, danang_ksk, gialai_cv, html_table, xlsx_table)}
