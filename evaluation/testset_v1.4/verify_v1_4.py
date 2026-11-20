"""Kiểm nội dung v1.4 chuẩn hóa CRLF→LF và nhãn; chỉ đọc, không chạy pipeline/LLM/CSDL."""
import argparse
import csv
from collections import Counter
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
import tempfile

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TARGETS = {"CLIN-019", "EXT-010", "EXT-014", "EXT-024", "EXT-026"}
PENDING = {"CLIN-019"}
LABEL_CHANGED = TARGETS - PENDING
REVIEW_ADDENDUM = "\n## Bổ sung biên bản".encode("utf-8")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def text_bytes(path):
    return path.read_bytes().replace(b"\r\n", b"\n")


def verify_text_file(path, manifest):
    relative = path.relative_to(ROOT).as_posix()
    assert sha(text_bytes(path)) == manifest["text_file_sha256"][relative], f"Nội dung khác: {relative}"


def verify_full_review(manifest):
    """Kiểm đủ phạm vi; giới hạn biên bản cần quyết định riêng của Tuấn."""
    review = manifest["cross_review"].get("full_review", {})
    submission = manifest["cross_review"].get("full_review_submission", {})
    if not review:
        authorization = manifest.get("freeze_authorization", {})
        assert submission.get("status") in {"NEEDS_CLARIFICATION", "CLARIFIED"}, "Chưa có biên bản Huy rà đủ 111 ca"
        assert authorization.get("decided_by") == "Tuấn", "Cần quyết định của Tuấn về giới hạn biên bản"
        assert authorization.get("decision") == "FREEZE_WITH_RECORDED_REVIEW_LIMITATIONS"
        assert authorization.get("combined_sha256") == manifest["combined_sha256"]
        assert authorization.get("clinical_approval_inferred") is False
        assert set(authorization.get("accepted_review_limitations", [])) == {
            "CLIN_021_SUMMARY_COUNT", "HUY_CURRENT_VERIFIER_NOT_RUN"}
        assert {"review_summary_CLIN_021", "reviewer_verifier_confirmation"} <= manifest["known_limitations"].keys()
        assert submission.get("reviewer_ran_current_verifier") is False
        assert submission.get("full_testset_confirmation_reported") is True
        source = ROOT / authorization["record_path"]
        assert source.resolve().is_relative_to(ROOT.resolve()) and source.is_file()
        original_record, marker, _ = text_bytes(source).partition(REVIEW_ADDENDUM)
        assert sha(original_record) == authorization["record_sha256"]
        if submission["status"] == "CLARIFIED":
            clarification = submission["clarification"]
            assert marker and clarification["case_id"] == "CLIN-021"
            assert clarification["reported_reviewer"] == submission["reviewer"]
            assert clarification["verdict"] == "ĐỒNG Ý"
            assert clarification["previous_enumerated_clinical_agree_count"] + 1 == (
                submission["enumerated_clinical_agree_count"]
            ) == submission["reported_clinical_agree_count"]
            assert submission["missing_clinical_verdict_ids"] == []
        else:
            assert not marker and submission.get("missing_clinical_verdict_ids") == ["CLIN-021"]
        assert date.fromisoformat(authorization["decided_at"]).isoformat() == authorization["decided_at"]
        review = submission
    else:
        assert review.get("status") == "COMPLETED" and review.get("full_testset_confirmation") is True
    assert review.get("reviewer") == "Huy", "Chưa có biên bản Huy rà đủ 111 ca"
    assert review.get("combined_sha256") == manifest["combined_sha256"], "Biên bản không khớp bộ ca hiện tại"
    expected = {key for entry in manifest["files"] for key, _, _ in records(ROOT / entry["path"])[0]}
    reviewed = review.get("reviewed_case_ids", [])
    assert len(reviewed) == len(set(reviewed)) == 111 and set(reviewed) == expected
    assert date.fromisoformat(review["reviewed_at"]).isoformat() == review["reviewed_at"]
    source = ROOT / review["record_path"]
    assert source.resolve().is_relative_to(ROOT.resolve()), "Biên bản phải nằm trong repo"
    assert source.is_file() and text_bytes(source).strip(), "Thiếu biên bản rà soát"
    assert sha(text_bytes(source)) == review["record_sha256"], "Biên bản rà soát đã thay đổi"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def front(path):
    return yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1])


