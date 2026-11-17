"""Chuẩn bị/áp dụng đóng băng nội dung v1.4. Mặc định dry-run; không gọi DB/LLM/Git."""
import argparse
import copy
from datetime import datetime, timedelta, timezone
import json

from verify_v1_4 import HERE, load, verify


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--dry-run", action="store_true", help="Xem đề xuất; không ghi tệp (mặc định)")
    action.add_argument("--apply", action="store_true", help="Ghi quyết định đóng băng vào manifest")
    parser.add_argument("--decision-by", choices=["Tuấn"], help="Người quyết định đóng băng")
    parser.add_argument("--accept-known-limitations", action="store_true", help="Ghi nhận các giới hạn hiện có")
    args = parser.parse_args()
    if args.apply and (args.decision_by != "Tuấn" or not args.accept_known_limitations):
        parser.error("--apply cần --decision-by Tuấn và --accept-known-limitations")

    path = HERE / "manifest_freeze.json"
    original_bytes = path.read_bytes()
    manifest = load(path)
    verify()
    if manifest["is_frozen"]:
        parser.error("Bộ đã đóng băng; không ghi lại quyết định hoặc thay nội dung")
    assert manifest["cross_review"]["feedback"]["followup"]["reported_reviewer"] == "Huy"
    assert manifest["scope_decision"]["decision"] == "KEEP_FIVE_IDS"

    proposed = copy.deepcopy(manifest)
    proposed["is_frozen"] = True
    proposed["freeze_version"] = "testset-v1.4-frozen"
    proposed["frozen_at"] = datetime.now(timezone(timedelta(hours=7))).isoformat()
    proposed["freeze_decision"] = {
        "decided_by": "Tuấn",
        "accepted_known_limitations": sorted(manifest["known_limitations"]),
        "clinical_approval_inferred": False,
        "data_combined_sha256": manifest["combined_sha256"],
        "jsonl_raw_sha256": {e["path"]: e["raw_sha256"] for e in manifest["files"]},
        "scope": "Đóng băng nội dung với giới hạn đã ghi; không thay xác minh lâm sàng hoặc mở rộng xác nhận của Huy",
    }
    # Kiểm trạng thái đề xuất trong bộ nhớ trước mọi thao tác ghi.
    verify(proposed)
    if args.apply:
        if path.read_bytes() != original_bytes:
            raise RuntimeError("Manifest đã thay đổi sau tiền kiểm; dừng để tránh ghi đè")
        try:
            path.write_text(json.dumps(proposed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            verify()
        except BaseException:
            path.write_bytes(original_bytes)
            raise
    print(json.dumps({
        "status": "APPLIED" if args.apply else "DRY_RUN",
        "manifest_written": args.apply,
        "proposed_changes": {key: proposed[key] for key in ("freeze_version", "is_frozen", "frozen_at", "freeze_decision")},
        "review_status_retained": proposed["review_status"],
        "known_limitations": manifest["known_limitations"],
        "jsonl_changed": False,
        "pipeline_llm_database_calls": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
