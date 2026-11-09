"""Không chấp nhận so khác snapshot/bộ ca hoặc loại ca thất bại khỏi mẫu số."""

import json

import pytest

from tests.unit.ai.compare_extraction_probes import compare


def probe(path, *, snapshot="same", dataset="same", identifier="dev-1", correct=1,
          completed=True, seconds=1, duplicate=False, finished=True):
    case = {"type": "case", "case": identifier, "expected_count": 1, "actual_count": correct,
            "correct_count": correct, "completed": completed, "exact_match": completed and correct == 1,
            "seconds": seconds}
    rows = [
        {"type": "metadata", "model": "local-test", "snapshot_sha256": snapshot, "catalogue_count": 1, "cases": 1},
        {"type": "source_metadata", "source_hashes_match": True,
         "source_hashes": {"tests/unit/ai/data/synthetic.jsonl": dataset}}, case,
    ]
    if duplicate:
        rows.append(case)
    if finished:
        rows.append({"type": "complete", "snapshot_unchanged": True})
    path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
    return path


def test_failed_case_stays_in_recall_and_is_not_exact(tmp_path):
    baseline = probe(tmp_path / "baseline.jsonl")
    candidate = probe(tmp_path / "candidate.jsonl", correct=0, completed=False, seconds=30.01)
    result = compare(baseline, candidate)
    assert result["candidate"]["recall"] == 0 and result["regressions"] == ["dev-1"]
    assert not result["recall_not_worse"] and not result["all_completed"]
    assert not result["p95_under_30s"] and result["candidate"]["over_30s"] == 1


@pytest.mark.parametrize("change", [{"snapshot": "other"}, {"dataset": "other"},
    {"identifier": "other"}, {"duplicate": True}, {"finished": False}, {"seconds": -1}])
def test_incomparable_or_incomplete_probe_is_rejected(tmp_path, change):
    with pytest.raises(ValueError):
        compare(probe(tmp_path / "baseline.jsonl"), probe(tmp_path / "candidate.jsonl", **change))


def test_corrected_case_is_reported_but_not_release_approval(tmp_path):
    result = compare(probe(tmp_path / "baseline.jsonl", correct=0), probe(tmp_path / "candidate.jsonl"))
    assert result["newly_correct"] == ["dev-1"] and result["recall_not_worse"]
    assert "not release approval" in result["scope"]
