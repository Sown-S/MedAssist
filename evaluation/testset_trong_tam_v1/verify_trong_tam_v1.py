"""Kiểm bộ ca đã đối chiếu Pha B bằng dữ liệu tĩnh."""
import csv
import hashlib
import json
import math
import operator
import re
from collections import Counter
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
KB = ROOT / "knowledge"
INPUT = ["case_id", "disease_group", "age_years", "vital_signs", "symptoms"]
LABEL = ["expected_priority", "expected_triggered_rules", "expected_top_conditions"]
FIELDS = INPUT + LABEL + ["author", "cross_reviewer", "review_status"]
PRIORITY = ["Routine", "HighPriority", "Emergency"]
VITALS = set("temperature_c heart_rate_bpm respiratory_rate_bpm systolic_bp_mmhg "
             "diastolic_bp_mmhg spo2_pct weight_kg height_cm".split())
COMMON = set("cum_mua hong_thanh_quan_viem_mui_hong_cap_tinh viem_hong_cap_tinh "
             "viem_mui_xoang_cap_tinh viem_tai_giua_cap_tinh_tre_em viem_thanh_quan_cap_tinh "
             "viem_amidan_cap_va_man_tinh viem_mui_xoang_di_ung hen_phe_quan "
             "phoi_tac_nghen_man_tinh cam_lanh_thong_thuong".split())


def check(test, message):
    if not test:
        raise ValueError(message)


def front(path):
    return yaml.safe_load(path.read_text("utf-8").split("---", 2)[1])


def records(path):
    return [json.loads(s) for s in path.read_text("utf-8").splitlines() if s.strip()]


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def table(name, fields, ids):
    with (HERE / name).open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        check(reader.fieldnames == fields, name)
        rows = list(reader)
    check(all(set(row) == set(fields) and None not in row.values() for row in rows), name)
    keyed = {row["case_id"]: row for row in rows}
    check(len(rows) == len(ids) and keyed.keys() == ids, name)
    return keyed


def matches(node, case):
    # Cả 12 cây chỉ kiểm trạng thái triệu chứng PRESENT.
    # Khóa thiếu không đủ để xác lập một lá dương tính.
    if "op" in node:
        combine = {"AND": all, "OR": any}[node["op"]]
        return combine(matches(child, case) for child in node["args"])
    if node["type"] == "symptom":
        return case["symptoms"].get(node["symptom_code"], "UNKNOWN") == node["state"]
    if node["type"] == "age" and node["unit"] == "years":
        value = case["age_years"]
    else:
        check(node["type"] == "vital", str(node))
        value = case["vital_signs"].get(node["vital"])
    compare = {"<": operator.lt, ">": operator.gt, ">=": operator.ge}[node["cmp"]]
    return value is not None and compare(value, node["value"])


