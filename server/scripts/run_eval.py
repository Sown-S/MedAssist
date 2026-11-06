"""Chạy bộ test đóng băng (evaluation/testset) qua pipeline AI, không qua HTTP, và tính chỉ số cho báo cáo.
Cần CSDL đã nạp tri thức Active; chế độ Full và trích xuất dùng LLM theo LLM_PROVIDER (server/README.md mục 6).
Kết quả: summary.md, results.json, cases.csv trong thư mục --out.
"""

import argparse
import asyncio
import csv
import datetime
import json
import sys
import time
from collections import Counter
from pathlib import Path
from statistics import mean, median

from app.ai.extraction import feature_extractor
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.core.config import settings
from app.core.database import SessionLocal
from app.services.assessment_service import evaluate_case_offline
from app.services.knowledge_reader import DbKnowledgeReader
from app.worker.runner import make_llm_client

SERVER_DIR = Path(__file__).resolve().parents[1]
DEFAULT_TESTSET = SERVER_DIR.parent / "evaluation" / "testset"
PRIORITIES = ("Emergency", "HighPriority", "Routine")
MIN_RED_FLAG_CASES = 30  # Proposal §6.1
RED_FLAG_RECALL_TARGET = 0.95
TOP_K = 3


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def input_features(case: dict) -> dict:
    age = case.get("age_years")
    return {
        "symptoms": dict(case.get("symptoms", {})),
        "vital_signs": dict(case.get("vital_signs", {})),
        "age_years": age,
        "age_months": case.get("age_months", age * 12 if isinstance(age, int) else None),
    }


def _prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return {"precision": p, "recall": r, "f1": 2 * p * r / (p + r) if p + r else 0.0, "tp": tp, "fp": fp, "fn": fn}


def _latency(values: list[float]) -> dict:
    if not values:
        return {}
    ordered = sorted(values)
    p95 = ordered[min(len(ordered) - 1, round(0.95 * (len(ordered) - 1)))]
    return {"mean_ms": mean(values), "p50_ms": median(values), "p95_ms": p95, "max_ms": ordered[-1]}


def clinical_metrics(rows: list[dict]) -> dict:
    """``rows``: mỗi ca có expected_*, predicted_priority, predicted_rules, predicted_top, latency_ms."""
    rf_expected = [r for r in rows if r["expected_priority"] == "Emergency"]
    rf_tp = sum(r["predicted_priority"] == "Emergency" for r in rf_expected)
    rf_fp = sum(r["predicted_priority"] == "Emergency" for r in rows if r["expected_priority"] != "Emergency")
    rank = {p: i for i, p in enumerate(PRIORITIES)}
    confusion = Counter((r["expected_priority"], r["predicted_priority"]) for r in rows)

    rule_tp = rule_fp = rule_fn = 0
    for r in rows:
        exp, got = set(r["expected_rules"]), set(r["predicted_rules"])
        rule_tp, rule_fp, rule_fn = rule_tp + len(exp & got), rule_fp + len(got - exp), rule_fn + len(exp - got)

    ddx = [r for r in rows if r["expected_priority"] != "Emergency" and r["expected_top"]]
    per_case = []
    for r in ddx:
        exp, top = set(r["expected_top"]), r["predicted_top"][:TOP_K]
        hit = len(exp & set(top))
        per_case.append(_prf(hit, len(top) - hit, len(exp) - hit))
    return {
        "cases": len(rows),
        "red_flag": {
            "cases": len(rf_expected),
            "enough_cases": len(rf_expected) >= MIN_RED_FLAG_CASES,
            "recall": rf_tp / len(rf_expected) if rf_expected else None,
            "meets_target": bool(rf_expected) and rf_tp / len(rf_expected) >= RED_FLAG_RECALL_TARGET,
            "missed": [r["case_id"] for r in rf_expected if r["predicted_priority"] != "Emergency"],
            "false_alarms": rf_fp,
        },
        "priority": {
            "accuracy": sum(r["expected_priority"] == r["predicted_priority"] for r in rows) / len(rows)
            if rows
            else None,
            "under_triage": [
                r["case_id"] for r in rows if rank.get(r["predicted_priority"], 9) > rank.get(r["expected_priority"], 9)
            ],
            "confusion": {f"{e}->{p}": n for (e, p), n in sorted(confusion.items())},
        },
        "rules": _prf(rule_tp, rule_fp, rule_fn),
        "differential": {
            "cases": len(ddx),
            "top1_accuracy": (
                sum(bool(r["predicted_top"][:1]) and r["predicted_top"][0] in r["expected_top"] for r in ddx) / len(ddx)
                if ddx
                else None
            ),
            f"top{TOP_K}_accuracy": (
                sum(bool(set(r["expected_top"]) & set(r["predicted_top"][:TOP_K])) for r in ddx) / len(ddx)
                if ddx
                else None
            ),
            "macro_precision": mean(c["precision"] for c in per_case) if per_case else None,
            "macro_recall": mean(c["recall"] for c in per_case) if per_case else None,
            "macro_f1": mean(c["f1"] for c in per_case) if per_case else None,
        },
        "latency": _latency([r["latency_ms"] for r in rows]),
    }


