"""Kiểm tập kín chỉ bằng dữ liệu tĩnh. Chạy từ gốc repo."""
import argparse
from collections import Counter
from datetime import datetime
from difflib import SequenceMatcher
from hashlib import sha256
from itertools import combinations, product
import json
from pathlib import Path
import re
import unicodedata

import yaml
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CATALOG = ROOT / "knowledge/symptoms/symptom_catalog.md"
COMMON = "cum_mua hong_thanh_quan_viem_mui_hong_cap_tinh viem_hong_cap_tinh viem_mui_xoang_cap_tinh viem_tai_giua_cap_tinh_tre_em viem_thanh_quan_cap_tinh viem_amidan_cap_va_man_tinh viem_mui_xoang_di_ung hen_phe_quan phoi_tac_nghen_man_tinh cam_lanh_thong_thuong".split()

def header(path):
    return yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1])

def vocabulary():
    base = ROOT / "knowledge/conditions"
    paths = sorted((base / "musculoskeletal").glob("*.md"))
    check(len(paths) == 28, "Số hồ sơ cơ xương khớp")
    for name in COMMON:
        path, = base.glob(f"*/{name}.md")
        paths.append(path)
    catalog = {s["symptom_code"]: s for s in header(CATALOG)["symptoms"] if s.get("aliases") and s.get("detection") != "exam"}
    groups = {}
    for path in paths:
        record = header(path)
        check(record["condition_code"] == path.stem, "Hồ sơ sai mã")
        groups.setdefault(record["disease_group"], set()).update(r["symptom_code"] for r in record["relations"] if r["symptom_code"] in catalog)
    return catalog, groups

DATA = HERE / "symptom_extraction_testset_ft.jsonl"
MANIFEST = HERE / "manifest_freeze.json"
SPLIT = HERE / "split_test1_test2.json"
NOTE = "Tuấn xác nhận đã tự rà đủ 30 ca ngày 22/11/2026; chưa rà độc lập; nhãn do tác giả soạn"
REVIEW = "SELF_REVIEWED"
FIELDS = "id disease_group clinical_note expected_symptoms author cross_reviewer review_status".split()
# Tác giả đánh dấu đặc điểm văn phong theo ID. Không lưu đoạn văn hay nhãn y khoa.
STYLES = {
    "north": {1, 13, 17, 29},
    "central": {2, 5, 12, 20, 22},
    "south": {3, 9, 14, 25, 30},
    "parent": {4, 9, 10, 15, 19, 20, 21, 23, 27, 29},
    "long_with_context": {1, 2, 4, 6, 10, 12, 14, 17, 20, 23, 24, 27, 29},
    "typing": {8, 16, 28},
}

def check(ok, message):
    if not ok:
        raise ValueError(message)

def unique_keys(pairs):
    result = dict(pairs)
    check(len(result) == len(pairs), "Khóa JSON trùng")
    return result

def loads(content):
    return json.loads(content, object_pairs_hook=unique_keys)

def normalized_bytes(path):
    return path.read_bytes().replace(b"\r\n", b"\n")

def digest(data):
    return sha256(data).hexdigest()

def words(text):
    plain = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    return re.findall(r"[a-z0-9]+", "".join(c for c in plain if not unicodedata.combining(c)))

def reference_rows():
    records = []
    files = [ROOT / "evaluation" / folder / "symptom_extraction_testset.jsonl" for folder in ("testset", "testset_v1.4")]
    dev = ROOT / "server/tests/unit/ai/data"
    paths = sorted(dev.glob("*.jsonl"))
    check(len(paths) == 4, "Số tệp dev")
    for path, count in zip(files + paths, [29, 29, 10, 26, 10, 30]):
        rows = [loads(line) for line in normalized_bytes(path).splitlines()]
        check(len(rows) == count, f"Số ca đối chiếu {path.name}")
        if path == files[0]:
            check(all(list(row) == FIELDS for row in rows), "Schema nguồn")
        records.extend(rows)
    return records

def fingerprint(row):
    tokens = words(row["clinical_note"])
    grams = set(zip(tokens, tokens[1:], tokens[2:]))
    return row["id"], tokens, grams, row["expected_symptoms"]

def distinct(left, right):
    a, x, gx, sx = left
    b, y, gy, sy = right
    union = gx | gy
    common = len(gx & gy)
    suspicious = x == y or (union and common / len(union) >= .32)
    suspicious |= common >= 4 and common >= .65 * min(len(gx), len(gy))
    if sx == sy:
        suspicious |= SequenceMatcher(None, x, y, autojunk=False).ratio() >= .60
    check(not suspicious, f"Trùng/gần giống {a} / {b}")

def load_data():
    raw = normalized_bytes(DATA)
    lines = raw.splitlines()
    rows = [loads(line) for line in lines]
    check(raw == b"\n".join(lines) + b"\n", "Dấu xuống dòng JSONL")
    for i, (line, row) in enumerate(zip(lines, rows), 1):
        check(list(row) == FIELDS and row["id"] == f"EXT-FT-{i:03d}", f"Schema/ID dòng {i}")
        check(line == json.dumps(row, ensure_ascii=False).encode(), f"Định dạng dòng {i}")
    return raw, lines, rows