def records(path):
    chunks = text_bytes(path).splitlines(keepends=True)
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


def verify_reference_files(manifest, root=ROOT):
    assert manifest["reference_file_hash_normalization"] == "CRLF to LF before hashing"
    expected = manifest["reference_file_sha256"]
    assert set(expected) == set(manifest["reference_file_raw_sha256"])
    for reference, expected_hash in expected.items():
        value = sha((root / reference).read_bytes().replace(b"\r\n", b"\n"))
        assert value == expected_hash, f"Nội dung tham chiếu khác: {reference}"


def self_test_reference_files():
    manifest = load(HERE / "manifest_freeze.json")
    with tempfile.TemporaryDirectory(prefix="medassist-reference-eol-") as directory:
        root = Path(directory)
        for ending in (b"\n", b"\r\n"):
            for reference in manifest["reference_file_sha256"]:
                data = (ROOT / reference).read_bytes().replace(b"\r\n", b"\n")
                target = root / reference
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data.replace(b"\n", ending))
            verify_reference_files(manifest, root)
        reference = next(iter(manifest["reference_file_sha256"]))
        target = root / reference
        target.write_bytes(target.read_bytes() + b"\nCONTENT_CHANGED_FOR_NEGATIVE_TEST\n")
        try:
            verify_reference_files(manifest, root)
        except AssertionError:
            return {"status": "PASS", "reference_files": len(manifest["reference_file_sha256"]),
                    "LF": "PASS", "CRLF": "PASS", "content_change_rejected": True,
                    "source_files_modified": False}
        raise AssertionError("Không phát hiện nội dung prompt đã thay đổi")


def self_test_portability():
    global ROOT, HERE
    original_root, original_here = ROOT, HERE
    manifest = load(HERE / "manifest_freeze.json")
    paths = set(manifest["text_file_sha256"]) | {manifest["source_readme_append"]["path"]}
    paths = {p for p in paths if not p.startswith("knowledge/")}
    paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / "knowledge").rglob("*") if p.is_file())
    try:
        with tempfile.TemporaryDirectory(prefix="medassist-v14-eol-") as directory:
            ROOT = Path(directory)
            HERE = ROOT / original_here.relative_to(original_root)
            for ending in (b"\n", b"\r\n"):
                for relative in paths:
                    target = ROOT / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(text_bytes(original_root / relative).replace(b"\n", ending))
                result = verify(manifest)
                assert result["unchanged_record_bytes"] == 106
            changed = ROOT / manifest["cross_review"]["feedback"]["source_path"]
            changed.write_bytes(changed.read_bytes() + b"\nCONTENT_CHANGED_FOR_NEGATIVE_TEST\n")
            try:
                verify(manifest)
            except AssertionError:
                return {"status": "PASS", "LF": "PASS", "CRLF": "PASS",
                        "content_change_rejected": True, "source_files_modified": False}
            raise AssertionError("Không phát hiện thay nội dung báo cáo")
    finally:
        ROOT, HERE = original_root, original_here