def extraction_metrics(rows: list[dict]) -> dict:
    """So khớp cặp (mã, trạng thái) và riêng mã; ``rows`` có expected, predicted (dict mã -> trạng thái)."""
    pair_tp = pair_fp = pair_fn = code_tp = code_fp = code_fn = 0
    for r in rows:
        exp, got = r["expected"], r["predicted"]
        pairs_e, pairs_g = set(exp.items()), set(got.items())
        pair_tp, pair_fp, pair_fn = (
            pair_tp + len(pairs_e & pairs_g),
            pair_fp + len(pairs_g - pairs_e),
            pair_fn + len(pairs_e - pairs_g),
        )
        codes_e, codes_g = set(exp), set(got)
        code_tp, code_fp, code_fn = (
            code_tp + len(codes_e & codes_g),
            code_fp + len(codes_g - codes_e),
            code_fn + len(codes_e - codes_g),
        )
    return {
        "cases": len(rows),
        "code_and_state": _prf(pair_tp, pair_fp, pair_fn),
        "code_only": _prf(code_tp, code_fp, code_fn),
        "exact_cases": sum(r["expected"] == r["predicted"] for r in rows),
        "latency": _latency([r["latency_ms"] for r in rows]),
    }


def unknown_codes(cases: list[dict], key: str, active: set[str]) -> dict[str, list[str]]:
    out = {}
    for c in cases:
        missing = sorted(set(c.get(key, {})) - active)
        if missing:
            out[c.get("case_id") or c.get("id")] = missing
    return out


def run_clinical(cases: list[dict], reader: DbKnowledgeReader, mode: str, llm_client) -> list[dict]:
    rows = []
    for case in cases:
        reader.refresh()
        started = time.monotonic()
        result = evaluate_case_offline(
            {"input_features": input_features(case)}, reader, mode=mode, llm_client=llm_client
        )
        rows.append(
            {
                "case_id": case["case_id"],
                "disease_group": case.get("disease_group"),
                "expected_priority": case["expected_priority"],
                "predicted_priority": result.get("priority_final") or result.get("priority_rule"),
                "expected_rules": case.get("expected_triggered_rules", []),
                "predicted_rules": sorted(
                    {h.get("rule_key") for h in result.get("rule_hits") or [] if h.get("rule_key")}
                ),
                "expected_top": case.get("expected_top_conditions", []),
                "predicted_top": [c.get("condition_code") for c in result.get("candidates") or []],
                "ai_status": result.get("ai_status"),
                "mode": result.get("mode"),
                "latency_ms": round((time.monotonic() - started) * 1000, 1),
            }
        )
    return rows


