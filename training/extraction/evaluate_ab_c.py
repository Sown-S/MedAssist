"""So sánh 3 nhánh A / B / C (model gốc, gốc + few-shot, fine-tune) cho bước chọn trích xuất.

Tính đủ các chỉ số mục 6 & mục 8 của `fine-tune-trich-xuat.md` bản 3:
- P/R/F1 theo cặp (mã, trạng thái) và chỉ mã, tỷ lệ khớp hoàn toàn (`exact`)
- Độ chính xác câu phủ định (`ABSENT`) và tỷ lệ đảo cực
- Tỷ lệ mã bịa (ngoài catalog Active & ngoài Top-4 ứng viên của từng ca)
- Độ phủ truy xuất Top-4 để tách lỗi truy xuất và lỗi bước chọn
- Khoảng tin cậy paired bootstrap 95% CI cho hiệu F1 (C − B, C − A, B − A)
- Kết hợp độ trễ p95 xen kẽ Trích xuất ↔ Node 3 để kết luận tiêu chí dùng thật
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import random
import sys
from time import monotonic
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = REPO_ROOT / "server"
MODULE_DIR = Path(__file__).resolve().parent
for p in (str(SERVER_DIR), str(MODULE_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://medassist_app:test@localhost:5432/medassist_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret-key-at-least-32-characters!!")

from app.ai.extraction.candidate_index import CandidateIndexCache  # noqa: E402
from app.ai.extraction.phrase_retrieval import retrieve_phrases  # noqa: E402
from app.ai.extraction.selection_groups import group_for_selection  # noqa: E402
from generate_dataset import VaultKnowledgeReader  # noqa: E402
from scripts.import_okf import load_vault  # noqa: E402
from scripts.run_eval import _latency, _prf, read_jsonl  # noqa: E402


@dataclass(frozen=True)
class _ListKnowledgeReader:
    symptoms: tuple[dict[str, Any], ...]
    label: str = "custom"

    def active_release(self) -> dict[str, Any]:
        return {"label": self.label, "id": 1}

    def active_symptoms(self) -> list[dict[str, Any]]:
        return list(self.symptoms)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_active_catalogue(knowledge_dir: Path | None = None) -> tuple[list[dict[str, Any]], set[str], str]:
    """Đọc danh mục triệu chứng Active trực tiếp từ `knowledge/` bằng code OKF."""
    vault = load_vault(knowledge_dir or (REPO_ROOT / "knowledge"))
    reader = VaultKnowledgeReader(vault)
    records = reader.active_symptoms()
    codes = {row["symptom_code"] for row in records}
    label = vault.release.label if vault.release else "unknown"
    return records, codes, label


def compute_top4_candidates(
    cases: list[dict[str, Any]],
    symptom_records: list[dict[str, Any]],
    *,
    per_phrase_limit: int = 4,
) -> dict[str, set[str]]:
    """Chạy bước truy xuất tất định hiện hành để lấy tập mã ứng viên Top-4 của từng ca."""
    reader = _ListKnowledgeReader(tuple(symptom_records))
    cache = CandidateIndexCache()
    top4: dict[str, set[str]] = {}
    for case in cases:
        cid = str(case.get("id") or case.get("case_id"))
        plan = retrieve_phrases(
            case["clinical_note"],
            reader,
            cache,
            identifiers=[],
            per_phrase_limit=per_phrase_limit,
            deadline=monotonic() + 60.0,
        )
        plan = group_for_selection(plan)
        top4[cid] = {c.symptom_code for group in plan.groups for c in group.candidates}
    return top4


def _case_counts(rows: list[dict[str, Any]]) -> dict[str, tuple[int, int, int]]:
    out: dict[str, tuple[int, int, int]] = {}
    for r in rows:
        exp = set(r["expected"].items())
        got = set(r["predicted"].items())
        out[str(r["case_id"])] = (len(exp & got), len(got - exp), len(exp - got))
    return out


def _quantile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = q * (len(sorted_vals) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = pos - lo
    return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])


def summarize_branch(
    rows: list[dict[str, Any]],
    active_codes: set[str],
    top4_by_case: dict[str, set[str]],
    *,
    budget_ms: float = 30000.0,
) -> dict[str, Any]:
    """Tính toàn bộ chỉ số trích xuất, phủ định, mã bịa và tách lỗi truy xuất/bước chọn."""
    ordered = sorted(rows, key=lambda r: str(r["case_id"]))
    pair_tp = pair_fp = pair_fn = 0
    code_tp = code_fp = code_fn = 0

    exp_absent = tp_absent = fp_absent = absent_to_present = present_to_absent = 0
    total_predicted = not_in_catalog = not_in_top4 = 0
    total_expected = expected_in_top4 = tp_in_top4 = 0
    fn_ret_miss = fn_sel_omitted = fn_sel_wrong_state = 0

    has_unmapped_field = any("unmapped_phrases" in r for r in ordered)
    cases_with_unmapped = 0
    total_unmapped_phrases = 0

    for r in ordered:
        cid = str(r["case_id"])
        exp: dict[str, str] = r["expected"]
        got: dict[str, str] = r["predicted"]
        cands = top4_by_case.get(cid, set())

        pairs_e, pairs_g = set(exp.items()), set(got.items())
        pair_tp += len(pairs_e & pairs_g)
        pair_fp += len(pairs_g - pairs_e)
        pair_fn += len(pairs_e - pairs_g)

        codes_e, codes_g = set(exp), set(got)
        code_tp += len(codes_e & codes_g)
        code_fp += len(codes_g - codes_e)
        code_fn += len(codes_e - codes_g)

        for code, st in got.items():
            total_predicted += 1
            if code not in active_codes:
                not_in_catalog += 1
            if code not in cands:
                not_in_top4 += 1
            if st == "ABSENT":
                if exp.get(code) == "ABSENT":
                    tp_absent += 1
                else:
                    fp_absent += 1

        for code, est in exp.items():
            total_expected += 1
            in_top4 = code in cands
            if in_top4:
                expected_in_top4 += 1
                if got.get(code) == est:
                    tp_in_top4 += 1
            if got.get(code) != est:
                if not in_top4:
                    fn_ret_miss += 1
                elif code not in got:
                    fn_sel_omitted += 1
                else:
                    fn_sel_wrong_state += 1
            if est == "ABSENT":
                exp_absent += 1
                if got.get(code) == "PRESENT":
                    absent_to_present += 1
            elif est == "PRESENT" and got.get(code) == "ABSENT":
                present_to_absent += 1

        if has_unmapped_field:
            up = r.get("unmapped_phrases") or []
            if up:
                cases_with_unmapped += 1
                total_unmapped_phrases += len(up)

    exact_cases = sum(r["expected"] == r["predicted"] and r.get("completed") is not False for r in ordered)
    completed_cases = sum(r.get("completed") is True for r in ordered)
    failed_cases = {r["case_id"]: r.get("failure_code") for r in ordered if r.get("completed") is False}
    over_budget = [r["case_id"] for r in ordered if float(r.get("latency_ms", 0.0)) > budget_ms]
    empty_cases = [r["case_id"] for r in ordered if r["expected"] and not r["predicted"]]
    fn_total = pair_fn
    fn_sel_total = fn_sel_omitted + fn_sel_wrong_state

    return {
        "cases": len(ordered),
        "code_and_state": _prf(pair_tp, pair_fp, pair_fn),
        "code_only": _prf(code_tp, code_fp, code_fn),
        "exact_cases": exact_cases,
        "exact_rate": exact_cases / len(ordered) if ordered else 0.0,
        "completed_cases": completed_cases,
        "failed_cases": failed_cases,
        "over_30s_cases": over_budget,
        "empty_with_expected_cases": empty_cases,
        "negation_absent": {
            "expected_absent": exp_absent,
            "tp_absent": tp_absent,
            "fp_absent": fp_absent,
            "recall_absent": tp_absent / exp_absent if exp_absent else None,
            "precision_absent": tp_absent / (tp_absent + fp_absent) if (tp_absent + fp_absent) else None,
            "f1_absent": _prf(tp_absent, fp_absent, max(0, exp_absent - tp_absent))["f1"] if exp_absent else None,
            "absent_to_present_flips": absent_to_present,
            "present_to_absent_flips": present_to_absent,
        },
        "hallucination": {
            "total_predicted": total_predicted,
            "not_in_active_catalog": not_in_catalog,
            "not_in_top4_candidates": not_in_top4,
            "hallucinated_rate_catalog": not_in_catalog / total_predicted if total_predicted else 0.0,
            "hallucinated_rate_top4": not_in_top4 / total_predicted if total_predicted else 0.0,
        },
        "retrieval_vs_selection": {
            "total_expected": total_expected,
            "expected_in_top4": expected_in_top4,
            "retrieval_coverage_top4": expected_in_top4 / total_expected if total_expected else 0.0,
            "fn_total": fn_total,
            "fn_retrieval_miss": fn_ret_miss,
            "fn_selection_miss": fn_sel_total,
            "fn_selection_omitted": fn_sel_omitted,
            "fn_selection_wrong_state": fn_sel_wrong_state,
            "selection_recall_given_in_top4": tp_in_top4 / expected_in_top4 if expected_in_top4 else 0.0,
        },
        "latency": _latency([float(r["latency_ms"]) for r in ordered]),
        "unmapped": (
            {
                "available": True,
                "cases_with_unmapped": cases_with_unmapped,
                "total_unmapped_phrases": total_unmapped_phrases,
            }
            if has_unmapped_field
            else {
                "available": False,
                "note": "chưa có trường unmapped_phrases trong results.json của run_eval",
            }
        ),
    }


def paired_bootstrap_f1_diff(
    rows_x: list[dict[str, Any]],
    rows_y: list[dict[str, Any]],
    *,
    n_boot: int = 10000,
    seed: int = 20261123,
) -> dict[str, Any]:
    """Tính hiệu micro-F1 (X − Y) và khoảng tin cậy paired bootstrap 95% ghép cặp theo ca."""
    if n_boot < 1:
        raise ValueError("n_boot phải >= 1")
    cx = _case_counts(rows_x)
    cy = _case_counts(rows_y)
    if not cx or set(cx) != set(cy):
        raise ValueError("Hai nhánh phải có cùng tập case_id không rỗng để ghép cặp bootstrap.")

    case_ids = sorted(cx)
    vx = [cx[cid] for cid in case_ids]
    vy = [cy[cid] for cid in case_ids]
    n = len(case_ids)

    obs_x = _prf(*(sum(col) for col in zip(*vx)))["f1"]
    obs_y = _prf(*(sum(col) for col in zip(*vy)))["f1"]
    obs_delta = obs_x - obs_y

    rng = random.Random(seed)
    diffs: list[float] = []
    for _ in range(n_boot):
        tpx = fpx = fnx = 0
        tpy = fpy = fny = 0
        for _idx in range(n):
            i = rng.randrange(n)
            tx, fx, mx = vx[i]
            ty, fy, my = vy[i]
            tpx += tx
            fpx += fx
            fnx += mx
            tpy += ty
            fpy += fy
            fny += my
        f1x = (2 * tpx / (2 * tpx + fpx + fnx)) if (2 * tpx + fpx + fnx) else 0.0
        f1y = (2 * tpy / (2 * tpy + fpy + fny)) if (2 * tpy + fpy + fny) else 0.0
        diffs.append(f1x - f1y)

    diffs.sort()
    ci_low = _quantile(diffs, 0.025)
    ci_high = _quantile(diffs, 0.975)
    if ci_low > 0:
        interp = "cải thiện có ý nghĩa thống kê (CI > 0)"
    elif ci_high < 0:
        interp = "kém hơn có ý nghĩa thống kê (CI < 0)"
    else:
        interp = f"chưa thấy khác biệt có ý nghĩa thống kê với {n} ca (CI chứa 0)"

    return {
        "f1_x": obs_x,
        "f1_y": obs_y,
        "delta": obs_delta,
        "ci_low": ci_low,
        "ci_high": ci_high,
        "n_cases": n,
        "n_boot": n_boot,
        "seed": seed,
        "interpretation": interp,
    }


def evaluate_deployment_decision(
    summary_a: dict[str, Any],
    summary_b: dict[str, Any],
    summary_c: dict[str, Any],
    interleaved: dict[str, Any] | None = None,
    *,
    interleave_runs: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Đánh giá 3 tiêu chí chốt dùng model fine-tune mục 6 của `fine-tune-trich-xuat.md` bản 3."""
    f1_b = summary_b["code_and_state"]["f1"]
    f1_c = summary_c["code_and_state"]["f1"]
    c_ge_b = f1_c >= f1_b

    hal_a = summary_a["hallucination"]
    hal_c = summary_c["hallucination"]
    hallucination_not_worse = (
        hal_c["not_in_top4_candidates"] <= hal_a["not_in_top4_candidates"]
        and hal_c["not_in_active_catalog"] <= hal_a["not_in_active_catalog"]
    )

    interleaved_detail: dict[str, Any]
    if interleave_runs is not None:
        ext_a = float(interleave_runs["A"]["latency"]["p95_ms"])
        ext_b = float(interleave_runs["B"]["latency"]["p95_ms"])
        ext_c = float(interleave_runs["C"]["latency"]["p95_ms"])
        ext_ratio = (ext_c / ext_a) if ext_a > 0 else None
        interleaved_p95_ok = (ext_c <= 1.20 * ext_a) if ext_a > 0 else False
        interleaved_detail = {
            "source": "run_eval --interleave",
            "extraction_p95_a_ms": ext_a,
            "extraction_p95_b_ms": ext_b,
            "extraction_p95_c_ms": ext_c,
            "extraction_p95_ratio_c_over_a": ext_ratio,
            "extraction_p95_delta_pct": ((ext_ratio - 1.0) * 100.0) if ext_ratio is not None else None,
        }
    elif interleaved is None:
        interleaved_p95_ok: bool | None = None
        interleaved_detail = {"status": "chưa đo độ trễ xen kẽ"}
    else:
        br_a = interleaved["branches"]["A"]
        br_c = interleaved["branches"]["C"]
        ext_a = float(br_a["extraction_latency"]["p95_ms"])
        ext_c = float(br_c["extraction_latency"]["p95_ms"])
        pair_a = float(br_a["pair_total_latency"]["p95_ms"])
        pair_c = float(br_c["pair_total_latency"]["p95_ms"])
        ext_ratio = (ext_c / ext_a) if ext_a > 0 else None
        pair_ratio = (pair_c / pair_a) if pair_a > 0 else None
        interleaved_p95_ok = (ext_c <= 1.20 * ext_a) if ext_a > 0 else False
        interleaved_detail = {
            "source": "measure_interleaved_latency",
            "extraction_p95_a_ms": ext_a,
            "extraction_p95_c_ms": ext_c,
            "extraction_p95_ratio_c_over_a": ext_ratio,
            "extraction_p95_delta_pct": ((ext_ratio - 1.0) * 100.0) if ext_ratio is not None else None,
            "pair_total_p95_a_ms": pair_a,
            "pair_total_p95_c_ms": pair_c,
            "pair_total_p95_ratio_c_over_a": pair_ratio,
            "pair_total_p95_delta_pct": ((pair_ratio - 1.0) * 100.0) if pair_ratio is not None else None,
        }

    if c_ge_b and hallucination_not_worse and interleaved_p95_ok is True:
        recommendation = "DÙNG NHÁNH C"
    elif c_ge_b and hallucination_not_worse and interleaved_p95_ok is None:
        recommendation = "CHỜ ĐO ĐỘ TRỄ XEN KẼ"
    else:
        recommendation = "GIỮ NHÁNH A HOẶC B"

    return {
        "c_ge_b": c_ge_b,
        "f1_c": f1_c,
        "f1_b": f1_b,
        "hallucination_not_worse": hallucination_not_worse,
        "interleaved_p95_ok": interleaved_p95_ok,
        "interleaved_detail": interleaved_detail,
        "recommendation": recommendation,
    }


