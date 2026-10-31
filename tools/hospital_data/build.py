"""Tạo danh mục cơ sở nhận chuyển tuyến từ văn bản của Bộ Y tế và Sở Y tế (xem README.md).

    python -m hospital_data.build            # đọc sources/, ghi manifest.json và output/hospital_candidates.csv
    python -m hospital_data.build export     # dòng có 'x' ở cột chon -> server/data/hospitals.csv
"""
import argparse
import csv
import hashlib
import json
import re
import sys
import tomllib
import unicodedata
from datetime import date
from pathlib import Path

from hospital_data.parsers import PARSERS, clean

HERE = Path(__file__).resolve().parent
SOURCES = HERE / "sources"
CANDIDATES = HERE / "output" / "hospital_candidates.csv"
REVIEW = HERE / "duyet.csv"
HOSPITALS = HERE.parents[1] / "server" / "data" / "hospitals.csv"

CAND_COLS = ["chon", "ten", "tinh", "dia_chi", "loai", "so_huu", "cap_cmkt", "ma_kcb", "nguon", "vi_tri",
             "can_xem", "duyet", "ten_goc"]
OUT_COLS = ["name", "province", "address", "facility_type", "ownership", "tech_level", "kcb_code", "source_doc",
            "source_file"]

# Thứ tự quan trọng: viết tắt dài trước
_ABBR = [(r"^BVĐKKVMNPB\b", "Bệnh viện Đa khoa khu vực miền núi phía Bắc"),
         (r"^BVĐKKV\b", "Bệnh viện Đa khoa khu vực"), (r"^BVĐK\b", "Bệnh viện Đa khoa"),
         (r"^BV\b", "Bệnh viện"), (r"^(TTYT|TT Y tế)\b", "Trung tâm Y tế"),
         (r"^bệnh viện\b", "Bệnh viện"), (r"^trung tâm y tế\b", "Trung tâm Y tế")]
_EXCLUDE = re.compile(r"pháp y", re.I)


def fold(s: str) -> str:
    """Khóa so khớp: bỏ dấu, chữ thường, chỉ giữ chữ và số (cùng ý với lower(f_unaccent(name)) ở CSDL)."""
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return " ".join(re.findall(r"[a-z0-9]+", s))


def normalize_name(raw: str) -> tuple[str, list[str]]:
    name, notes = clean(raw), []
    if name.isupper():
        name, notes = " ".join(w.capitalize() for w in name.split()), ["tên viết hoa toàn bộ"]
    name = re.sub(r"\s+-\s+tỉnh\s+.*$", "", name)
    name = re.sub(r"\bYHCT\b", "Y học cổ truyền", name).replace(" & ", " và ")
    for pat, rep in _ABBR:
        name = re.sub(pat, rep, name, flags=re.I)
    head = re.split(r"\s+(?:trực\s+)?thuộc\s+", name, maxsplit=1)
    if len(head) == 2:
        name, notes = head[0], ["bỏ phần 'thuộc ...'"]
    return name, notes


def facility_type(name: str) -> str | None:
    if _EXCLUDE.search(name):
        return None
    if name.startswith(("Bệnh viện", "Viện ")):
        return "Hospital"
    if name.startswith("Trung tâm Y tế"):
        return "HealthCenter"
    return None


def _split_grouped(row: dict) -> list[dict]:
    """Ô tên chỉ ghi 'Bệnh viện', các cơ sở liệt kê sau dấu * ở ô địa chỉ (trang Sở Y tế Huế)."""
    if row["ten"] != "Bệnh viện" or "*" not in row["dia_chi"]:
        return [row]
    out = []
    for seg in filter(None, (clean(s) for s in row["dia_chi"].split("*"))):
        m = re.match(r"(Bệnh viện.*?\))\s*(.*)", seg)
        if m:
            out.append(row | {"ten": m.group(1), "dia_chi": m.group(2), "_note": "tách từ ô gộp"})
    return out


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_config() -> list[dict]:
    with open(HERE / "sources.toml", "rb") as f:
        return tomllib.load(f)["nguon"]


def _byt_provinces() -> dict[str, str]:
    with open(HERE / "byt_tinh.csv", encoding="utf-8-sig", newline="") as f:
        return {fold(r["ten"]): r["tinh"] for r in csv.DictReader(f)}


