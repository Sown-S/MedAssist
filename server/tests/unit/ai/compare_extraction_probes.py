"""So hai lượt probe cùng bộ phát triển/snapshot; không dùng để duyệt release."""

import argparse
import json
import math
from pathlib import Path


def read_probe(path):
    rows = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
    def one(kind):
        matches = [row for row in rows if row.get("type") == kind]
        if len(matches) != 1:
            raise ValueError("Probe must contain exactly one " + kind)
        return matches[0]
    meta, source, final = one("metadata"), one("source_metadata"), one("complete")
    if final.get("snapshot_unchanged") is not True or source.get("source_hashes_match") is not True:
        raise ValueError("Probe snapshot/source was not verified")
    cases = [row for row in rows if row.get("type") == "case"]
    if not cases or len(cases) != meta.get("cases") or len({row["case"] for row in cases}) != len(cases):
        raise ValueError("Incomplete or duplicate case set")
    for row in cases:
        if not isinstance(row["seconds"], (int, float)) or not math.isfinite(row["seconds"]) or row["seconds"] < 0:
            raise ValueError("Invalid latency")
        if not 0 <= row["correct_count"] <= min(row["expected_count"], row["actual_count"]):
            raise ValueError("Invalid score counts")
    datasets = {name: digest for name, digest in source["source_hashes"].items()
                if name.startswith("tests/unit/ai/data/") and name.endswith(".jsonl")}
    if not datasets:
        raise ValueError("Missing development dataset hashes")
    return meta, datasets, {row["case"]: row for row in cases}


def metrics(cases):
    rows = list(cases.values())
    latencies = sorted(row["seconds"] for row in rows)
    correct = sum(row["correct_count"] for row in rows)
    expected = sum(row["expected_count"] for row in rows)
    actual = sum(row["actual_count"] for row in rows)
    return {"cases": len(rows), "exact": sum(bool(row["exact_match"]) for row in rows),
            "completed": sum(row["completed"] is True for row in rows),
            "recall": correct / expected if expected else None,
            "precision": correct / actual if actual else None,
            "p95_s": latencies[math.ceil(len(rows) * .95) - 1], "max_s": latencies[-1],
            "over_30s": sum(row["seconds"] > 30 for row in rows)}


def compare(baseline_path, candidate_path):
    bm, bd, bc = read_probe(baseline_path)
    cm, cd, cc = read_probe(candidate_path)
    if any(bm.get(key) != cm.get(key) for key in ("model", "snapshot_sha256", "catalogue_count")):
        raise ValueError("Model or knowledge snapshot differs")
    if bd != cd or bc.keys() != cc.keys():
        raise ValueError("Development datasets or case IDs differ")
    if any(bc[key]["expected_count"] != cc[key]["expected_count"] for key in bc):
        raise ValueError("Expected counts differ")
    baseline, candidate = metrics(bc), metrics(cc)
    lost = sorted(key for key in bc if bc[key]["exact_match"] and not cc[key]["exact_match"])
    gained = sorted(key for key in bc if not bc[key]["exact_match"] and cc[key]["exact_match"])
    return {"scope": "development comparison only; not release approval",
            "baseline": baseline, "candidate": candidate, "newly_correct": gained, "regressions": lost,
            "recall_not_worse": (candidate["recall"] >= baseline["recall"]
                                 if baseline["recall"] is not None else None),
            "p95_under_30s": candidate["p95_s"] < 30,
            "all_completed": candidate["completed"] == candidate["cases"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args()
    try:
        result = compare(args.baseline, args.candidate)
    except (ValueError, KeyError, TypeError) as exc:
        raise SystemExit("Incomparable probes: " + type(exc).__name__) from None
    print(json.dumps(result, ensure_ascii=True, allow_nan=False, indent=2))