def _pct(val: float | None, decimals: int = 1) -> str:
    return "—" if val is None else f"{val * 100:.{decimals}f}%"


def _fmt_diff(diff: dict[str, Any]) -> str:
    return (
        f"`{diff['delta'] * 100:+.2f}` điểm % "
        f"(95% CI: `[{diff['ci_low'] * 100:+.2f}, {diff['ci_high'] * 100:+.2f}]`) — {diff['interpretation']}"
    )


def render_markdown_report(report: dict[str, Any]) -> str:
    branches = report["branches"]
    a, b, c = branches["A"], branches["B"], branches["C"]
    diffs = report["bootstrap_95ci"]
    dec = report["decision"]
    inputs = report["inputs"]

    lines = [
        f"# So sánh 3 nhánh A / B / C — {report['dataset_label']}",
        "",
        f"- Kho tri thức kiểm định Top-4: `{report['knowledge_release']}` (`{report['active_symptom_count']}` mã triệu chứng Active)",
        f"- Tập ca trích xuất: `{report['cases_file']['path']}` (`{a['cases']}` ca, `SHA-256 = {report['cases_file']['sha256']}`)",
        f"- Bootstrap: `{diffs['C_minus_B']['n_boot']}` lần, seed `{diffs['C_minus_B']['seed']}`",
        f"- Nhánh A (`_seq`): `{inputs['A']['path']}` (`model={inputs['A']['extraction_model']}`, `SHA-256={inputs['A']['sha256']}`)",
        f"- Nhánh B (`_seq`): `{inputs['B']['path']}` (`model={inputs['B']['extraction_model']}`, `SHA-256={inputs['B']['sha256']}`)",
        f"- Nhánh C (`_seq`): `{inputs['C']['path']}` (`model={inputs['C']['extraction_model']}`, `SHA-256={inputs['C']['sha256']}`)",
    ]
    if inputs.get("interleave_runs"):
        ir_in = inputs["interleave_runs"]
        lines += [
            f"- Nhánh A (`--interleave`): `{ir_in['A']['path']}` (`SHA-256={ir_in['A']['sha256']}`)",
            f"- Nhánh B (`--interleave`, `OLLAMA_NUM_CTX=8192` cho cả Node 3): `{ir_in['B']['path']}` (`SHA-256={ir_in['B']['sha256']}`)",
            f"- Nhánh C (`--interleave`): `{ir_in['C']['path']}` (`SHA-256={ir_in['C']['sha256']}`)",
            "- *Lưu ý nguồn lâm sàng:* `--testset testset_v1.4` chỉ dùng làm ca lâm sàng Node 3 khi bật `--interleave` (nên `meta.testset` ghi `testset-v1.4-frozen`); toàn bộ chỉ số trích xuất chấm trên tập kín nêu trên.",
        ]

    lines += [
        "",
        "## 1. Bảng chỉ số chính 3 nhánh (chạy liên tiếp `_seq`)",
        "",
        "| Chỉ số | Nhánh A (Gốc) | Nhánh B (Gốc + few-shot) | Nhánh C (Fine-tune) |",
        "|---|---:|---:|---:|",
        f"| Mã + trạng thái (P / R / F1) | {_pct(a['code_and_state']['precision'])} / {_pct(a['code_and_state']['recall'])} / **{_pct(a['code_and_state']['f1'])}** | {_pct(b['code_and_state']['precision'])} / {_pct(b['code_and_state']['recall'])} / **{_pct(b['code_and_state']['f1'])}** | {_pct(c['code_and_state']['precision'])} / {_pct(c['code_and_state']['recall'])} / **{_pct(c['code_and_state']['f1'])}** |",
        f"| TP / FP / FN (mã + trạng thái) | {a['code_and_state']['tp']} / {a['code_and_state']['fp']} / {a['code_and_state']['fn']} | {b['code_and_state']['tp']} / {b['code_and_state']['fp']} / {b['code_and_state']['fn']} | {c['code_and_state']['tp']} / {c['code_and_state']['fp']} / {c['code_and_state']['fn']} |",
        f"| Chỉ mã (P / R / F1) | {_pct(a['code_only']['precision'])} / {_pct(a['code_only']['recall'])} / {_pct(a['code_only']['f1'])} | {_pct(b['code_only']['precision'])} / {_pct(b['code_only']['recall'])} / {_pct(b['code_only']['f1'])} | {_pct(c['code_only']['precision'])} / {_pct(c['code_only']['recall'])} / {_pct(c['code_only']['f1'])} |",
        f"| Khớp hoàn toàn (`exact`) | {a['exact_cases']}/{a['cases']} ({_pct(a['exact_rate'])}) | {b['exact_cases']}/{b['cases']} ({_pct(b['exact_rate'])}) | {c['exact_cases']}/{c['cases']} ({_pct(c['exact_rate'])}) |",
        f"| Hoàn tất kỹ thuật | {a['completed_cases']}/{a['cases']} | {b['completed_cases']}/{b['cases']} | {c['completed_cases']}/{c['cases']} |",
        f"| Ca vượt 30 s | {len(a['over_30s_cases'])} | {len(b['over_30s_cases'])} | {len(c['over_30s_cases'])} |",
        f"| Phủ định `ABSENT` (TP / tổng) | {a['negation_absent']['tp_absent']}/{a['negation_absent']['expected_absent']} ({_pct(a['negation_absent']['recall_absent'])}) | {b['negation_absent']['tp_absent']}/{b['negation_absent']['expected_absent']} ({_pct(b['negation_absent']['recall_absent'])}) | {c['negation_absent']['tp_absent']}/{c['negation_absent']['expected_absent']} ({_pct(c['negation_absent']['recall_absent'])}) |",
        f"| Đảo cực `ABSENT↔PRESENT` | {a['negation_absent']['absent_to_present_flips']} / {a['negation_absent']['present_to_absent_flips']} | {b['negation_absent']['absent_to_present_flips']} / {b['negation_absent']['present_to_absent_flips']} | {c['negation_absent']['absent_to_present_flips']} / {c['negation_absent']['present_to_absent_flips']} |",
        f"| Mã bịa (ngoài catalog / ngoài Top-4) | {a['hallucination']['not_in_active_catalog']} / {a['hallucination']['not_in_top4_candidates']} | {b['hallucination']['not_in_active_catalog']} / {b['hallucination']['not_in_top4_candidates']} | {c['hallucination']['not_in_active_catalog']} / {c['hallucination']['not_in_top4_candidates']} |",
        f"| Độ trễ liên tiếp p50 / p95 / max (ms) | {a['latency']['p50_ms']:.0f} / {a['latency']['p95_ms']:.0f} / {a['latency']['max_ms']:.0f} | {b['latency']['p50_ms']:.0f} / {b['latency']['p95_ms']:.0f} / {b['latency']['max_ms']:.0f} | {c['latency']['p50_ms']:.0f} / {c['latency']['p95_ms']:.0f} / {c['latency']['max_ms']:.0f} |",
        "",
        "## 2. Tách lỗi truy xuất (Top-4) và lỗi bước chọn",
        "",
        f"- Độ phủ truy xuất Top-4 trên bộ ca: `{a['retrieval_vs_selection']['expected_in_top4']}/{a['retrieval_vs_selection']['total_expected']}` (**{_pct(a['retrieval_vs_selection']['retrieval_coverage_top4'])}**).",
        "",
        "| Phân rã FN | Nhánh A | Nhánh B | Nhánh C |",
        "|---|---:|---:|---:|",
        f"| Tổng FN (mã + trạng thái) | {a['retrieval_vs_selection']['fn_total']} | {b['retrieval_vs_selection']['fn_total']} | {c['retrieval_vs_selection']['fn_total']} |",
        f"| Lỗi truy xuất (ngoài Top-4) | {a['retrieval_vs_selection']['fn_retrieval_miss']} | {b['retrieval_vs_selection']['fn_retrieval_miss']} | {c['retrieval_vs_selection']['fn_retrieval_miss']} |",
        f"| Lỗi bước chọn (đã có trong Top-4) | {a['retrieval_vs_selection']['fn_selection_miss']} ({a['retrieval_vs_selection']['fn_selection_omitted']} sót + {a['retrieval_vs_selection']['fn_selection_wrong_state']} sai trạng thái) | {b['retrieval_vs_selection']['fn_selection_miss']} ({b['retrieval_vs_selection']['fn_selection_omitted']} sót + {b['retrieval_vs_selection']['fn_selection_wrong_state']} sai trạng thái) | {c['retrieval_vs_selection']['fn_selection_miss']} ({c['retrieval_vs_selection']['fn_selection_omitted']} sót + {c['retrieval_vs_selection']['fn_selection_wrong_state']} sai trạng thái) |",
        f"| Recall bước chọn khi đã lọt Top-4 | {_pct(a['retrieval_vs_selection']['selection_recall_given_in_top4'])} | {_pct(b['retrieval_vs_selection']['selection_recall_given_in_top4'])} | {_pct(c['retrieval_vs_selection']['selection_recall_given_in_top4'])} |",
        "",
        "## 3. Khoảng tin cậy paired bootstrap 95% CI (hiệu F1 mã + trạng thái, `_seq`)",
        "",
        f"- **C − B:** {_fmt_diff(diffs['C_minus_B'])}",
        f"- **C − A:** {_fmt_diff(diffs['C_minus_A'])}",
        f"- **B − A:** {_fmt_diff(diffs['B_minus_A'])}",
        "",
    ]

    if report.get("interleave_runs") is not None:
        ir = report["interleave_runs"]
        ia, ib, ic = ir["A"], ir["B"], ir["C"]
        idiffs = report["interleave_bootstrap_95ci"]
        det = dec["interleaved_detail"]
        lines += [
            "## 4. Chạy xen kẽ Trích xuất ↔ Node 3 (`--interleave`, chuẩn `run_eval`)",
            "",
            "*Nhánh B dùng `OLLAMA_NUM_CTX=8192` cho cả Node 3 khi xen kẽ.*",
            "",
            "| Chỉ số (`--interleave`) | Nhánh A (Gốc) | Nhánh B (Gốc + few-shot, 8192) | Nhánh C (Fine-tune) |",
            "|---|---:|---:|---:|",
            f"| Mã + trạng thái (P / R / F1) | {_pct(ia['code_and_state']['precision'])} / {_pct(ia['code_and_state']['recall'])} / **{_pct(ia['code_and_state']['f1'])}** | {_pct(ib['code_and_state']['precision'])} / {_pct(ib['code_and_state']['recall'])} / **{_pct(ib['code_and_state']['f1'])}** | {_pct(ic['code_and_state']['precision'])} / {_pct(ic['code_and_state']['recall'])} / **{_pct(ic['code_and_state']['f1'])}** |",
            f"| Khớp hoàn toàn (`exact`) | {ia['exact_cases']}/{ia['cases']} ({_pct(ia['exact_rate'])}) | {ib['exact_cases']}/{ib['cases']} ({_pct(ib['exact_rate'])}) | {ic['exact_cases']}/{ic['cases']} ({_pct(ic['exact_rate'])}) |",
            f"| Hoàn tất kỹ thuật / vượt 30 s | {ia['completed_cases']}/{ia['cases']} / {len(ia['over_30s_cases'])} | {ib['completed_cases']}/{ib['cases']} / {len(ib['over_30s_cases'])} | {ic['completed_cases']}/{ic['cases']} / {len(ic['over_30s_cases'])} |",
            f"| Độ trễ xen kẽ p50 / p95 / max (ms) | {ia['latency']['p50_ms']:.0f} / {ia['latency']['p95_ms']:.0f} / {ia['latency']['max_ms']:.0f} | {ib['latency']['p50_ms']:.0f} / {ib['latency']['p95_ms']:.0f} / {ib['latency']['max_ms']:.0f} | {ic['latency']['p50_ms']:.0f} / {ic['latency']['p95_ms']:.0f} / {ic['latency']['max_ms']:.0f} |",
            "",
            f"- **Chênh lệch `p95` xen kẽ (C vs A):** `{det['extraction_p95_delta_pct']:+.1f}%` (`{det['extraction_p95_c_ms']:.0f} ms` vs `{det['extraction_p95_a_ms']:.0f} ms`, ngưỡng mục 6: `≤ +20.0%`).",
            f"- **Bootstrap 95% CI trên `--interleave` (`C − B`):** {_fmt_diff(idiffs['C_minus_B'])}",
            f"- **Bootstrap 95% CI trên `--interleave` (`C − A`):** {_fmt_diff(idiffs['C_minus_A'])}",
            "",
        ]
    elif report.get("interleaved") is not None:
        il = report["interleaved"]
        ia = il["branches"]["A"]
        ic = il["branches"]["C"]
        det = dec["interleaved_detail"]
        lines += [
            f"## 4. Độ trễ xen kẽ Trích xuất ↔ Node 3 (`n={ia['cases']}` cặp thử)",
            "",
            "| Chỉ số xen kẽ | Nhánh A (cùng model gốc) | Nhánh C (nạp lại `ft-v1` ↔ gốc) | Chênh lệch (C vs A) |",
            "|---|---:|---:|---:|",
            f"| Trích xuất p50 / p95 / max (ms) | {ia['extraction_latency']['p50_ms']:.0f} / {ia['extraction_latency']['p95_ms']:.0f} / {ia['extraction_latency']['max_ms']:.0f} | {ic['extraction_latency']['p50_ms']:.0f} / {ic['extraction_latency']['p95_ms']:.0f} / {ic['extraction_latency']['max_ms']:.0f} | {det['extraction_p95_delta_pct']:+.1f}% (p95) |",
            f"| Node 3 p50 / p95 / max (ms) | {ia['reasoning_latency']['p50_ms']:.0f} / {ia['reasoning_latency']['p95_ms']:.0f} / {ia['reasoning_latency']['max_ms']:.0f} | {ic['reasoning_latency']['p50_ms']:.0f} / {ic['reasoning_latency']['p95_ms']:.0f} / {ic['reasoning_latency']['max_ms']:.0f} | — |",
            f"| Tổng cả cặp p50 / p95 / max (ms) | {ia['pair_total_latency']['p50_ms']:.0f} / {ia['pair_total_latency']['p95_ms']:.0f} / {ia['pair_total_latency']['max_ms']:.0f} | {ic['pair_total_latency']['p50_ms']:.0f} / {ic['pair_total_latency']['p95_ms']:.0f} / {ic['pair_total_latency']['max_ms']:.0f} | {det['pair_total_p95_delta_pct']:+.1f}% (p95) |",
            "",
        ]

    sec_num = 5
    if report.get("halves") is not None:
        lines += [
            f"## {sec_num}. Tham khảo theo từng nửa `test-1` / `test-2` (`_seq`, kết luận chính vẫn tính trên 30 ca)",
            "",
            "| Nửa | Nhánh A (F1 / exact) | Nhánh B (F1 / exact) | Nhánh C (F1 / exact) |",
            "|---|---:|---:|---:|",
        ]
        for half_name, hdata in report["halves"].items():
            ha, hb, hc = hdata["A"], hdata["B"], hdata["C"]
            lines.append(
                f"| `{half_name}` ({ha['cases']} ca) | {_pct(ha['code_and_state']['f1'])} / {ha['exact_cases']}/{ha['cases']} | {_pct(hb['code_and_state']['f1'])} / {hb['exact_cases']}/{hb['cases']} | {_pct(hc['code_and_state']['f1'])} / {hc['exact_cases']}/{hc['cases']} |"
            )
        lines.append("")
        sec_num += 1

    lines += [
        f"## {sec_num}. Xét tiêu chí dùng thật (Mục 6 `fine-tune-trich-xuat.md` bản 3)",
        "",
        f"- F1 C ({_pct(dec['f1_c'])}) ≥ F1 B ({_pct(dec['f1_b'])}): **{'Đạt' if dec['c_ge_b'] else 'Chưa đạt'}**",
        f"- Mã bịa C không tăng so với A: **{'Đạt' if dec['hallucination_not_worse'] else 'Chưa đạt'}**",
        f"- Độ trễ xen kẽ p95 C ≤ +20% so với A: **{'Đạt' if dec['interleaved_p95_ok'] is True else ('Chưa đo' if dec['interleaved_p95_ok'] is None else 'Chưa đạt')}**",
        f"- **Kết luận đề xuất:** **`{dec['recommendation']}`**",
    ]
    if not a["unmapped"]["available"]:
        lines.append(f"- *Lưu ý cụm `unmapped`:* {a['unmapped']['note']}.")
    return "\n".join(lines) + "\n"