def verify():
    manifest = json.loads((HERE / "manifest_freeze.json").read_text("utf-8"))
    for path in HERE.iterdir():
        if path.is_file():
            raw = path.read_bytes()
            check(not raw.decode("utf-8").startswith("\ufeff") and b"\r" not in raw, path.name)
    check(manifest["is_frozen"] is False and manifest["phase"] == "B"
          and manifest["review_status"] == "PENDING_PHYSICIAN_REVIEW", "Trạng thái manifest")
    check(front(KB / "_release.md")["label"] == manifest["kb_release"], "Phiên bản KB")
    parents = [ROOT / "evaluation" / name for name in ("testset", "testset_v1.4")]
    refs = {p.relative_to(ROOT).as_posix(): digest(p.read_bytes().replace(b"\r\n", b"\n"))
            for folder in parents for p in folder.rglob("*") if p.is_file() and "__pycache__" not in p.parts}
    check(refs == manifest["reference_file_sha256"], "Hash hoặc danh sách tệp v1.3/v1.4")
    signatures, old_ids = set(), set()
    for parent in parents:
        for path in parent.glob("*.jsonl"):
            for row in records(path):
                old_ids.add(row.get("case_id", row.get("id")))
                signatures.add(frozenset(row.get("symptoms", row.get("expected_symptoms"))))
    catalog = {s["symptom_code"] for s in front(KB / "symptoms/symptom_catalog.md")["symptoms"]}
    conditions = {d["condition_code"]: d for d in map(front, (KB / "conditions").rglob("*.md"))}
    rules = {r["rule_key"]: r for r in map(front, (KB / "rules").rglob("*.md"))}
    groups = {d["disease_group"] for d in conditions.values()}
    acceptance = ROOT / "evaluation/results/kb_2026_11_acceptance"
    removed = set(json.loads((acceptance / "removal_checks.json").read_text("utf-8"))["removed_codes"])
    removed.update(c["condition_code"] for c in json.loads(
        (acceptance / "demo_removed_conditions.json").read_text("utf-8"))["cases"])
    focus = COMMON | {c for c, d in conditions.items() if d["disease_group"] == "musculoskeletal"}
    path = HERE / "clinical_cases_labeled.jsonl"
    cases = records(path)
    count = len(cases)
    ids = {c["case_id"] for c in cases}
    check(40 <= count <= 60 and ids == {f"CLIN-T{i:02}" for i in range(1, count + 1)}
          and ids.isdisjoint(old_ids), "Dải ID hoặc số ca")
    sha = digest(path.read_bytes())
    check(manifest["files"] == [dict(path=path.relative_to(ROOT).as_posix(), num_cases=count,
                                     sha256=sha, raw_sha256=sha)]
          and manifest["combined_order"] == [path.name]
          and manifest["combined_sha256"] == digest(sha.encode()), "Hash JSONL")
    blind_name, author_name = "phieu_gan_nhan_huy.csv", "author_proposed_labels.csv"
    check(manifest["review_csv_sha256"] == {n: digest((HERE / n).read_bytes())
          for n in (blind_name, author_name, "huy_labels.csv")}, "Hash phiếu")
    blind = table(blind_name, INPUT + LABEL + ["ghi_chu"], ids)
    author = table(author_name, ["case_id"] + LABEL, ids)
    huy = table("huy_labels.csv", INPUT + LABEL + ["ghi_chu"], ids)
    agreements = Counter()
    pending = []
    priorities, distribution, covered = Counter(), Counter(), set()
    for c in cases:
        cid = c["case_id"]
        check(list(c) == FIELDS and c["author"] == "Tuan" and c["cross_reviewer"] == "Huy", cid + " schema")
        check(c["disease_group"] in groups and type(c["age_years"]) in (float, int)
              and 0 <= c["age_years"] <= 125, cid + " tuổi/nhóm")
        v, s = c["vital_signs"], c["symptoms"]
        check(isinstance(v, dict) and v.keys() <= VITALS and all(type(x) in (int, float)
              and math.isfinite(x) and x > 0 for x in v.values())
              and v.get("spo2_pct", 100) <= 100, cid + " sinh hiệu")
        check(isinstance(s, dict) and s.keys() <= catalog and "PRESENT" in s.values()
              and set(s.values()) <= {"PRESENT", "ABSENT", "UNKNOWN"}, cid + " triệu chứng")
        sig = frozenset(s)
        check(sig not in signatures, cid + " trùng tập mã triệu chứng")
        signatures.add(sig)
        b = blind[cid]
        check(all(not b[k] for k in LABEL + ["ghi_chu"]) and b["disease_group"] == c["disease_group"]
              and all(json.loads(b[k]) == c[k] for k in INPUT[2:]), cid + " phiếu mù")
        a = author[cid]
        top = json.loads(a[LABEL[2]])
        check(isinstance(top, list) and top and len(top) == len(set(top))
              and set(top) <= conditions.keys() - removed and top[0] in focus
              and conditions[top[0]]["disease_group"] == c["disease_group"], cid + " mã bệnh")
        for code in top:
            check(re.fullmatch(r"[a-z0-9]+(_[a-z0-9]+)*", code), cid + " slug")
        covered.add(top[0])
        hits = sorted(k for k, r in rules.items() if matches(r["condition_logic"], c))
        expected = max([PRIORITY[0]] + [rules[k]["resulting_priority"] for k in hits], key=PRIORITY.index)
        check(sorted(json.loads(a[LABEL[1]])) == hits and a[LABEL[0]] == expected, cid + " luật/ưu tiên")
        h = huy[cid]
        check(all(b[k] == h[k] for k in INPUT), cid + " đầu vào phiếu Huy")
        h_rules, h_top = (json.loads(h[k]) for k in LABEL[1:])
        for values, allowed in ((h_rules, rules.keys()), (h_top, conditions.keys() - removed)):
            check(isinstance(values, list) and len(values) == len(set(values))
                  and set(values) <= allowed, cid + " mã trên phiếu Huy")
        check(h[LABEL[0]] in PRIORITY and (h_top or h[LABEL[0]] == "Emergency"), cid + " nhãn Huy")
        proposed = [expected, hits, top]
        reviewed = [h[LABEL[0]], sorted(h_rules), h_top]
        for key, left, right in zip(LABEL, proposed, reviewed):
            agreements[key] += left == right
        agreed = proposed == reviewed
        if not agreed:
            pending.append(cid)
        check(c["review_status"] == ("CROSS_REVIEW_AGREED" if agreed else "PENDING_CROSS_REVIEW")
              and [c[k] for k in LABEL] == (proposed if agreed else [None, [], []]), cid + " kết quả gộp")
        priorities[expected] += 1
        distribution[c["disease_group"]] += 1
    check(covered == focus and .55 <= distribution["musculoskeletal"] / count <= .60
          and priorities["Routine"] * 2 >= count, "Độ phủ")
    summary = dict(agreements, all_fields=count-len(pending), denominator=count,
                   pending_case_ids=sorted(pending), reviewer_notes=sum(bool(r["ghi_chu"].strip()) for r in huy.values()))
    check(summary == manifest["agreement"], "Biên bản đồng thuận")
    print(f"PASS Pha B | {count} ca | {len(covered)} bệnh đề xuất | {len(refs)} tệp đối chiếu")
    print(dict(distribution), dict(priorities))
    print(summary)


if __name__ == "__main__":
    verify()
