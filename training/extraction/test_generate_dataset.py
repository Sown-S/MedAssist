"""Unit test nhanh cho pipeline sinh dữ liệu huấn luyện bước chọn."""

from __future__ import annotations

import json
from pathlib import Path
import sys

TRAINING_DIR = Path(__file__).resolve().parent
if str(TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(TRAINING_DIR))

from generate_dataset import generate_splits  # noqa: E402
from verify_dataset import verify_all  # noqa: E402


def test_generate_and_verify_small_splits_deterministic(tmp_path: Path) -> None:
    out1 = tmp_path / "run1"
    man1 = generate_splits(
        train_n=12,
        val_n=4,
        dev_n=4,
        seed=12345,
        target_v2_ratio=0.30,
        per_phrase_limit=4,
        max_prompt_target_chars=11000,
        few_shot_count=2,
        out_dir=out1 / "data",
        manifest_path=out1 / "manifest.json",
        few_shot_path=out1 / "few_shot.json",
        kb_release_expected=None,
    )
    rep1 = verify_all(
        data_dir=out1 / "data",
        manifest_path=out1 / "manifest.json",
        few_shot_path=out1 / "few_shot.json",
    )

    assert rep1["splits"]["train"]["total"] == 12
    assert rep1["splits"]["val"]["total"] == 4
    assert rep1["splits"]["dev"]["total"] == 4
    assert rep1["splits"]["train"]["prompt_exact_match"] == "12/12"
    assert rep1["splits"]["train"]["validate_selection_pass"] == "12/12"
    assert rep1["cross_split_duplicates"] == 0
    assert rep1["heldout_jaccard_hits"] == 0
    assert rep1["few_shot_verified"] == "2/2"

    # Cả hai định dạng prompt đều có trong dữ liệu sinh
    pvs = set(man1["splits"]["train"]["prompt_versions"])
    assert pvs == {"extraction-phrases-v2", "extraction-phrases-compact-v3"}

    # Kiểm tính tất định theo cùng seed
    out2 = tmp_path / "run2"
    man2 = generate_splits(
        train_n=12,
        val_n=4,
        dev_n=4,
        seed=12345,
        target_v2_ratio=0.30,
        per_phrase_limit=4,
        max_prompt_target_chars=11000,
        few_shot_count=2,
        out_dir=out2 / "data",
        manifest_path=out2 / "manifest.json",
        few_shot_path=out2 / "few_shot.json",
        kb_release_expected=None,
    )
    assert man1["splits"]["train"]["sha256"] == man2["splits"]["train"]["sha256"]
    assert man1["splits"]["dev"]["sha256"] == man2["splits"]["dev"]["sha256"]

    # Filler/injection phải điền [], KHÔNG bao giờ bị gắn nhầm vào unmapped khi không có out_of_catalog
    for row_line in (out1 / "data" / "train.jsonl").read_text(encoding="utf-8").splitlines():
        row = json.loads(row_line)
        if row["archetype"] in ("routine_or_negative_only", "prompt_injection_defense"):
            assert row["unmapped_groups"] == []