def _load_branch(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("extraction_cases")
    if not rows:
        raise ValueError(f"{path} không có extraction_cases.")
    meta = data.get("meta") or {}
    info = {
        "path": str(path),
        "sha256": sha256_file(path),
        "extraction_model": meta.get("extraction_model") or meta.get("model"),
        "extraction_prompt": meta.get("extraction_prompt"),
    }
    return meta, rows, info


def build_comparison_report(
    *,
    branch_a: Path,
    branch_b: Path,
    branch_c: Path,
    cases_path: Path,
    interleaved_path: Path | None = None,
    interleave_a: Path | None = None,
    interleave_b: Path | None = None,
    interleave_c: Path | None = None,
    split_halves_path: Path | None = None,
    knowledge_dir: Path | None = None,
    dataset_label: str = "Bộ đánh giá trích xuất",
    n_boot: int = 10000,
    seed: int = 20261123,
) -> dict[str, Any]:
    records, active_codes, kb_release = load_active_catalogue(knowledge_dir)
    cases = read_jsonl(cases_path)
    top4 = compute_top4_candidates(cases, records, per_phrase_limit=4)

    _, rows_a, info_a = _load_branch(branch_a)
    _, rows_b, info_b = _load_branch(branch_b)
    _, rows_c, info_c = _load_branch(branch_c)

    sum_a = summarize_branch(rows_a, active_codes, top4)
    sum_b = summarize_branch(rows_b, active_codes, top4)
    sum_c = summarize_branch(rows_c, active_codes, top4)

    interleave_pair = (interleave_a, interleave_b, interleave_c)
    if any(interleave_pair) and not all(interleave_pair):
        raise ValueError("Phải truyền đủ cả --interleave-a, --interleave-b và --interleave-c.")

    interleave_runs: dict[str, dict[str, Any]] | None = None
    interleave_bootstrap: dict[str, dict[str, Any]] | None = None
    interleave_inputs: dict[str, dict[str, Any]] | None = None
    if all(interleave_pair):
        assert interleave_a and interleave_b and interleave_c
        _, irows_a, iinfo_a = _load_branch(interleave_a)
        _, irows_b, iinfo_b = _load_branch(interleave_b)
        _, irows_c, iinfo_c = _load_branch(interleave_c)
        interleave_runs = {
            "A": summarize_branch(irows_a, active_codes, top4),
            "B": summarize_branch(irows_b, active_codes, top4),
            "C": summarize_branch(irows_c, active_codes, top4),
        }
        interleave_bootstrap = {
            "C_minus_B": paired_bootstrap_f1_diff(irows_c, irows_b, n_boot=n_boot, seed=seed),
            "C_minus_A": paired_bootstrap_f1_diff(irows_c, irows_a, n_boot=n_boot, seed=seed),
            "B_minus_A": paired_bootstrap_f1_diff(irows_b, irows_a, n_boot=n_boot, seed=seed),
        }
        interleave_inputs = {"A": iinfo_a, "B": iinfo_b, "C": iinfo_c}

    halves_summary: dict[str, dict[str, Any]] | None = None
    if split_halves_path is not None:
        splits = json.loads(split_halves_path.read_text(encoding="utf-8"))
        halves_summary = {}
        for half_name, id_list in splits.items():
            id_set = {str(cid) for cid in id_list}
            halves_summary[half_name] = {
                "A": summarize_branch([r for r in rows_a if str(r["case_id"]) in id_set], active_codes, top4),
                "B": summarize_branch([r for r in rows_b if str(r["case_id"]) in id_set], active_codes, top4),
                "C": summarize_branch([r for r in rows_c if str(r["case_id"]) in id_set], active_codes, top4),
            }

    interleaved = json.loads(interleaved_path.read_text(encoding="utf-8")) if interleaved_path else None
    if interleaved is not None and interleaved_path is not None:
        info_il = {"path": str(interleaved_path), "sha256": sha256_file(interleaved_path)}
    else:
        info_il = None

    return {
        "dataset_label": dataset_label,
        "cases_file": {"path": str(cases_path), "sha256": sha256_file(cases_path), "count": len(cases)},
        "knowledge_release": kb_release,
        "active_symptom_count": len(active_codes),
        "inputs": {"A": info_a, "B": info_b, "C": info_c, "interleaved": info_il, "interleave_runs": interleave_inputs},
        "branches": {"A": sum_a, "B": sum_b, "C": sum_c},
        "bootstrap_95ci": {
            "C_minus_B": paired_bootstrap_f1_diff(rows_c, rows_b, n_boot=n_boot, seed=seed),
            "C_minus_A": paired_bootstrap_f1_diff(rows_c, rows_a, n_boot=n_boot, seed=seed),
            "B_minus_A": paired_bootstrap_f1_diff(rows_b, rows_a, n_boot=n_boot, seed=seed),
        },
        "interleaved": interleaved,
        "interleave_runs": interleave_runs,
        "interleave_bootstrap_95ci": interleave_bootstrap,
        "halves": halves_summary,
        "decision": evaluate_deployment_decision(sum_a, sum_b, sum_c, interleaved, interleave_runs=interleave_runs),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Tổng hợp báo cáo 3 nhánh A/B/C và paired bootstrap 95% CI")
    parser.add_argument("--branch-a", type=Path, required=True, help="results.json của nhánh A (model gốc)")
    parser.add_argument("--branch-b", type=Path, required=True, help="results.json của nhánh B (few-shot)")
    parser.add_argument("--branch-c", type=Path, required=True, help="results.json của nhánh C (fine-tune)")
    parser.add_argument("--cases", type=Path, required=True, help="JSONL đầu vào để dựng ứng viên Top-4")
    parser.add_argument("--interleaved", type=Path, help="JSON kết quả đo độ trễ xen kẽ từ measure_interleaved_latency")
    parser.add_argument("--interleave-a", type=Path, help="results.json nhánh A với --interleave")
    parser.add_argument("--interleave-b", type=Path, help="results.json nhánh B với --interleave")
    parser.add_argument("--interleave-c", type=Path, help="results.json nhánh C với --interleave")
    parser.add_argument("--split-halves", type=Path, help="JSON chia nửa test-1 / test-2 (tham khảo)")
    parser.add_argument("--knowledge-dir", type=Path, help="Thư mục kho tri thức OKF (mặc định knowledge/)")
    parser.add_argument("--dataset-label", default="Bộ đánh giá trích xuất", help="Nhãn hiển thị của tập đo")
    parser.add_argument("--out-md", type=Path, help="Đường dẫn lưu báo cáo Markdown")
    parser.add_argument("--out-json", type=Path, help="Đường dẫn lưu báo cáo JSON chi tiết")
    parser.add_argument("--bootstrap-iters", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=20261123)
    args = parser.parse_args(argv)

    report = build_comparison_report(
        branch_a=args.branch_a,
        branch_b=args.branch_b,
        branch_c=args.branch_c,
        cases_path=args.cases,
        interleaved_path=args.interleaved,
        interleave_a=args.interleave_a,
        interleave_b=args.interleave_b,
        interleave_c=args.interleave_c,
        split_halves_path=args.split_halves,
        knowledge_dir=args.knowledge_dir,
        dataset_label=args.dataset_label,
        n_boot=args.bootstrap_iters,
        seed=args.seed,
    )
    md = render_markdown_report(report)
    if args.out_md:
        args.out_md.parent.mkdir(parents=True, exist_ok=True)
        args.out_md.write_text(md, encoding="utf-8")
    if args.out_json:
        args.out_json.parent.mkdir(parents=True, exist_ok=True)
        args.out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
