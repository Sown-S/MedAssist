"""Tính lại độc lập từ từng ca, không import runner/pipeline; không chạy LLM hoặc CSDL."""
import collections
import csv
import hashlib
import json
import math
from pathlib import Path
import statistics
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def lines(path):
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def prf(tp, fp, fn):
    return dict(tp=tp, fp=fp, fn=fn, precision=tp / (tp + fp) if tp + fp else 0.0,
                recall=tp / (tp + fn) if tp + fn else 0.0,
                f1=2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.0)


def latency(rows):
    values = sorted(r["latency_ms"] for r in rows)
    return dict(mean_ms=sum(values) / len(values), p50_ms=statistics.median(values),
                p95_ms=values[round(.95 * (len(values) - 1))], max_ms=max(values)) if values else {}


def clinical(rows):
    emergency = [r for r in rows if r["expected_priority"] == "Emergency"]
    hits = sum(r["predicted_priority"] == "Emergency" for r in emergency)
    false = sum(r["predicted_priority"] == "Emergency" and r["expected_priority"] != "Emergency" for r in rows)
    confusion = collections.Counter(f'{r["expected_priority"]}->{r["predicted_priority"]}' for r in rows)
    ranks = dict(Emergency=0, HighPriority=1, Routine=2)
    tp = fp = fn = 0
    ddx = [r for r in rows if r["expected_priority"] != "Emergency" and r["expected_top"]]
    per_case = []
    for r in rows:
        e, p = set(r["expected_rules"]), set(r["predicted_rules"])
        tp += len(e & p); fp += len(p - e); fn += len(e - p)
    for r in ddx:
        e, p = set(r["expected_top"]), set(r["predicted_top"][:3])
        per_case.append(prf(len(e & p), len(p - e), len(e - p)))
    return {
        "cases": len(rows),
        "red_flag": dict(cases=len(emergency), enough_cases=len(emergency) >= 30,
                         recall=hits / len(emergency) if emergency else None,
                         meets_target=bool(emergency) and hits / len(emergency) >= .95,
                         missed=[r["case_id"] for r in emergency if r["predicted_priority"] != "Emergency"],
                         false_alarms=false),
        "priority": dict(accuracy=sum(r["expected_priority"] == r["predicted_priority"] for r in rows) / len(rows),
                         under_triage=[r["case_id"] for r in rows if ranks.get(r["predicted_priority"], 9) > ranks.get(r["expected_priority"], 9)],
                         confusion=dict(sorted(confusion.items()))),
        "rules": prf(tp, fp, fn),
        "differential": dict(cases=len(ddx),
                             top1_accuracy=sum(bool(r["predicted_top"]) and r["predicted_top"][0] in r["expected_top"] for r in ddx) / len(ddx),
                             top3_accuracy=sum(bool(set(r["predicted_top"][:3]) & set(r["expected_top"])) for r in ddx) / len(ddx),
                             **{"macro_" + k: sum(x[k] for x in per_case) / len(per_case) for k in ("precision", "recall", "f1")}),
        "latency": latency(rows),
    }


def extraction(rows):
    pair = [0, 0, 0]; code = [0, 0, 0]
    for r in rows:
        e, p = set(r["expected"].items()), set(r["predicted"].items())
        for i, count in enumerate((len(e & p), len(p - e), len(e - p))): pair[i] += count
        e, p = set(r["expected"]), set(r["predicted"])
        for i, count in enumerate((len(e & p), len(p - e), len(e - p))): code[i] += count
    return dict(cases=len(rows), code_and_state=prf(*pair), code_only=prf(*code),
                exact_cases=sum(r["expected"] == r["predicted"] and r.get("completed") is not False for r in rows),
                completed_cases=sum(r.get("completed") is True for r in rows),
                failed_cases={r["case_id"]: r.get("failure_code") for r in rows if r.get("completed") is False},
                unclassified_cases=[r["case_id"] for r in rows if r.get("completed") is None],
                empty_cases=[r["case_id"] for r in rows if r["expected"] and not r["predicted"]],
                over_budget_cases=[r["case_id"] for r in rows if r["latency_ms"] > 30000], latency=latency(rows))


