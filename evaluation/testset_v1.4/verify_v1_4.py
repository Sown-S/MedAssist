"""Kiểm v1.4 riêng bằng byte gốc và nhãn; chỉ đọc, không chạy pipeline/LLM/CSDL."""
import csv
from collections import Counter
import hashlib
import json
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TARGETS = {"CLIN-019", "EXT-010", "EXT-014", "EXT-024", "EXT-026"}
PENDING = {"CLIN-019"}
LABEL_CHANGED = TARGETS - PENDING


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def front(path):
    return yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1])


def records(path):
    chunks = path.read_bytes().splitlines(keepends=True)
    data = []
    for raw in chunks:
        if raw.strip():
            obj = json.loads(raw)
            data.append((obj.get("case_id", obj.get("id")), raw, obj))
    assert len(data) == len({row[0] for row in data}), f"Trùng ID: {path}"
    return data, [x for x in chunks if not x.strip()]


def labels(obj):
    names = ("symptoms", "expected_priority", "expected_triggered_rules", "expected_top_conditions") if "case_id" in obj else ("expected_symptoms",)
    return {k: obj[k] for k in names}


def verify():
    manifest = load(HERE / "manifest_freeze_v1.4.json")
    assert manifest["review_status"] == "PENDING_CROSS_REVIEW"
    assert manifest["is_separate_testset"] is True and manifest["is_frozen"] is False
    assert manifest["benchmark_status"] == "NOT_RUN"
    parent = manifest["parent_testset"]
    original_manifest_path = ROOT / parent["manifest_path"]
    assert sha(original_manifest_path.read_bytes()) == parent["manifest_raw_sha256"]
    original_manifest = load(original_manifest_path)
    assert manifest["combined_sha256_formula"] == original_manifest["combined_sha256_formula"]
    assert manifest["sha256_normalization"] == original_manifest["sha256_normalization"]
    original_hashes = []
    for expected in parent["files"]:
        raw = (ROOT / expected["path"]).read_bytes()
        assert sha(raw) == expected["raw_sha256"]
        value = sha(raw.replace(b"\r\n", b"\n"))
        assert value == expected["sha256"]
        assert value == next(x["sha256"] for x in original_manifest["files"] if x["path"] == expected["path"])
        original_hashes.append(value)
    original_combined = sha(":".join(original_hashes).encode("utf-8"))
    assert original_combined == parent["combined_sha256"] == original_manifest["combined_sha256"]
    assert original_combined == "4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d"

    append = manifest["source_readme_append"]
    readme = (ROOT / append["path"]).read_bytes()
    prefix = readme[:append["original_byte_length"]]
    assert sha(prefix) == append["original_raw_sha256"]
    assert readme[append["original_byte_length"]:] == bytes.fromhex(append["appended_bytes_hex"])
    assert len(readme[append["original_byte_length"]:].splitlines()) == 1

    reviews = {}
    for source in manifest["sources"]:
        path = ROOT / source["path"]
        assert sha(path.read_bytes()) == source["raw_sha256"]
        if path.suffix == ".csv":
            with path.open(encoding="utf-8-sig", newline="") as stream:
                rows = list(csv.DictReader(stream))
            assert len(rows) == source["rows"] and len(rows) == len({r["case_id"] for r in rows})
            reviews.update({r["case_id"]: r for r in rows})
    assert {key for key, row in reviews.items() if row["verdict"] == "CẦN SỬA"} == TARGETS
    for reference, expected_hash in manifest["reference_file_raw_sha256"].items():
        assert sha((ROOT / reference).read_bytes()) == expected_hash

    catalog = {row["symptom_code"]: row["symptom_name"] for row in front(ROOT / "knowledge/symptoms/symptom_catalog.md")["symptoms"]}
    condition_data = [front(p) for p in (ROOT / "knowledge/conditions").rglob("*.md")]
    conditions = {x["condition_code"] for x in condition_data}
    assert len(catalog) == 299 and len(conditions) == 153
    assert sum(x["disease_group"] == "musculoskeletal" for x in condition_data) == 28
    assert len(list((ROOT / "knowledge/sources").glob("*.md"))) == 11
    assert len(list((ROOT / "knowledge/rules").rglob("*.md"))) == 12
    assert manifest["knowledge_snapshot"]["groups"] == dict(Counter(x["disease_group"] for x in condition_data))
    assert front(ROOT / "knowledge/_release.md")["label"] == "KB-2026.11"
    kb = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in sorted((ROOT / "knowledge").rglob("*")) if p.is_file()}
    assert kb == manifest["knowledge_file_sha256_before"]

    source_names = {"clinical_cases_labeled_v1.4.jsonl": ("clinical_cases_labeled.jsonl", 82),
                    "symptom_extraction_testset_v1.4.jsonl": ("symptom_extraction_testset.jsonl", 29)}
    changes = {x["case_id"]: x for x in manifest["case_changes"]}
    assert len(changes) == 5 and set(changes) == set(manifest["changed_case_ids"]) == TARGETS
    old_all, new_all, new_raw_all, diffs, file_reports, new_hashes = {}, {}, {}, [], [], {}
    unchanged = 0
    for entry in manifest["files"]:
        path = ROOT / entry["path"]
        original_name, expected_count = source_names[path.name]
        old_records, old_blanks = records(ROOT / "evaluation/testset" / original_name)
        new_records, new_blanks = records(path)
        assert old_blanks == new_blanks
        assert len(old_records) == len(new_records) == entry["num_cases"] == expected_count
        assert [x[0] for x in old_records] == [x[0] for x in new_records]
        assert sha(path.read_bytes()) == entry["raw_sha256"]
        new_hashes[path.name] = sha(path.read_bytes().replace(b"\r\n", b"\n"))
        assert new_hashes[path.name] == entry["sha256"]
        file_changed, file_unchanged = [], 0
        for (case_id, old_raw, old), (_, new_raw, new) in zip(old_records, new_records):
            assert case_id not in old_all and case_id not in new_all
            old_all[case_id], new_all[case_id] = old, new
            new_raw_all[case_id] = new_raw
            codes = new.get("symptoms", new.get("expected_symptoms", {}))
            assert set(codes) <= catalog.keys(), case_id
            assert set(new.get("expected_top_conditions", [])) <= conditions, case_id
            assert set(codes.values()) <= {"PRESENT", "ABSENT", "UNKNOWN"}
            if old_raw == new_raw:
                unchanged += 1
                file_unchanged += 1
                continue
            assert case_id in TARGETS, f"Đổi ca ngoài phạm vi: {case_id}"
            fields = sorted(k for k in old.keys() | new.keys() if old.get(k) != new.get(k))
            assert set(fields) == ({"review_status", "revision_note"} if case_id in PENDING else {"review_status", "revision_note", "expected_symptoms"})
            assert new["review_status"] == "PENDING_CROSS_REVIEW"
            entry_change = changes[case_id]
            assert entry_change["huy_comment_full"] == reviews[case_id]["nhận xét"]
            assert entry_change["source_reviewer"] == reviews[case_id]["người rà"] == "Huy"
            assert entry_change["old_labels"] == labels(old) and entry_change["new_labels"] == labels(new)
            assert entry_change["labels_changed"] == (labels(old) != labels(new))
            assert entry_change["changed_fields"] == {k: {"old": old.get(k), "new": new.get(k)} for k in fields}
            assert old.get("clinical_note") == new.get("clinical_note")
            if case_id in PENDING:
                assert labels(old) == labels(new)
                assert entry_change["decision_status"] == "CẦN BÁC SĨ QUYẾT"
            diffs.append({"case_id": case_id, "changed_fields": fields, "labels_changed": labels(old) != labels(new)})
            file_changed.append(case_id)
        file_reports.append({"file": path.name, "cases": expected_count, "changed_ids": file_changed, "unchanged_record_bytes": file_unchanged})

    assert len(old_all) == len(new_all) == 111
    assert {r["case_id"] for r in diffs} == TARGETS
    assert {r["case_id"] for r in diffs if r["labels_changed"]} == set(manifest["label_changed_case_ids"]) == LABEL_CHANGED
    assert unchanged == manifest["unchanged_record_bytes_count"] == 106
    assert {x["case_id"] for x in manifest["pending_cases"]} == PENDING
    assert all(x["labels_retained_from_v1_3"] is True for x in manifest["pending_cases"])

    for key in ("EXT-014", "EXT-024", "EXT-026"):
        assert "sốt" not in new_all[key]["clinical_note"].casefold()
        assert "fever_high" not in new_all[key]["expected_symptoms"]
    expected_14 = dict(old_all["EXT-014"]["expected_symptoms"])
    expected_14.pop("fever_high")
    assert new_all["EXT-014"]["expected_symptoms"] == expected_14
    expected_24 = dict(old_all["EXT-024"]["expected_symptoms"])
    expected_24.pop("fever_high")
    expected_24["scabies_interdigital_burrows_nocturnal"] = "PRESENT"
    assert new_all["EXT-024"]["expected_symptoms"] == expected_24
    assert all(x in new_all["EXT-024"]["clinical_note"] for x in ("về đêm", "kẽ ngón tay", "đường hầm luống ghẻ"))
    expected_26 = dict(old_all["EXT-026"]["expected_symptoms"])
    expected_26.pop("fever_high")
    expected_26["gonorrhea_purulent_urethritis_dysuria"] = "PRESENT"
    assert new_all["EXT-026"]["expected_symptoms"] == expected_26
    assert all(x in new_all["EXT-026"]["clinical_note"] for x in ("đái buốt", "đái rắt", "mủ vàng xanh", "buổi sáng"))
    assert "EXT-026 dùng `gonorrhea_purulent_urethritis_dysuria`" in (ROOT / "evaluation/review/README_review.md").read_text(encoding="utf-8")

    options = manifest["policy_options_EXT_010"]
    assert options["status"] == "OPTION_A_CONFIRMED_BY_USER" and options["selected_option"] == "A"
    assert options["current_labels_retained_for_compatibility_only"] is False
    assert options["scope"]["does_not_reverse_EXT_011"] is True
    assert options["scope"]["does_not_change_KB_rules_or_prompts"] is True
    original_labels = old_all["EXT-010"]["expected_symptoms"]
    option_a = dict(original_labels)
    option_a.pop("mechanical_spinal_pain_stiffness")
    assert options["A"]["proposed_labels"] == option_a
    assert new_all["EXT-010"]["expected_symptoms"] == option_a
    assert options["B"]["proposed_labels"] == original_labels
    for name in ("A", "B"):
        assert set(options[name]["proposed_labels"]) <= catalog.keys()
    original_11 = next(raw for key, raw, _ in records(ROOT / "evaluation/testset/symptom_extraction_testset.jsonl")[0] if key == "EXT-011")
    assert new_raw_all["EXT-011"] == original_11
    assert sha(new_raw_all["EXT-011"]) == manifest["latest_decision_update"]["EXT_011_raw_sha256"]
    for key, expected_hash in manifest["latest_decision_update"]["preserved_applied_case_raw_sha256"].items():
        assert sha(new_raw_all[key]) == expected_hash
    combined = sha((new_hashes["symptom_extraction_testset_v1.4.jsonl"] + ":" + new_hashes["clinical_cases_labeled_v1.4.jsonl"]).encode("utf-8"))
    assert combined == manifest["combined_sha256"]
    return {"status": "PASS", "files": file_reports, "diff": sorted(diffs, key=lambda x: x["case_id"]),
            "changed_records": len(diffs), "unchanged_record_bytes": unchanged,
            "label_changed_ids": sorted(LABEL_CHANGED), "pending_labels_retained_ids": sorted(PENDING),
            "EXT_010_selected_option": "A", "EXT_011_unchanged_bytes": True,
            "unknown_symptom_codes": [], "unknown_condition_codes": [], "duplicate_ids": [],
            "knowledge_files_unchanged": len(kb), "v1_3_combined_sha256": original_combined,
            "v1_4_combined_sha256": combined, "v1_3_readme_only_one_line_appended": True,
            "pipeline_llm_database_calls": 0}


if __name__ == "__main__":
    result = verify()
    print(json.dumps(result, ensure_ascii=False, indent=2))
