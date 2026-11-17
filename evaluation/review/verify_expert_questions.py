"""Đối chiếu hai phiếu chuyên gia với KB và bảng rà nguồn; chỉ đọc, không gọi DB/LLM."""
from collections import Counter
import csv
from decimal import Decimal
import hashlib
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ACCEPTANCE = ROOT / "evaluation/results/kb_2026_11_acceptance"
COMMON = set("""cum_mua hong_thanh_quan_viem_mui_hong_cap_tinh viem_hong_cap_tinh
viem_amidan_cap_va_man_tinh viem_thanh_quan_cap_tinh viem_mui_xoang_cap_tinh
viem_mui_xoang_di_ung viem_tai_giua_cap_tinh_tre_em hen_phe_quan
phoi_tac_nghen_man_tinh""".split())
ICD_CASES = {"benh_viem_khop_vay_nen", "viem_khop_thieu_nien_tu_phat_the_viem_khop_vay_nen"}
HEADERS = ["nhóm câu hỏi", "condition_code", "tên bệnh", "symptom_code", "tên triệu chứng",
           "trọng số hiện tại", "nguồn/trích dẫn", "câu hỏi cho bác sĩ",
           "phương án đề xuất (nếu có)", "trả lời bác sĩ"]


def front(path):
    return yaml.safe_load(path.read_text(encoding="utf-8-sig").split("---", 2)[1])


def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        return reader.fieldnames, list(reader)


def verify():
    conditions, musculoskeletal = {}, set()
    for path in (ROOT / "knowledge/conditions").rglob("*.md"):
        item = front(path)
        code = item["condition_code"]
        assert code not in conditions, code
        conditions[code] = item
        if path.parent.name == "musculoskeletal":
            musculoskeletal.add(code)
    catalog = {s["symptom_code"]: s["symptom_name"] for s in
               front(ROOT / "knowledge/symptoms/symptom_catalog.md")["symptoms"]}
    assert len(conditions) == 153 and len(musculoskeletal) == 28 and len(catalog) == 299
    assert front(ROOT / "knowledge/_release.md")["label"] == "KB-2026.11"
    assert COMMON <= conditions.keys()
    focus = musculoskeletal | COMMON
    assert len(focus) == 38
    missing = {x["condition_code"] for x in json.loads(
        (ACCEPTANCE / "conditions_without_key.json").read_text(encoding="utf-8-sig"))}
    assert missing == {c for c, d in conditions.items() if not any(r["is_key"] for r in d["relations"])}
    source_rows = rows(ACCEPTANCE / "cross_links.csv")[1]
    source_links = [(r["condition_code"], r["symptom_code"]) for r in source_rows
                    if r["quyết định"] == "CẦN BÁC SĨ QUYẾT"]
    assert len(source_links) == len(set(source_links)) == 597
    owners = {(r["condition_code"], r["symptom_code"]): r["bệnh chủ"] for r in source_rows}
    seen, found = set(), {"a": set(), "b": set(), "c": set()}
    counts, references, answered = {}, 0, 0
    for name, inside in (("expert_questions_nhom_trong_tam.csv", True),
                         ("expert_questions_ngoai_nhom.csv", False)):
        header, questions = rows(HERE / name)
        assert header == HEADERS
        count, owner_order = Counter(), []
        for q in questions:
            assert None not in q and all(value is not None for value in q.values())
            c, s, group = q["condition_code"], q["symptom_code"], q["nhóm câu hỏi"][0]
            assert group in found and c in conditions and (c in focus) == inside
            assert q["tên bệnh"] == conditions[c]["name_vi"]
            key = (group, c, s)
            assert key not in seen, key
            seen.add(key)
            count[group] += 1
            answered += bool(q["trả lời bác sĩ"].strip())
            assert q["câu hỏi cho bác sĩ"].endswith("?") and "CHƯA ĐỦ" in q["câu hỏi cho bác sĩ"]
            if group == "b":
                found[group].add(c)
                assert q["symptom_code"] == q["tên triệu chứng"] == q["trọng số hiện tại"] == ""
                assert conditions[c]["icd10_code"] in q["câu hỏi cho bác sĩ"]
                continue
            codes, names, weights = s.split(";"), q["tên triệu chứng"].split(" | "), q["trọng số hiện tại"].split(";")
            assert len(codes) == len(set(codes)) == len(names) == len(weights)
            if group == "a":
                found[group].add(c)
                assert codes == [r["symptom_code"] for r in conditions[c]["relations"]]
            else:
                assert len(codes) == 1 and (c, s) in set(source_links)
                found[group].add((c, s))
                owner = owners[(c, s)]
                assert q["nhóm câu hỏi"] == "c) LIÊN KẾT — bệnh chủ: " + owner
                assert q["phương án đề xuất (nếu có)"] == ""
                owner_order.append((owner, c, s))
            for code, name_vi, weight in zip(codes, names, weights):
                assert code in catalog and name_vi == catalog[code]
                matches = [r for r in conditions[c]["relations"] if r["symptom_code"] == code]
                assert len(matches) == 1
                rel = matches[0]
                assert Decimal(weight) == Decimal(str(rel["weight"])) and rel["polarity"] == "SUPPORTS"
                if group == "a":
                    assert rel["is_key"] is False
                source = f"knowledge/sources/{rel['source_key']}.md"
                assert (ROOT / source).is_file() and source in q["nguồn/trích dẫn"]
                excerpts = [e for e in conditions[c]["excerpts"] if e["source_key"] == rel["source_key"]]
                assert excerpts and all(e["excerpt_key"] in q["nguồn/trích dẫn"] for e in excerpts)
                references += 1
        assert owner_order == sorted(owner_order)
        counts[name] = {k: count[k] for k in "abc"}
    assert found["a"] == missing and len(missing) == 16
    assert found["b"] == ICD_CASES and found["c"] == set(source_links)
    assert counts["expert_questions_nhom_trong_tam.csv"] == {"a": 6, "b": 2, "c": 110}
    assert counts["expert_questions_ngoai_nhom.csv"] == {"a": 10, "b": 0, "c": 487}
    assert len(seen) == 615 and references == 813
    historical_keys = rows(ACCEPTANCE / "key_symptoms.csv")[1]
    for key in historical_keys:
        rel = next(r for r in conditions[key["condition_code"]]["relations"] if r["symptom_code"] == key["symptom_code"])
        assert rel["is_key"] and Decimal(str(rel["weight"])) == Decimal(key["weight_new"])
        assert rel["source_key"] == key["source_key"]
    manifest = json.loads((ROOT / "evaluation/testset/manifest_freeze.json").read_text(encoding="utf-8"))
    hashes = []
    for entry in manifest["files"]:
        value = hashlib.sha256((ROOT / entry["path"]).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
        assert value == entry["sha256"]
        hashes.append(value)
    combined = hashlib.sha256(":".join(hashes).encode()).hexdigest()
    assert combined == manifest["combined_sha256"] == "4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d"
    return {"status": "PASS", "counts": counts, "questions": len(seen), "missing": 0,
            "duplicates": 0, "relation_references": references, "answered_questions": answered,
            "historical_keys_verified": len(historical_keys), "v1_3_combined_sha256": combined}


if __name__ == "__main__":
    print(json.dumps(verify(), ensure_ascii=False, indent=2))