def equal(actual, expected, path=""):
    if isinstance(actual, dict):
        assert set(actual) == set(expected), path
        for k in actual: equal(actual[k], expected[k], path + "/" + k)
    elif isinstance(actual, float):
        assert math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-10), (path, actual, expected)
    else:
        assert actual == expected, (path, actual, expected)


def matches_snapshot(path, expected):
    # Raw hashes lịch sử giữ nguyên; chấp nhận đúng nội dung với LF hoặc CRLF.
    raw = path.read_bytes().replace(b"\r\n", b"\n")
    return expected in {hashlib.sha256(raw).hexdigest(),
                        hashlib.sha256(raw.replace(b"\n", b"\r\n")).hexdigest()}


def main():
    input_clin = {r["case_id"]: r for r in lines(ROOT / "evaluation/testset/clinical_cases_labeled.jsonl")}
    input_ext = {r["id"]: r for r in lines(ROOT / "evaluation/testset/symptom_extraction_testset.jsonl")}
    assert len(input_clin) == 82 and len(input_ext) == 29
    all_data, computed, ledgers, evidence = {}, {}, {}, {}
    for folder, mode, ledger_name in (("rule_only", "RuleOnly", "attempt_rule_only.json"), ("rule_llm", "Full", "attempt_rule_llm.json")):
        base = HERE / folder
        data = read(base / "results.json"); ledger = read(HERE / ledger_name)
        assert ledger["attempts"] == 1 and ledger["status"] == "FINISHED" and ledger["exit_code"] == 0
        assert ledger["database"] == "medassist_kb202611_stage_20261115" and ledger["database_port"] == 15435
        assert data["meta"]["llm_provider"] == "ollama" and data["meta"]["knowledge_release"] == "KB-2026.11"
        assert data["meta"]["model"] == "hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M"
        assert set(data["clinical_cases"]) == {mode}
        c = data["clinical_cases"][mode]; e = data["extraction_cases"]
        assert len(c) == 82 and len(e) == 29
        assert {r["case_id"] for r in c} == set(input_clin) and {r["case_id"] for r in e} == set(input_ext)
        for r in c:
            original = input_clin[r["case_id"]]
            assert r["expected_priority"] == original["expected_priority"]
            assert r["expected_top"] == original.get("expected_top_conditions", [])
            assert r["expected_rules"] == original.get("expected_triggered_rules", [])
        for r in e: assert r["expected"] == input_ext[r["case_id"]]["expected_symptoms"]
        calc = dict(clinical=clinical(c), extraction=extraction(e))
        equal(calc["clinical"], data["clinical"][mode], folder + "/clinical")
        equal(calc["extraction"], data["extraction"], folder + "/extraction")
        with (base / "cases.csv").open(encoding="utf-8-sig", newline="") as stream: csv_rows = list(csv.DictReader(stream))
        assert len(csv_rows) == 82 and {r["case_id"] for r in csv_rows} == set(input_clin)
        for r, csv_r in zip(c, csv_rows):
            assert csv_r["mode"] == mode and csv_r["case_id"] == r["case_id"]
            assert csv_r["predicted_top"] == " ".join(r["predicted_top"][:3])
        assert read(base / "knowledge_hashes_before.json") == read(base / "knowledge_hashes_after.json") == read(HERE / "knowledge_hashes_before.json")
        progress = lines(base / "progress.jsonl")
        starts = {(r["stage"], r["case_id"]): r["time"] for r in progress if r["event"] == "start"}
        ends = {(r["stage"], r["case_id"]): r["time"] for r in progress if r["event"] == "end"}
        assert len(starts) == len(ends) == 111
        calls = lines(base / "llm_calls.jsonl"); mapped = []
        last_id = None
        for event in calls:
            item = dict(event)
            if event["event"] == "ollama_http":
                matches = [key for key in starts if starts[key] <= event["started_at"] <= ends[key]]
                assert len(matches) == 1, event
                last_id = matches[0]
                if event.get("case_id"): assert event["case_id"] == last_id[1]
            assert last_id is not None
            item["mapped_stage"], item["mapped_case_id"] = last_id
            mapped.append(item)
        http = [x for x in mapped if x["event"] == "ollama_http"]
        completed = [x for x in http if x.get("http_completed")]
        assert completed and all(x["model"] == data["meta"]["model"] for x in completed)
        if mode == "RuleOnly": assert not any(x["mapped_stage"] == "clinical" for x in http)
        else: assert any(x["mapped_stage"] == "clinical" for x in http)
        ev = dict(http_calls=len(http), http_completed=len(completed),
                  http_errors=[dict(case_id=x["mapped_case_id"], stage=x["mapped_stage"], error_type=x.get("error_type")) for x in http if not x.get("http_completed")],
                  clinical_http_calls=sum(x["mapped_stage"] == "clinical" for x in http),
                  extraction_http_calls=sum(x["mapped_stage"] == "extraction" for x in http),
                  clinical_status_counts=dict(collections.Counter((r.get("ai_status") or "null") + "/" + str(r.get("mode")) for r in c)),
                  clinical_fallback_cases=[r["case_id"] for r in c if r["expected_priority"] != "Emergency" and r.get("mode") != "Full"] if mode == "Full" else [],
                  clinical_no_candidates_without_llm=[r["case_id"] for r in c if r["expected_priority"] != "Emergency" and not r["predicted_top"] and not any(x["mapped_stage"] == "clinical" and x["mapped_case_id"] == r["case_id"] for x in http)] if mode == "Full" else [],
                  json_validation_errors=[dict(case_id=x["mapped_case_id"], stage=x["mapped_stage"], error_type=x.get("error_type")) for x in mapped if x["event"] == "llm_json_validation" and not x.get("valid_json")],
                  extraction_failures=calc["extraction"]["failed_cases"])
        computed[folder], all_data[folder], ledgers[folder], evidence[folder] = calc, data, ledger, ev

    a = {r["case_id"]: r for r in all_data["rule_only"]["clinical_cases"]["RuleOnly"]}
    b = {r["case_id"]: r for r in all_data["rule_llm"]["clinical_cases"]["Full"]}
    for case_id in evidence["rule_llm"]["clinical_no_candidates_without_llm"]:
        assert not a[case_id]["predicted_top"] and not b[case_id]["predicted_top"]
    changes = [dict(case_id=k, rule_only=a[k]["predicted_top"][:3], rule_llm=b[k]["predicted_top"][:3],
                    full_status=b[k]["ai_status"], full_effective_mode=b[k]["mode"]) for k in a if a[k]["predicted_top"][:3] != b[k]["predicted_top"][:3]]
    with (HERE / "rank_changes.csv").open(encoding="utf-8-sig", newline="") as stream:
        saved_changes = list(csv.DictReader(stream))
    assert saved_changes == [dict(case_id=r["case_id"], rule_only_top3=" ".join(r["rule_only"]),
                                  rule_llm_top3=" ".join(r["rule_llm"]), full_status=r["full_status"],
                                  full_effective_mode=r["full_effective_mode"]) for r in changes]
    current = {p.relative_to(ROOT).as_posix(): p for p in sorted((ROOT / "knowledge").rglob("*")) if p.is_file()}
    snapshot = read(HERE / "knowledge_hashes_before.json")
    assert set(current) == set(snapshot)
    for relative, path in current.items():
        assert matches_snapshot(path, snapshot[relative]), f"KB khác snapshot: {relative}"
    manifest = read(ROOT / "evaluation/testset/manifest_freeze.json"); hs = []
    for f in manifest["files"]:
        value = hashlib.sha256((ROOT / f["path"]).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
        assert value == f["sha256"]; hs.append(value)
    combined = hashlib.sha256(":".join(hs).encode()).hexdigest()
    assert combined == manifest["combined_sha256"] == "4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d"
    protected = ["knowledge/", "server/", "evaluation/testset/clinical_cases_labeled.jsonl",
                 "evaluation/testset/symptom_extraction_testset.jsonl", "evaluation/testset/manifest_freeze.json"]
    assert not subprocess.check_output(["git", "diff", "--name-only", "--", *protected], cwd=ROOT).strip()
    assert not subprocess.check_output(["git", "diff", "--cached", "--name-only", "--", *protected], cwd=ROOT).strip()
    audit = dict(all_metrics_match_results=True, cases_per_mode=dict(clinical=82, extraction=29),
                 attempts_per_mode=dict(RuleOnly=1, Full=1), recomputed_metrics=computed, llm_evidence=evidence,
                 rank_change_cases=len(changes), knowledge_files=len(current), knowledge_unchanged=True,
                 combined_sha256=combined, comparison_scope="One run per mode; Full may include explicit fallback", review_status="PENDING", review_scope="Clinical review pending; technical checks do not establish clinical approval", technical_review_responsible="Tuấn", technical_review_basis="Recorded technical report review; see final_checks.json")
    print(json.dumps(dict(status="PASS", audit=audit, cases_per_mode=audit["cases_per_mode"],
                          rank_changes=changes, evidence=evidence,
                          knowledge_clinical_content_unchanged=True,
                          repository_files_written=0), ensure_ascii=False, indent=2))


def render(computed, data, ledgers, evidence, changes, combined):
    def pct(value): return f"{value * 100:.2f}%"
    def ratio(value, n): return f"{round(value*n)}/{n} ({pct(value)})"
    labels = ("rule_only", "rule_llm")
    rows = []
    def row(title, values): rows.append("| " + title + " | " + " | ".join(map(str, values)) + " |")
    row("Số ca lâm sàng / trích xuất", [f'{computed[k]["clinical"]["cases"]} / {computed[k]["extraction"]["cases"]}' for k in labels])
    row("Recall cờ đỏ", [ratio(computed[k]["clinical"]["red_flag"]["recall"], computed[k]["clinical"]["red_flag"]["cases"]) for k in labels])
    row("Báo nhầm Emergency (số ca)", [computed[k]["clinical"]["red_flag"]["false_alarms"] for k in labels])
    row("Mức ưu tiên đúng", [ratio(computed[k]["clinical"]["priority"]["accuracy"],82) for k in labels])
    for metric in ("top1", "top3"):
        row("DDx " + metric, [ratio(computed[k]["clinical"]["differential"][metric+"_accuracy"],computed[k]["clinical"]["differential"]["cases"]) for k in labels])
    for metric in ("precision", "recall", "f1"):
        row("Luật " + metric, [pct(computed[k]["clinical"]["rules"][metric]) for k in labels])
        row("Trích xuất mã + trạng thái " + metric, [pct(computed[k]["extraction"]["code_and_state"][metric]) for k in labels])
        row("Trích xuất chỉ mã " + metric, [pct(computed[k]["extraction"]["code_only"][metric]) for k in labels])
    row("Trích xuất khớp toàn ca", [f'{computed[k]["extraction"]["exact_cases"]}/29' for k in labels])
    row("Trích xuất completed=true", [f'{computed[k]["extraction"]["completed_cases"]}/29' for k in labels])
    row("Trích xuất lỗi / chưa phân loại", [f'{len(computed[k]["extraction"]["failed_cases"])} / {len(computed[k]["extraction"]["unclassified_cases"])}' for k in labels])
    row("Trích xuất quá 30.000 ms (số ca)", [len(computed[k]["extraction"]["over_budget_cases"]) for k in labels])
    for phase in ("clinical", "extraction"):
        for metric in ("mean_ms", "p50_ms", "p95_ms", "max_ms"):
            row(("Lâm sàng" if phase=="clinical" else "Trích xuất") + " " + metric, [f'{computed[k][phase]["latency"][metric]:.2f}' for k in labels])
    row("Tổng wall time runner (ms)", [f'{ledgers[k]["wall_ms"]:.1f}' for k in labels])
    row("Số HTTP gọi model: lâm sàng / trích xuất", [f'{evidence[k]["clinical_http_calls"]} / {evidence[k]["extraction_http_calls"]}' for k in labels])
    row("HTTP model hoàn tất / tổng", [f'{evidence[k]["http_completed"]}/{evidence[k]["http_calls"]}' for k in labels])
    row("Phân bố ai_status / mode lâm sàng", ["; ".join(f"{x}: {n}" for x,n in evidence[k]["clinical_status_counts"].items()) for k in labels])
    changed_table = ["| Ca | RuleOnly top-3 | Full được yêu cầu: top-3 | Trạng thái thực tế |", "|---|---|---|---|"]
    changed_table += [f'| {r["case_id"]} | {", ".join(r["rule_only"]) or "rỗng"} | {", ".join(r["rule_llm"]) or "rỗng"} | {r["full_status"]}/{r["full_effective_mode"]} |' for r in changes]
    failure_lines = []
    for k in labels:
        failure_lines.append(f'- {k}: ca lâm sàng ngoài Emergency không có mode Full (chỉ áp dụng lượt yêu cầu Full) = {evidence[k]["clinical_fallback_cases"]}; lỗi trích xuất = {evidence[k]["extraction_failures"]}; lỗi HTTP = {evidence[k]["http_errors"]}; lỗi JSON LLM = {evidence[k]["json_validation_errors"]}.')
    failure_lines.append(f'- Lượt Full có các ca top-3 rỗng ở cả hai lượt và không gọi LLM: {evidence["rule_llm"]["clinical_no_candidates_without_llm"]}. Kết quả phù hợp nhánh không có ứng viên: graph.py:104 bỏ qua reasoning, node4_output_validation.py:84 trả NO_CANDIDATES và Degraded/RuleOnly. Đây là đối chiếu kết quả/log với mã nguồn, không phải chạy lại pipeline; không coi các ca này là lỗi kết nối/model hoặc Full thành công.')
    meta=data["rule_llm"]["meta"]
    return "\n".join([
        "# So sánh RuleOnly và Full — KB-2026.11", "",
        "Báo cáo kỹ thuật mô tả một lượt mỗi chế độ. Rà chuyên môn lâm sàng: PENDING; kết quả không thay thế thẩm định lâm sàng.", "",
        f'Mỗi chế độ chạy đúng một lần trên staging riêng medassist_kb202611_stage_20261115 (127.0.0.1:15435), server {meta["server_version"]}, commit {ledgers["rule_llm"]["git_commit"]}. Không dùng/sao CSDL medassist.', "",
        "Sau khi đánh giá hoàn tất, ngày 15/11/2026 Tuấn quyết định dừng staging trước và giữ nguyên dữ liệu. Container medassist-kb202611-eval-20261115 đã dừng; lần kiểm sau dừng ghi nhận exited/running=false, không xóa container hoặc volume. Bằng chứng: final_checks.json mục staging_lifecycle. Trạng thái này không thay đổi snapshot KB Active đã dùng khi chạy benchmark.", "",
        f'Provider ollama; model {meta["model"]}; prompt suy luận {meta["reasoning_prompt"]}; trích xuất {meta.get("extraction_strategy")}, prompt {meta.get("extraction_prompt")}. Endpoint thật http://100.127.111.5:11434 qua relay TCP loopback tạm; không sửa adapter/prompt/ngân sách thời gian. Lượt RuleOnly chỉ dùng luật cho lâm sàng/DDx, vẫn dùng model thật cho 29 ca trích xuất.', "",
        f'Thời điểm bắt đầu: RuleOnly {ledgers["rule_only"]["started_at"]}; Full {ledgers["rule_llm"]["started_at"]}. Múi giờ +07:00.', "",
        "## Chỉ số", "", "| Chỉ số | RuleOnly + trích xuất thật | Full + trích xuất thật |", "|---|---|---|", *rows, "",
        "DDx chỉ tính trên ca không Emergency có nhãn DDx; không lấy 82 ca làm mẫu số DDx. Top-1: ứng viên đầu có trong tập nhãn; top-3: có ít nhất một nhãn trúng trong ba ứng viên. Không suy ra chất lượng toàn bộ 153 bệnh. P95 là phần tử tại chỉ số round(0,95 × (n−1)) sau sắp xếp; thời gian gồm gọi qua Tailscale và có thể gồm tải model/hàng đợi phía Ollama.", "",
        "Mean/p50/p95 lâm sàng lấy trên toàn bộ 82 ca, gồm cả Skipped và Degraded không gọi LLM. Vì vậy p50 của lượt Full không đại diện thời gian suy luận một ca đi qua Gemma; thời gian/token từng lần gọi thật nằm trong llm_calls.jsonl. Wall time còn bao gồm vòng lặp runner, đọc snapshot và phần trích xuất.", "",
        "## LLM thật, fallback và lỗi", "", *failure_lines, "",
        "Metadata HTTP ghi model thực trả về, token, thời gian và lỗi, không ghi prompt hoặc nội dung sinh. Ca cờ đỏ có thể Skipped đúng thiết kế, không phải thất bại Full. Mọi fallback ngoài Emergency được liệt kê ở trên; không gọi chúng là Full thành công. Xem llm_calls.jsonl và progress.jsonl từng thư mục. Một số event trích xuất gốc không có case_id do trùng tên hàm run_extraction trong stack; script độc lập ghép duy nhất trong bộ nhớ theo khoảng thời gian start/end trong progress, giữ nguyên log gốc.", "",
        "## Ca đổi danh sách hoặc thứ tự top-3", "", f"Có {len(changes)} ca khác top-3 giữa hai lượt; bảng gồm cả đổi thành viên và đổi thứ tự, không mặc định mọi khác biệt là cải thiện.", "", *changed_table, "",
        "## Kiểm chứng và giới hạn", "",
        f'Tính lại độc lập bằng verify_compare.py từ từng ca results.json, đối chiếu nhãn đầu vào, 82 dòng CSV mỗi lượt, 29 ca trích xuất mỗi lượt, toàn bộ chỉ số JSON và ledger một lần gọi. Các giá trị bảng được sinh trực tiếp từ phép tính đã khớp JSON; làm tròn chỉ để hiển thị. Audit: independent_verification.json; rank_changes.csv. KB 179 file có hash trước/sau giống nhau ở cả hai lượt. Hash v1.3 chuẩn hóa CRLF→LF khớp manifest: {combined}. Manifest không cập nhật.', "",
        "Mỗi chế độ chỉ một lượt, bộ test nhỏ và chỉ một tập con có nhãn DDx; không kiểm định ý nghĩa thống kê, độ ổn định hay khả năng khái quát. Hai lượt chạy tuần tự nên cache model, tải GPU, lưu lượng Tailscale, hàng đợi Ollama và timeout có thể khác nhau; không quy toàn bộ chênh lệch thời gian hoặc trích xuất cho mode lâm sàng. Không điều chỉnh KB, luật, prompt hoặc testset theo kết quả. Chưa có quyết định/thẩm định y khoa mới. Báo cáo tiền kiểm cũ đã được bỏ khi lọc file; đầu ra đánh giá và bằng chứng chính vẫn giữ nguyên.", "",
    ])


if __name__ == "__main__":
    main()