def verify(manifest_override=None):
    manifest = load(HERE / "manifest_freeze.json") if manifest_override is None else manifest_override
    assert {p.name for p in HERE.glob("*.jsonl")} == {"clinical_cases_labeled.jsonl", "symptom_extraction_testset.jsonl"}
    assert manifest["combined_order"] == ["symptom_extraction_testset.jsonl", "clinical_cases_labeled.jsonl"]
    assert manifest["cross_review"]["status"] == "PENDING_CROSS_REVIEW"
    assert manifest["cross_review"]["reviewer_expected"] == "Huy"
    assert manifest["cross_review"]["reviewed_at"] is None
    assert manifest["review_status"] == "PENDING_CROSS_REVIEW"
    assert manifest["is_separate_testset"] is True and type(manifest["is_frozen"]) is bool
    if manifest["is_frozen"]:
        verify_full_review(manifest)
        assert manifest["freeze_version"] == "testset-v1.4-frozen"
        frozen_at = datetime.fromisoformat(manifest["frozen_at"])
        assert frozen_at.utcoffset() is not None and frozen_at.utcoffset().total_seconds() == 7 * 3600
        decision = manifest["freeze_decision"]
        assert decision["decided_by"] == "Tuấn"
        assert decision["accepted_known_limitations"] == sorted(manifest["known_limitations"])
        assert decision["clinical_approval_inferred"] is False
        assert decision["data_combined_sha256"] == manifest["combined_sha256"]
        assert decision["jsonl_raw_sha256"] == {e["path"]: e["raw_sha256"] for e in manifest["files"]}
        assert decision["review_authorization"] == manifest.get("freeze_authorization")
    else:
        assert manifest["freeze_version"] == "testset-v1.4-draft"
        assert "freeze_decision" not in manifest and "frozen_at" not in manifest
    assert manifest["benchmark_status"] == "NOT_RUN"
    feedback = manifest["cross_review"].get("feedback")
    if feedback:
        assert feedback["reported_reviewer"] == "Huy"
        assert feedback["forwarded_by"] == "Tuấn"
        assert feedback["status"] == "FEEDBACK_RECEIVED_FOR_FIVE_CASES"
        assert set(feedback["confirmed_case_ids"]) == TARGETS
        assert date.fromisoformat(feedback["reported_review_date"]).isoformat() == feedback["reported_review_date"]
        assert feedback["full_testset_confirmation"] is False
        assert feedback["freeze_authorized"] is False
        assert feedback["current_artifact_hashes_confirmed_by_reviewer"] is False
        assert feedback["current_matching_data_combined_sha256"] == manifest["combined_sha256"]
        verify_text_file(ROOT / feedback["source_path"], manifest)
        if feedback.get("source_text_sha256"):
            source_text = (ROOT / feedback["source_path"]).read_text(encoding="utf-8")
            response_text = source_text.split("<!-- BEGIN HUY_FEEDBACK_2026_11_16 -->", 1)[1].split(
                "<!-- END HUY_FEEDBACK_2026_11_16 -->", 1
            )[0].strip()
            assert sha(response_text.encode("utf-8")) == feedback["source_text_sha256"]
        latest_update = feedback.get("latest_update")
        if latest_update:
            assert latest_update["reported_reviewer"] == "Huy"
            assert latest_update["reported_verify_compare_result"] == "PASS"
            assert latest_update["verify_v1_4_after_fix_result_reported"] is None
            assert set(latest_update["content_confirmation_scope"]) == TARGETS
            assert latest_update["full_testset_confirmation"] is False
            verify_text_file(ROOT / latest_update["source_path"], manifest)
        followup = feedback.get("followup")
        if followup:
            verify_text_file(ROOT / followup["source_path"], manifest)
            assert set(followup["content_confirmation_scope"]) == TARGETS
            assert followup["reviewer_ran_verify_v1_4"] is False
            assert followup["full_testset_confirmation"] is False
            scope = manifest["scope_decision"]
            assert scope["decided_by"] == "Tuấn" and scope["decision"] == "KEEP_FIVE_IDS"
            assert set(scope["changed_case_ids"]) == TARGETS
            assert set(scope["retained_known_label_limitations"]) == {"EXT-022", "EXT-023"}
            assert scope["clinical_approval_inferred"] is False and scope["freeze_authorized"] is False
        for entry in manifest["case_changes"]:
            assert entry["followup_feedback"]["reported_reviewer"] == "Huy"
            assert entry["followup_feedback"]["verdict"] == "ĐỒNG Ý"
            assert entry["followup_feedback"]["reported_review_date"] == feedback["reported_review_date"]
            assert entry["followup_feedback"]["source_path"] == feedback["source_path"]
    technical_review = manifest.get("technical_cross_review")
    if technical_review:
        report = ROOT / technical_review["report_path"]
        verify_text_file(report, manifest)
        assert technical_review["integrity_status"] == "PASS"
        assert technical_review["reviewed_combined_sha256"] == manifest["combined_sha256"]
        assert technical_review["reviewed_file_raw_sha256"] == {
            entry["path"]: entry["raw_sha256"] for entry in manifest["files"]
        }
        assert technical_review["clinical_review_status"] == "PENDING"
        assert technical_review["human_cross_review_status"] == "PENDING_CROSS_REVIEW"
        assert technical_review["freeze_ready"] is False
    parent = manifest["parent_testset"]
    original_manifest_path = ROOT / parent["manifest_path"]
    assert manifest["text_file_hash_normalization"] == "CRLF to LF before hashing"
    verify_text_file(original_manifest_path, manifest)
    original_manifest = load(original_manifest_path)
    assert manifest["combined_sha256_formula"] == original_manifest["combined_sha256_formula"]
    assert manifest["sha256_normalization"] == original_manifest["sha256_normalization"]
    original_hashes = []
    for expected in parent["files"]:
        raw = (ROOT / expected["path"]).read_bytes()
        verify_text_file(ROOT / expected["path"], manifest)
        value = sha(raw.replace(b"\r\n", b"\n"))
        assert value == expected["sha256"]
        assert value == next(x["sha256"] for x in original_manifest["files"] if x["path"] == expected["path"])
        original_hashes.append(value)
    original_combined = sha(":".join(original_hashes).encode("utf-8"))
    assert original_combined == parent["combined_sha256"] == original_manifest["combined_sha256"]
    assert original_combined == "4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d"

    append = manifest["source_readme_append"]
    readme = text_bytes(ROOT / append["path"])
    suffix = bytes.fromhex(append["appended_bytes_hex"]).replace(b"\r\n", b"\n")
    assert readme.endswith(suffix) and len(suffix.splitlines()) == 1
    assert sha(readme[:-len(suffix)]) == append["original_sha256"]

    reviews = {}
    for source in manifest["sources"]:
        path = ROOT / source["path"]
        verify_text_file(path, manifest)
        if path.suffix == ".csv":
            with path.open(encoding="utf-8-sig", newline="") as stream:
                rows = list(csv.DictReader(stream))
            assert len(rows) == source["rows"] and len(rows) == len({r["case_id"] for r in rows})
            reviews.update({r["case_id"]: r for r in rows})
    assert {key for key, row in reviews.items() if row["verdict"] == "CẦN SỬA"} == TARGETS
    verify_reference_files(manifest)

    catalog = {row["symptom_code"]: row["symptom_name"] for row in front(ROOT / "knowledge/symptoms/symptom_catalog.md")["symptoms"]}
    condition_data = [front(p) for p in (ROOT / "knowledge/conditions").rglob("*.md")]
    conditions = {x["condition_code"] for x in condition_data}
    rules = {front(p)["rule_key"] for p in (ROOT / "knowledge/rules").rglob("*.md")}
    release = front(ROOT / "knowledge/_release.md")["label"]
    snapshot = manifest["knowledge_snapshot"]
    snapshot_matches_release = release == snapshot["kb_release"]
    unchanged_kb_files = None
    if snapshot_matches_release:
        assert len(catalog) == snapshot["total_symptoms"] and len(conditions) == snapshot["total_conditions"]
        assert len(rules) == snapshot["total_triage_rules"]
        assert len(list((ROOT / "knowledge/sources").glob("*.md"))) == snapshot["total_sources"]
        assert snapshot["groups"] == dict(Counter(x["disease_group"] for x in condition_data))
        kb_paths = {p.relative_to(ROOT).as_posix() for p in (ROOT / "knowledge").rglob("*") if p.is_file()}
        assert kb_paths == set(manifest["knowledge_file_sha256_before"])
        for relative in kb_paths:
            verify_text_file(ROOT / relative, manifest)
        unchanged_kb_files = len(kb_paths)

    source_names = {"clinical_cases_labeled.jsonl": ("clinical_cases_labeled.jsonl", 82),
                    "symptom_extraction_testset.jsonl": ("symptom_extraction_testset.jsonl", 29)}
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
        verify_text_file(path, manifest)
        new_hashes[path.name] = sha(path.read_bytes().replace(b"\r\n", b"\n"))
        assert new_hashes[path.name] == entry["sha256"]
        file_changed, file_unchanged = [], 0
        for (case_id, old_raw, old), (_, new_raw, new) in zip(old_records, new_records):
            assert case_id not in old_all and case_id not in new_all
            old_all[case_id], new_all[case_id] = old, new
            new_raw_all[case_id] = new_raw
            codes = new.get("symptoms", new.get("expected_symptoms", {}))
            assert not (missing := set(codes) - catalog.keys()), f"{case_id}: mã triệu chứng thiếu {sorted(missing)}"
            assert not (missing := set(new.get("expected_top_conditions", [])) - conditions), (
                f"{case_id}: mã bệnh thiếu {sorted(missing)}"
            )
            assert not (missing := set(new.get("expected_triggered_rules", [])) - rules), (
                f"{case_id}: mã luật thiếu {sorted(missing)}"
            )
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
    if manifest.get("scope_decision"):
        for key in ("EXT-022", "EXT-023"):
            assert new_all[key]["expected_symptoms"]["fever_high"] == "ABSENT"
            assert "sốt" not in new_all[key]["clinical_note"].casefold()
            assert new_all[key] == old_all[key]
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
    for key, expected_hash in manifest["latest_decision_update"]["preserved_applied_case_sha256"].items():
        assert sha(new_raw_all[key]) == expected_hash
    combined = sha((new_hashes["symptom_extraction_testset.jsonl"] + ":" + new_hashes["clinical_cases_labeled.jsonl"]).encode("utf-8"))
    assert combined == manifest["combined_sha256"]
    return {"status": "PASS", "is_frozen": manifest["is_frozen"], "freeze_version": manifest["freeze_version"],
            "files": file_reports, "diff": sorted(diffs, key=lambda x: x["case_id"]),
            "changed_records": len(diffs), "unchanged_record_bytes": unchanged,
            "label_changed_ids": sorted(LABEL_CHANGED), "pending_labels_retained_ids": sorted(PENDING),
            "EXT_010_selected_option": "A", "EXT_011_unchanged_bytes": True,
            "unknown_symptom_codes": [], "unknown_condition_codes": [], "unknown_rule_keys": [], "duplicate_ids": [],
            "knowledge_release": release, "knowledge_snapshot_release": snapshot["kb_release"],
            "knowledge_files_unchanged": unchanged_kb_files, "v1_3_combined_sha256": original_combined,
            "v1_4_combined_sha256": combined, "v1_3_readme_only_one_line_appended": True,
            "pipeline_llm_database_calls": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test-reference-hashes", action="store_true", help="Kiểm LF/CRLF và phát hiện đổi nội dung bằng bản sao tạm")
    parser.add_argument("--self-test-portability", action="store_true", help="Kiểm toàn bộ verifier trên bản sao LF/CRLF và từ chối thay nội dung")
    args = parser.parse_args()
    result = self_test_portability() if args.self_test_portability else self_test_reference_files() if args.self_test_reference_hashes else verify()
    print(json.dumps(result, ensure_ascii=False, indent=2))