def check_sources(cfg: list[dict]) -> list[str]:
    """Ghi SHA-256 từng file nguồn vào manifest.json; báo nếu file đã đổi so với lần trước."""
    path = SOURCES / "manifest.json"
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    new, warnings = {}, []
    for src in cfg:
        for name in src["files"]:
            f = SOURCES / src["id"] / name
            if not f.exists():
                raise SystemExit(f"Thiếu file nguồn: {f.relative_to(HERE)}")
            key = f"{src['id']}/{name}"
            digest = sha256(f)
            prev = old.get(key, {})
            if prev and prev.get("sha256") != digest:
                warnings.append(f"Nguồn đã đổi so với lần trước: {key}")
            new[key] = {"sha256": digest, "bytes": f.stat().st_size, "co_quan": src["co_quan"],
                        "van_ban": src["van_ban"], "url": src["url"],
                        "ghi_nhan": prev.get("ghi_nhan") if prev.get("sha256") == digest else date.today().isoformat()}
    path.write_text(json.dumps(new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return warnings


def collect(cfg: list[dict]) -> list[dict]:
    byt = _byt_provinces()
    merged: dict[tuple[str, str], dict] = {}
    by_core: dict[tuple[str, str], dict] = {}
    for src in cfg:
        for name in src["files"]:
            for row in (r for raw in PARSERS[src["parser"]](SOURCES / src["id"] / name, src)
                        for r in _split_grouped(raw)):
                ten, notes = normalize_name(row["ten"])
                loai = facility_type(ten)
                if loai is None:
                    continue
                if row.pop("_note", None):
                    notes.append("tách từ ô gộp")
                tinh = src.get("tinh") or byt.get(fold(row["ten"]), "")
                if not tinh:
                    notes.append("chưa rõ tỉnh")
                if src.get("can_xem"):
                    notes.append(src["can_xem"])
                cur = merged.get((tinh, fold(ten)))
                core = _core(ten, tinh)
                if cur is None and src.get("bo_sung") and core and (tinh, core) in by_core:
                    # Nguồn cũ chỉ bổ sung địa chỉ cho cơ sở đã có ở nguồn hiện hành (tên có thể đã đổi)
                    cur = by_core[(tinh, core)]
                if cur is not None and src.get("bo_sung"):
                    notes = []
                ref = f"{src['id']}: {row['vi_tri']}"
                if cur is None:
                    cur = merged[(tinh, fold(ten))] = {
                        "chon": "x", "ten": ten, "tinh": tinh, "dia_chi": row["dia_chi"], "loai": loai,
                        "so_huu": row["so_huu"], "cap_cmkt": row["cap_cmkt"], "ma_kcb": "",
                        "nguon": src["id"], "vi_tri": ref, "can_xem": notes, "duyet": "", "ten_goc": row["ten"],
                        "_doc": src["van_ban"], "_file": f"{src['id']}/{name}"}
                    if core and not src.get("bo_sung"):
                        by_core.setdefault((tinh, core), cur)
                    continue
                if src["id"] not in cur["nguon"].split("; "):
                    cur["nguon"] += f"; {src['id']}"
                cur["vi_tri"] += f"; {ref}"
                for k in ("dia_chi", "so_huu", "cap_cmkt"):
                    if not cur[k]:
                        cur[k] = row[k]
                cur["can_xem"] += notes
    _flag_near_duplicates(list(merged.values()))
    out = []
    for c in sorted(merged.values(), key=lambda c: (c["tinh"], fold(c["ten"]))):
        c["can_xem"] = "; ".join(dict.fromkeys(c["can_xem"]))
        if c["can_xem"]:
            c["chon"] = ""
        out.append(c)
    return out


_GENERIC_PHRASES = re.compile(r"\b(benh vien|da khoa|trung tam y te|khu vuc|thi xa|thanh pho|huyen|quan|tinh|tp|va)\b")


def _core(name: str, tinh: str) -> str:
    """Phần tên riêng: bỏ cụm từ chung và tên tỉnh, để nhận ra cùng một cơ sở viết khác nhau giữa các nguồn."""
    words = _GENERIC_PHRASES.sub(" ", fold(name)).split()
    drop = set(fold(tinh).split())
    return " ".join(w for w in words if w not in drop)


def _flag_near_duplicates(rows: list[dict]) -> None:
    """Vd 'Bệnh viện Tâm thần' / 'Bệnh viện Tâm Thần Huế', 'Bệnh viện đa khoa Phú Xuyên' / '... huyện Phú Xuyên'."""
    by_core: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        by_core.setdefault((r["tinh"], _core(r["ten"], r["tinh"])), []).append(r)
        if len(r["ten"]) > 80:
            r["can_xem"].append("tên dài, có thể lẫn địa chỉ")
    for group in by_core.values():
        for r in group if len(group) > 1 else []:
            r["can_xem"].append("có thể trùng: " + " | ".join(o["ten"] for o in group if o is not r))


def apply_review(rows: list[dict], path: Path = REVIEW) -> list[str]:
    """Áp quyết định đã duyệt (duyet.csv) để chạy lại build không mất công duyệt.

    hanh_dong: giu | bo; ten_moi, dia_chi ('-' = xóa), so_huu ghi đè khi có. Khớp theo tỉnh + tên không dấu.
    """
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        decisions = {(d["tinh"], fold(d["ten"])): d for d in csv.DictReader(f)}
    used = set()
    for r in rows:
        d = decisions.get((r["tinh"], fold(r["ten"])))
        if d is None:
            continue
        used.add((r["tinh"], fold(r["ten"])))
        if d["hanh_dong"] == "bo":
            r["chon"], r["duyet"] = "", f"bỏ: {d['ly_do']}".rstrip(": ")
            continue
        if d["hanh_dong"] != "giu":
            raise SystemExit(f"duyet.csv: hanh_dong phải là giu hoặc bo ({d['ten']})")
        if d["ten_moi"]:
            r["ten"] = d["ten_moi"]
        if d["dia_chi"]:
            r["dia_chi"] = "" if d["dia_chi"] == "-" else d["dia_chi"]
        if d["so_huu"]:
            r["so_huu"] = d["so_huu"]
        r["chon"], r["duyet"] = "x", f"giữ: {d['ly_do']}".rstrip(": ")
    return [f"duyet.csv: không còn dòng '{d['ten']}' ({d['tinh']})" for k, d in decisions.items() if k not in used]


def write_candidates(rows: list[dict], path: Path = CANDIDATES) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAND_COLS + ["_doc", "_file"])
        w.writeheader()
        w.writerows(rows)


def export(src: Path = CANDIDATES, dst: Path = HOSPITALS) -> int:
    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["chon"].strip().lower() == "x"]
    bad = [r["ten"] for r in rows if not r["tinh"] or r["loai"] not in ("Hospital", "HealthCenter")]
    if bad:
        raise SystemExit(f"Dòng đã chọn nhưng thiếu tỉnh hoặc sai loại: {bad[:5]}")
    keys = [(r["tinh"], fold(r["ten"])) for r in rows]
    if len(set(keys)) != len(keys):
        raise SystemExit("Có hai dòng cùng tỉnh và cùng tên không dấu (CSDL chặn bằng uq_referral_facility_identity)")
    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(dst, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLS)
        w.writeheader()
        for r in sorted(rows, key=lambda r: (r["tinh"], fold(r["ten"]))):
            w.writerow({"name": r["ten"], "province": r["tinh"], "address": r["dia_chi"], "facility_type": r["loai"],
                        "ownership": r["so_huu"], "tech_level": r["cap_cmkt"], "kcb_code": r["ma_kcb"],
                        "source_doc": r["_doc"], "source_file": r["_file"]})
    return len(rows)


def main() -> int:
    p = argparse.ArgumentParser(description="Danh mục cơ sở nhận chuyển tuyến")
    p.add_argument("lenh", nargs="?", default="build", choices=["build", "export"])
    args = p.parse_args()
    if args.lenh == "export":
        print(f"Đã ghi {export()} cơ sở vào {HOSPITALS}")
        return 0
    cfg = load_config()
    for w in check_sources(cfg):
        print("CẢNH BÁO:", w)
    rows = collect(cfg)
    for w in apply_review(rows):
        print("CẢNH BÁO:", w)
    write_candidates(rows)
    pending = sum(1 for r in rows if r["can_xem"] and not r["duyet"])
    chosen = sum(1 for r in rows if r["chon"])
    print(f"{len(rows)} cơ sở, chọn {chosen} -> {CANDIDATES.relative_to(HERE)} ({pending} dòng cần xem chưa duyệt)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