def profile(row):
    i = int(row["id"][-3:])
    labels = row["expected_symptoms"]
    traits = Counter({row["disease_group"]: 1, f"codes_{len(labels)}": 1,
                      "absent_cases": int("ABSENT" in labels.values()),
                      "absent_mentions": list(labels.values()).count("ABSENT"),
                      "mentions": len(labels), "short": int(len(words(row["clinical_note"])) <= 15)})
    for style, ids in STYLES.items():
        traits[style] = int(i in ids)
    return traits

def bindings():
    raw, lines, rows = load_data()
    split = loads(SPLIT.read_bytes())
    check(list(split) == ["test-1", "test-2"], "Tên hai nửa")
    halves = list(split.values())
    ids = [r["id"] for r in rows]
    check(all(len(x) == 15 for x in halves) and sorted(sum(halves, [])) == ids, "Phân hoạch ID")
    half_hashes = {name: digest(b"\n".join(line for line, i in zip(lines, ids) if i in selected))
                   for name, selected in split.items()}
    return {"count": len(rows), "sha256": digest(raw), "half_sha256": half_hashes,
            "catalog_sha256": digest(normalized_bytes(CATALOG))}, rows, halves

def verify(manifest=None):
    bound, rows, halves = bindings()
    manifest = loads(MANIFEST.read_bytes()) if manifest is None else manifest
    check(all(manifest.get(k) == v for k, v in bound.items()), "Hash hoặc số ca không khớp")
    check(manifest["review_note"] == NOTE and manifest["review_status"] == REVIEW, "Trạng thái rà")
    check(type(manifest["is_frozen"]) is bool, "Trạng thái đóng băng")
    for field in ["created_at"] + (["frozen_at"] if manifest["is_frozen"] else []):
        check(datetime.fromisoformat(manifest[field]).utcoffset() is not None, field)
    if manifest["is_frozen"]:
        check(manifest["decided_by"] == "Tuấn", "Người đóng băng")
    else:
        check("frozen_at" not in manifest and "decided_by" not in manifest, "Manifest nháp")
    catalog, groups = vocabulary()
    refs = reference_rows()
    baselines = {r["id"] for r in refs}
    profiles = [Counter(), Counter()]
    direct = 0
    for row in rows:
        i, group, note, labels = (row[k] for k in FIELDS[:4])
        check(i not in baselines and row["author"] == "Tuan" and row["cross_reviewer"] == "Tuan (tự rà)" and row["review_status"] == REVIEW, i)
        check(labels and set(labels) <= groups[group] and set(labels.values()) <= {"PRESENT", "ABSENT"}, i)
        traits = profile(row)
        check(not traits["long_with_context"] or len(words(note)) >= 30, f"Ca dài {i}")
        profiles[int(i in halves[1])].update(traits)
        normalized = " " + " ".join(words(note)) + " "
        for code in labels:
            names = [catalog[code]["symptom_name"], *catalog[code]["aliases"]]
            direct += any(" " + " ".join(words(name)) + " " in normalized for name in names)
    new = list(map(fingerprint, rows))
    for pair in combinations(new, 2):
        distinct(*pair)
    for pair in product(new, map(fingerprint, refs)):
        distinct(*pair)
    totals = profiles[0] + profiles[1]
    check(totals["musculoskeletal"] >= .55 * len(rows) and totals["absent_cases"] >= 20, "Nhóm/phủ định")
    check(min(totals[k] for k in ("north", "central", "south")) > 0 and sum(totals[k] for k in ("north", "central", "south")) >= 12, "Ba miền")
    check(totals["parent"] >= 8 and totals["long_with_context"] >= 10 and totals["typing"] == 3 and totals["short"] >= 2, "Kiểu lời kể")
    check(direct <= .25 * totals["mentions"], "Tỷ lệ khớp trực tiếp")
    for key in totals:
        check(abs(profiles[0][key] - profiles[1][key]) <= (2 if key in {"mentions", "absent_mentions"} else 1), f"Phân tầng {key}")
    return {"status": "PASS", "reference_rows": len(refs), "distinct_reference_notes": len({tuple(words(r["clinical_note"])) for r in refs}), "allowed_codes": len(set.union(*groups.values())),
            "used_codes": len(set.union(*(set(r["expected_symptoms"]) for r in rows))), "counts": dict(totals),
            "direct_mentions": direct, "halves": profiles, **bound, "is_frozen": manifest["is_frozen"]}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-codes", action="store_true")
    args = parser.parse_args()
    if args.list_codes:
        print("\n".join(sorted(set.union(*vocabulary()[1].values()))))
    print(json.dumps(verify(), ensure_ascii=False, indent=2))
