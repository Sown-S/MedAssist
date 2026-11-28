"""Kiểm định độc lập toàn bộ dữ liệu sinh trong training/extraction/.

Kiểm tra trực tiếp từ các tệp trên đĩa:
1. Khớp số dòng, SHA-256 và metadata với dataset_manifest.json.
2. Tái lập chính xác 100% prompt user bằng code server (retrieve_phrases ->
   group_for_selection -> selection_request / compact_selection.selection_request).
3. Kiểm tra 100% assistant JSON qua decode_selection + validate_selection.
4. Xác nhận 0 trùng lặp lời kể giữa train/val/dev.
5. Xác nhận 0 rò rỉ (nguyên văn và Jaccard >= 0.75) với evaluation/ và focus dev.
6. Xác nhận few_shot_dev_examples.json chỉ lấy từ dev.jsonl.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from time import monotonic

REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = REPO_ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://medassist:medassist@localhost:5432/medassist_test")

from app.ai.extraction import compact_selection, phrase_selector  # noqa: E402
from app.ai.extraction.candidate_index import CandidateIndexCache  # noqa: E402
from app.ai.extraction.phrase_retrieval import retrieve_phrases  # noqa: E402
from app.ai.extraction.selection_groups import group_for_selection  # noqa: E402
from app.ai.llm.prompts import PHRASE_EXTRACTION_PROMPT_VERSION  # noqa: E402
from scripts.import_okf import load_vault  # noqa: E402

from generate_dataset import VaultKnowledgeReader, norm_key, strip_vi_accents  # noqa: E402

MODULE_DIR = Path(__file__).resolve().parent
_TOKENS = re.compile(r"\w+", re.UNICODE)


def _token_set(text: str) -> set[str]:
    return set(_TOKENS.findall(strip_vi_accents(text).lower()))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def verify_all(
    *,
    data_dir: Path,
    manifest_path: Path,
    few_shot_path: Path,
    jaccard_threshold: float = 0.75,
) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    vault = load_vault(REPO_ROOT / "knowledge")
    if vault.errors:
        raise AssertionError(f"Kho OKF lỗi: {vault.errors}")
    reader = VaultKnowledgeReader(vault)
    cache = CandidateIndexCache()
    index = cache.get(reader)
    assert index.catalogue_sha256 == manifest["catalogue_sha256"], (
        f"Lệch catalogue_sha256: index={index.catalogue_sha256} vs manifest={manifest['catalogue_sha256']}"
    )

    # Nạp bộ đánh giá để kiểm chống rò rỉ (chỉ đọc text và đếm đối chiếu, không đưa vào dữ liệu sinh)
    eval_sources = [
        (REPO_ROOT / "evaluation" / "testset" / "symptom_extraction_testset.jsonl", "clinical_note"),
        (REPO_ROOT / "evaluation" / "testset_v1.4" / "symptom_extraction_testset.jsonl", "clinical_note"),
        (REPO_ROOT / "server" / "tests" / "unit" / "ai" / "data" / "focus_patient_voice_dev_v1.jsonl", "clinical_note"),
    ]
    heldout_norms: set[str] = set()
    heldout_tokens: list[tuple[str, set[str]]] = []
    for path, field in eval_sources:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            txt = obj[field]
            heldout_norms.add(norm_key(txt))
            heldout_tokens.append((f"{path.name}:{obj.get('id', '?')}", _token_set(txt)))

    seen_norms: dict[str, str] = {}
    summary: dict[str, dict] = {}
    dev_by_id: dict[str, dict] = {}
    overlap_hits: list[tuple[str, str, float]] = []

    for split_name in ("train", "val", "dev"):
        sp_meta = manifest["splits"][split_name]
        sp_path = data_dir / f"{split_name}.jsonl"
        raw_bytes = sp_path.read_bytes()
        sha = hashlib.sha256(raw_bytes).hexdigest()
        assert sha == sp_meta["sha256"], f"{split_name} SHA-256 mismatch: {sha} != {sp_meta['sha256']}"

        rows = [json.loads(l) for l in raw_bytes.decode("utf-8").splitlines() if l.strip()]
        assert len(rows) == sp_meta["count"], f"{split_name} count {len(rows)} != {sp_meta['count']}"

        prompt_ok = 0
        valid_ok = 0
        exact_sym_ok = 0
        pv_counts = Counter()

        for row in rows:
            cid = row["id"]
            nar = row["narrative"]
            nkey = norm_key(nar)
            assert nkey not in seen_norms, f"Trùng narrative giữa {seen_norms[nkey]} và {cid}"
            seen_norms[nkey] = cid

            assert nkey not in heldout_norms, f"Rò rỉ nguyên văn {cid} với tập đánh giá"
            tok = _token_set(nar)
            for ref_name, ref_tok in heldout_tokens:
                jac = _jaccard(tok, ref_tok)
                if jac >= jaccard_threshold:
                    overlap_hits.append((cid, ref_name, round(jac, 3)))

            plan = retrieve_phrases(
                nar,
                reader,
                cache,
                identifiers=(),
                per_phrase_limit=manifest["per_phrase_limit"],
                deadline=monotonic() + 30.0,
            )
            plan = group_for_selection(plan)
            use_compact = len(plan.groups) >= 4
            if use_compact:
                expected_pv = compact_selection.PROMPT_VERSION
                expected_prompt, _ = compact_selection.selection_request(plan)
            else:
                expected_pv = PHRASE_EXTRACTION_PROMPT_VERSION
                expected_prompt, _ = phrase_selector.selection_request(plan)

            assert row["prompt_version"] == expected_pv, f"{cid}: sai prompt_version"
            pv_counts[expected_pv] += 1

            if row["messages"][0]["content"] == expected_prompt:
                prompt_ok += 1
            else:
                raise AssertionError(f"{cid}: prompt không khớp byte với server code")

            raw_target = json.loads(row["messages"][1]["content"])
            decoded = compact_selection.decode_selection(raw_target, plan) if use_compact else raw_target
            res = phrase_selector.validate_selection(decoded, plan)
            assert res.completed, f"{cid}: validate_selection thất bại ({res.failure_code})"
            valid_ok += 1

            pred_map = {s["symptom_code"]: s["status"] for s in res.suggestions}
            assert pred_map == row["expected_symptoms"], f"{cid}: lệch expected_symptoms"
            exact_sym_ok += 1

            if split_name == "dev":
                dev_by_id[cid] = row

        assert not overlap_hits, f"Phát hiện rò rỉ Jaccard >= {jaccard_threshold}: {overlap_hits[:5]}"
        summary[split_name] = {
            "total": len(rows),
            "sha256": sha,
            "prompt_exact_match": f"{prompt_ok}/{len(rows)}",
            "validate_selection_pass": f"{valid_ok}/{len(rows)}",
            "expected_map_match": f"{exact_sym_ok}/{len(rows)}",
            "prompt_versions": dict(pv_counts),
        }

    # Kiểm few_shot_dev_examples.json
    fs_bytes = few_shot_path.read_bytes()
    fs_sha = hashlib.sha256(fs_bytes).hexdigest()
    assert fs_sha == manifest["few_shot_sha256"], "few_shot SHA-256 mismatch"
    fs_obj = json.loads(fs_bytes.decode("utf-8"))
    fs_matched = 0
    for ex in fs_obj["examples"]:
        assert ex["id"] in dev_by_id, f"Few-shot {ex['id']} không thuộc dev.jsonl"
        dev_row = dev_by_id[ex["id"]]
        assert ex["user_prompt"] == dev_row["messages"][0]["content"]
        assert ex["assistant_json"] == dev_row["messages"][1]["content"]
        fs_matched += 1

    return {
        "kb_release": manifest["kb_release"],
        "catalogue_sha256": manifest["catalogue_sha256"],
        "splits": summary,
        "cross_split_duplicates": 0,
        "heldout_jaccard_hits": len(overlap_hits),
        "few_shot_verified": f"{fs_matched}/{len(fs_obj['examples'])}",
        "few_shot_sha256": fs_sha,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Kiểm định dữ liệu huấn luyện bước chọn trích xuất")
    p.add_argument("--data-dir", type=Path, default=MODULE_DIR / "data")
    p.add_argument("--manifest", type=Path, default=MODULE_DIR / "dataset_manifest.json")
    p.add_argument("--few-shot", type=Path, default=MODULE_DIR / "few_shot_dev_examples.json")
    args = p.parse_args(argv)

    report = verify_all(
        data_dir=args.data_dir.resolve(),
        manifest_path=args.manifest.resolve(),
        few_shot_path=args.few_shot.resolve(),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