def run_extraction(cases: list[dict], reader: DbKnowledgeReader, llm_client) -> list[dict]:
    rows = []
    for case in cases:
        reader.refresh()
        gate = run_node1({"input_features": input_features({"age_years": case.get("age_years")})}, reader)
        started = time.monotonic()
        with SessionLocal() as db:
            suggestions = asyncio.run(
                feature_extractor.extract_symptoms(
                    case["clinical_note"],
                    reader,
                    llm_client,
                    db,
                    gate_state=gate,
                    identifiers=[],
                    timeout_seconds=feature_extractor.EXTRACTION_TIMEOUT_SECONDS,
                )
            )
        rows.append(
            {
                "case_id": case["id"],
                "disease_group": case.get("disease_group"),
                "expected": dict(case["expected_symptoms"]),
                "predicted": {s["symptom_code"]: s["status"] for s in suggestions},
                "latency_ms": round((time.monotonic() - started) * 1000, 1),
            }
        )
    return rows


def _pct(v) -> str:
    return "—" if v is None else f"{v * 100:.1f}%"


def render_summary(meta: dict, clinical: dict, extraction: dict | None, warnings: list[str]) -> str:
    lines = [f"# Kết quả đánh giá {meta['run_at']}", ""]
    lines += [f"- {k}: `{v}`" for k, v in meta.items() if k != "run_at"]
    if warnings:
        lines += ["", "## Cảnh báo", ""] + [f"- {w}" for w in warnings]
    for mode, m in clinical.items():
        rf, pr, dx, lat = m["red_flag"], m["priority"], m["differential"], m["latency"]
        lines += [
            "",
            f"## Ca lâm sàng: {mode} ({m['cases']} ca)",
            "",
            "| Chỉ số | Giá trị |",
            "|---|---|",
            f"| Red-flag recall ({rf['cases']} ca cờ đỏ) | {_pct(rf['recall'])} "
            f"(mục tiêu ≥ {RED_FLAG_RECALL_TARGET:.0%}: {'đạt' if rf['meets_target'] else 'chưa đạt'}) |",
            f"| Ca cờ đỏ bị bỏ sót | {', '.join(rf['missed']) or 'không'} |",
            f"| Báo cờ đỏ nhầm | {rf['false_alarms']} |",
            f"| Mức ưu tiên đúng | {_pct(pr['accuracy'])} |",
            f"| Xếp thấp hơn nhãn (under-triage) | {', '.join(pr['under_triage']) or 'không'} |",
            f"| Luật khớp: P / R / F1 | {_pct(m['rules']['precision'])} / {_pct(m['rules']['recall'])} / "
            f"{_pct(m['rules']['f1'])} |",
            f"| Chẩn đoán phân biệt ({dx['cases']} ca): top-1 / top-{TOP_K} | {_pct(dx['top1_accuracy'])} / "
            f"{_pct(dx[f'top{TOP_K}_accuracy'])} |",
            f"| Chẩn đoán phân biệt: P / R / F1 (macro, top-{TOP_K}) | {_pct(dx['macro_precision'])} / "
            f"{_pct(dx['macro_recall'])} / {_pct(dx['macro_f1'])} |",
            f"| Độ trễ mean / p50 / p95 (ms) | {lat.get('mean_ms', 0):.0f} / {lat.get('p50_ms', 0):.0f} / "
            f"{lat.get('p95_ms', 0):.0f} |",
            "",
            "Ma trận mức ưu tiên (nhãn -> dự đoán): " + ", ".join(f"{k}: {v}" for k, v in pr["confusion"].items()),
        ]
    if extraction:
        cs, co, lat = extraction["code_and_state"], extraction["code_only"], extraction["latency"]
        lines += [
            "",
            f"## Trích xuất triệu chứng ({extraction['cases']} ca)",
            "",
            "| Chỉ số | Giá trị |",
            "|---|---|",
            f"| Mã + trạng thái: P / R / F1 | {_pct(cs['precision'])} / {_pct(cs['recall'])} / {_pct(cs['f1'])} |",
            f"| Chỉ mã: P / R / F1 | {_pct(co['precision'])} / {_pct(co['recall'])} / {_pct(co['f1'])} |",
            f"| Ca khớp hoàn toàn | {extraction['exact_cases']}/{extraction['cases']} |",
            f"| Độ trễ mean / p95 (ms) | {lat.get('mean_ms', 0):.0f} / {lat.get('p95_ms', 0):.0f} |",
        ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Đánh giá pipeline AI trên bộ test đóng băng")
    p.add_argument("--testset", type=Path, default=DEFAULT_TESTSET)
    p.add_argument("--mode", choices=["RuleOnly", "Full", "both"], default="both")
    p.add_argument("--skip-extraction", action="store_true", help="Bỏ qua bộ test trích xuất (cần LLM)")
    p.add_argument("--limit", type=int, help="Chỉ chạy N ca đầu mỗi bộ (thử nhanh)")
    p.add_argument("--out", type=Path, help="Thư mục kết quả (mặc định evaluation/results/<thời điểm>)")
    args = p.parse_args(argv)

    clinical_cases = read_jsonl(args.testset / "clinical_cases_labeled.jsonl")[: args.limit]
    extraction_cases = read_jsonl(args.testset / "symptom_extraction_testset.jsonl")[: args.limit]
    manifest_path = args.testset / "manifest_freeze.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}

    reader = DbKnowledgeReader()
    snapshot = reader.refresh()
    active_symptoms = {s["symptom_code"] for s in snapshot.symptoms}
    if not active_symptoms:
        print("CSDL chưa có tri thức Active: chạy scripts.import_okf trước.", file=sys.stderr)
        return 1
    llm_client, model_name = make_llm_client()
    modes = ["RuleOnly", "Full"] if args.mode == "both" else [args.mode]
    with_llm = settings.LLM_PROVIDER != "none"
    if "Full" in modes and not with_llm:
        print("LLM_PROVIDER=none: bỏ chế độ Full và phần trích xuất.", file=sys.stderr)
        modes = [m for m in modes if m != "Full"]

    warnings = []
    rf_cases = sum(c["expected_priority"] == "Emergency" for c in clinical_cases)
    if rf_cases < MIN_RED_FLAG_CASES:
        warnings.append(f"Bộ test có {rf_cases} ca cờ đỏ, ít hơn {MIN_RED_FLAG_CASES} ca Proposal cam kết.")
    for name, missing in (
        ("ca lâm sàng", unknown_codes(clinical_cases, "symptoms", active_symptoms)),
        ("ca trích xuất", unknown_codes(extraction_cases, "expected_symptoms", active_symptoms)),
    ):
        for case_id, codes in missing.items():
            warnings.append(f"{name} {case_id}: mã không có trong tri thức Active: {', '.join(codes)}")
    for w in warnings:
        print("CẢNH BÁO:", w, file=sys.stderr)

    clinical_rows = {m: run_clinical(clinical_cases, reader, m, llm_client) for m in modes}
    extraction_rows = (
        run_extraction(extraction_cases, reader, llm_client) if with_llm and not args.skip_extraction else None
    )

    run_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    meta = {
        "run_at": run_at,
        "testset": manifest.get("freeze_version", str(args.testset)),
        "testset_sha256": manifest.get("combined_sha256", ""),
        "knowledge_release": (snapshot.release or {}).get("label"),
        "llm_provider": settings.LLM_PROVIDER,
        "model": model_name,
        "server_version": settings.VERSION,
    }
    clinical = {m: clinical_metrics(rows) for m, rows in clinical_rows.items()}
    extraction = extraction_metrics(extraction_rows) if extraction_rows is not None else None

    out = args.out or SERVER_DIR.parent / "evaluation" / "results" / datetime.datetime.now().strftime("%Y%m%d_%H%M")
    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.md").write_text(render_summary(meta, clinical, extraction, warnings), encoding="utf-8")
    (out / "results.json").write_text(
        json.dumps(
            {
                "meta": meta,
                "warnings": warnings,
                "clinical": clinical,
                "extraction": extraction,
                "clinical_cases": clinical_rows,
                "extraction_cases": extraction_rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    with (out / "cases.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["mode", "case_id", "expected_priority", "predicted_priority", "expected_top", "predicted_top"])
        for m, rows in clinical_rows.items():
            for r in rows:
                w.writerow(
                    [
                        m,
                        r["case_id"],
                        r["expected_priority"],
                        r["predicted_priority"],
                        " ".join(r["expected_top"]),
                        " ".join(r["predicted_top"][:TOP_K]),
                    ]
                )
    print(f"Đã ghi kết quả: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
