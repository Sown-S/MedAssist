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


def write(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


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
    with (HERE / "rank_changes.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream); writer.writerow(["case_id", "rule_only_top3", "rule_llm_top3", "full_status", "full_effective_mode"])
        for r in changes: writer.writerow([r["case_id"], " ".join(r["rule_only"]), " ".join(r["rule_llm"]), r["full_status"], r["full_effective_mode"]])
    current = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT / "knowledge").rglob("*")) if p.is_file()}
    assert current == read(HERE / "knowledge_hashes_before.json")
    manifest = read(ROOT / "evaluation/testset/manifest_freeze.json"); hs = []
    for f in manifest["files"]:
        value = hashlib.sha256((ROOT / f["path"]).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
        assert value == f["sha256"]; hs.append(value)
    combined = hashlib.sha256(":".join(hs).encode()).hexdigest()
    assert combined == manifest["combined_sha256"] == "4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d"
    assert not subprocess.check_output(["git", "diff", "--name-only"], cwd=ROOT).strip()
    assert not subprocess.check_output(["git", "diff", "--cached", "--name-only"], cwd=ROOT).strip()
    audit = dict(all_metrics_match_results=True, cases_per_mode=dict(clinical=82, extraction=29),
                 attempts_per_mode=dict(RuleOnly=1, Full=1), recomputed_metrics=computed, llm_evidence=evidence,
                 rank_change_cases=len(changes), knowledge_files=len(current), knowledge_unchanged=True,
                 combined_sha256=combined, comparison_scope="One run per mode; Full may include explicit fallback", review_status="PENDING", review_scope="Clinical review only; Tuan explicitly confirmed direct technical report review and confirmation in conversation", technical_review_responsible="Tuấn", technical_review_basis="Explicit user confirmation of direct technical report review")
    write("independent_verification.json", audit)
    (HERE / "so_sanh.md").write_text(render(computed, all_data, ledgers, evidence, changes, combined), encoding="utf-8")
    (HERE / "tu_danh_gia.md").write_text(render_self_review(audit), encoding="utf-8")
    print(json.dumps(dict(status="PASS", cases_per_mode=audit["cases_per_mode"], rank_changes=len(changes), evidence=evidence), ensure_ascii=False, indent=2))


def render_self_review(audit):
    fallback = audit["llm_evidence"]["rule_llm"]["clinical_fallback_cases"]
    extraction_failures = {k: v["extraction_failures"] for k, v in audit["llm_evidence"].items()}
    full_level = "ĐẠT CÓ ĐIỀU KIỆN: có ca không đi qua Full, được công khai" if fallback else "ĐẠT"
    extraction_level = "ĐẠT CÓ ĐIỀU KIỆN: lỗi được giữ trong mẫu số" if any(extraction_failures.values()) else "ĐẠT"
    return "\n".join([
        "# Tự đánh giá A–E — hai lượt đánh giá KB-2026.11", "",
        "Rà kỹ thuật báo cáo: Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo; kết luận ĐẠT CÓ ĐIỀU KIỆN, xem [biên bản trong README](README.md). Rà chuyên môn lâm sàng: PENDING. Các mục ĐẠT dưới đây dựa trên kiểm tra đầu ra, không thay xác nhận lâm sàng của bác sĩ.", "",
        "## A. Đọc lại và đối chiếu yêu cầu gốc", "",
        "| Yêu cầu | Đã làm chưa | Bằng chứng | Kết luận |", "|---|---|---|---|",
        "| Đọc runner, docstring, tham số và README mục 6/LLM | Đã đọc; không đoán mode | run_eval_help.txt; README mục môi trường | ĐẠT |",
        "| Chạy help để lấy mode thật | Help thành công bằng Python venv/UTF-8, mode RuleOnly/Full/both | run_eval_help.txt; ledger arguments | ĐẠT |",
        "| Đọc quy trình RuleOnly cũ, dùng staging riêng | Đã đối chiếu rule_only_once.json/README cũ; dựng cluster staging từ trống, không sao medassist | staging_setup.json; staging_acceptance_after.json; evaluation/results/kb_2026_11_acceptance/README.md | ĐẠT |",
        "| KB-2026.11 Active, không giả phê duyệt người thật | Kích hoạt kỹ thuật bằng tài khoản mô phỏng theo quyền Tuấn xác nhận rõ; rà chéo vẫn PENDING | import_staging.log; dry_run_active.log; staging_acceptance_after.json | ĐẠT |",
        "| Kiểm Ollama/Gemma/provider; dừng nếu chưa sẵn sàng, không fake | Chỉ chạy khi kết nối/model thật đã sẵn sàng. Provider hai lượt là ollama | meta trong results.json; llm_calls.jsonl; ledger từng lượt | ĐẠT |",
        "| RuleOnly đúng một lần, đủ 82 lâm sàng + 29 trích xuất | Đủ 111 ID đúng tập đóng băng; không skip, limit hoặc extraction-only | attempt_rule_only.json; rule_only/results.json; rule_only/cases.csv | ĐẠT |",
        f"| Full đúng một lần, đủ 82 lâm sàng + 29 trích xuất | Đủ 111 ID; có HTTP model thật, phân biệt mode yêu cầu với mode thực tế | attempt_rule_llm.json; rule_llm/results.json; llm_calls.jsonl | {full_level} |",
        f"| Trích xuất đủ ca, phân biệt chạy xong với thành công | Cả hai có 29 dòng, đối chiếu completed/failure; không bỏ ca lỗi khỏi mẫu số | results.json; independent_verification.json | {extraction_level} |",
        "| Lưu đúng summary.md/results.json/cases.csv vào hai thư mục | Runner chuẩn ghi đủ ba file, CSV 82 dòng dữ liệu mỗi lượt | rule_only/ và rule_llm/ | ĐẠT |",
        "| Hash KB trước/sau giống nhau | Toàn bộ 179 đường dẫn và byte hash khớp baseline và trước/sau từng lượt | knowledge_hashes_before.json ở gốc; knowledge_hashes_before.json và knowledge_hashes_after.json trong từng mode; ledger knowledge_hashes_equal | ĐẠT |",
        "| Hash v1.3 khớp manifest, không cập nhật manifest | Tính lại từng JSONL chuẩn hóa CRLF→LF, kết hợp đúng thứ tự extraction:clinical | independent_verification.json; git diff | ĐẠT |",
        "| Full gọi LLM thật, có model/log/thời gian, không che fallback | HTTP envelope ghi model/token/thời gian thực, ghép ca bằng timestamp/progress, báo mọi lỗi và fallback | llm_calls.jsonl; progress.jsonl; independent_verification.json; so_sanh.md | ĐẠT |",
        "| So sánh recall/báo nhầm, mức ưu tiên, DDx top-1/top-3, trích xuất, thời gian | Bảng sinh từ giá trị đã tính lại; mẫu số DDx ghi riêng | so_sanh.md; recomputed_metrics trong independent_verification.json | ĐẠT |",
        "| Liệt kê ca đổi thứ hạng | So toàn bộ danh sách top-3 theo ID, gồm cả thay thành viên và thứ tự | rank_changes.csv; bảng trong so_sanh.md | ĐẠT |",
        "| Tính lại bằng script độc lập, từng số khớp results.json | Không import runner/pipeline để tính chỉ số; so toàn bộ cấu trúc clinical/extraction với sai số float 1e-10 | verify_compare.py; independent_verification.json | ĐẠT |",
        "| Không chỉnh KB/luật/prompt/testset theo kết quả | Không có diff file tracked; hash KB/testset giữ nguyên. Script chỉ quan sát, kiểm chứng và viết báo cáo | git diff/status; hash baseline/cuối | ĐẠT |",
        "| Không kết luận khoa học vượt dữ liệu | Ghi rõ một lần/mode, bộ nhỏ, mẫu DDx nhỏ, cache/tải model/mạng/timeout; không tuyên bố ưu thế tổng quát hoặc an toàn toàn KB | so_sanh.md mục giới hạn | ĐẠT |",
        "| CSDL thật không bị dùng để đánh giá; không đổi file ngoài results | Tất cả kết nối DB của dựng staging/runner đều đích loopback15435/database riêng, không sao dữ liệu thật. File docs untracked có sẵn từ việc trước giữ nguyên | staging_setup.json; ledger; staging_acceptance_after.json; git status/diff | ĐẠT |",
        "| Nhánh mới, không push/tag, không bí mật | Tiếp tục nhánh eval riêng; không thực hiện push/tag. Kết quả không chứa URL CSDL có mật khẩu, token hoặc khóa riêng | README.md; quét bí mật và inventory artifact cuối | ĐẠT |", "",
        "## B. Kiểm chứng lại từ đầu trên kết quả cuối", "",
        "Lệnh từ root: `.\\venv\\Scripts\\python.exe evaluation/results/kb_2026_11_eval_2026-11-15/verify_compare.py`. Chạy lại sau khi hoàn tất báo cáo; mã thoát 0 và PASS. Lệnh này không chạy lại benchmark, không gọi LLM/CSDL. Đồng thời kiểm git status --short --untracked-files=all, git diff --stat, git diff --check; quét bí mật và kiểm các file/liên kết báo cáo trên đĩa. Artifact bị ignore vẫn được liệt kê trong artifacts_manifest.json.", "",
        f'Hash testset cuối: {audit["combined_sha256"]}. 179 file KB khớp trước/sau. Đối chiếu 82/29 ca/mode, ledger attempts=1/mode, toàn bộ chỉ số tính lại và CSV thành công. Script không dùng kết quả RuleOnly cũ ngày 11/11 để thay lượt mới.', "",
        "## C. Soát như người phản biện", "",
        f'Ca Full ngoài Emergency về fallback: {fallback}. Lỗi trích xuất theo lượt: {extraction_failures}. Các ca này vẫn nằm trong results.json và mẫu số, không bị loại để nâng chỉ số. Số ca đổi top-3: {audit["rank_change_cases"]}; không mặc định đổi hạng là tốt hơn.', "",
        "Đếm theo file, không theo dự kiến. RuleOnly lâm sàng không gọi LLM nhưng trích xuất có gọi; Full cờ đỏ có thể Skipped đúng thiết kế. HTTP thành công/JSON hợp lệ chưa đồng nghĩa đầu ra qua Node 4, vì vậy trạng thái pipeline được báo riêng. Hai lượt chạy tuần tự, không ngẫu nhiên hóa hoặc chạy lặp để đánh giá phương sai. Không suy diễn y khoa từ thứ hạng và không sửa KB sau đánh giá.", "",
        "## D. Các lỗi/điểm được làm rõ sau tự rà", "",
        "Lỗi mã hóa help được sửa bằng UTF-8 trong tiến trình; đường dẫn kiểm prompt ban đầu được sửa theo thư mục thật, không sửa prompt. Lỗi stdin khởi tạo staging được xử lý bằng byte UTF-8, kiểm tra DB riêng trước khi tiếp tục. Lần bộ duyệt tự động từ chối activation không được thực thi lại bằng đường vòng; chỉ tiếp tục sau khi Tuấn cho phép rõ.", "",
        "Instrumentation gặp trùng tên hàm run_extraction nên một số event gốc không có case_id; giữ log gốc và ghép độc lập trong bộ nhớ theo khoảng timestamp start/end duy nhất trong progress. Không gọi lại model để sửa log và không thay nội dung trả về của pipeline. Mã model cấu hình không tự chứng minh model đã gọi, và Active staging không phải phê duyệt lâm sàng. Bản ghép log và JSON đổi hạng trùng CSV đã được bỏ khi lọc file; script không tái tạo các bản trùng này. Sau hoàn tất tài liệu, lặp lại A–C và bước B; không dùng kết quả kiểm cũ để kết luận.", "",
        "Sau tự rà đã phân biệt Degraded do không có ứng viên với lỗi gọi LLM: đối chiếu top-3 rỗng ở cả hai lượt, không có HTTP cho các ca tương ứng và nhánh bỏ qua reasoning khi không có ứng viên ở graph.py:104, cùng NO_CANDIDATES ở node4_output_validation.py:84. Không chạy lại các ca để xác định nguyên nhân và không quy các ca này thành model lỗi.", "",
        "Đã làm rõ mẫu số thời gian: mean/p50/p95 lâm sàng tính trên cả 82 ca, gồm các ca Skipped và Degraded không gọi LLM; không diễn giải p50 đó là thời gian một lần suy luận Gemma.", "",
        "Quét artifact cuối ban đầu đọc mọi file như UTF-8 nên vấp log do PowerShell chuyển hướng ở dạng UTF-16 có BOM; đã sửa thao tác kiểm để nhận diện BOM và giữ nguyên log gốc, rồi chạy lại kiểm chứng từ đầu.", "",
        "Đã sửa tham chiếu snapshot ở gốc sau khi lọc file: gốc chỉ còn baseline trước chạy, còn đủ before/after trong từng mode. Theo README và xác nhận rõ trong hội thoại, Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo; chuyên môn lâm sàng vẫn PENDING. Đã đồng bộ mẫu sinh báo cáo để không ghi ngược vai trò này khi chạy lại verifier. Giữ đúng lịch sử các phép kiểm tự động, không suy ra đã có người thứ hai độc lập hoặc bác sĩ thẩm định. Không sửa số liệu hoặc đầu ra gốc.", "",
        "## E. Kết luận và việc cần người thật quyết", "",
        f'Đủ dữ liệu hai lượt và khớp chỉ số/hash: ĐẠT. Đường Full: {full_level}. Trích xuất: {extraction_level}. Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo; kết luận ĐẠT CÓ ĐIỀU KIỆN cho báo cáo mô tả một lượt/mode. Rà chuyên môn lâm sàng vẫn PENDING. Giữ đầy đủ lỗi/fallback và giới hạn, không chạy thêm hoặc sửa tri thức theo testset.', "",
        "Quyết định vận hành sau đánh giá ngày 15/11/2026: Tuấn quyết định dừng staging trước, giữ nguyên container và volume dữ liệu. Đã dừng medassist-kb202611-eval-20261115; trạng thái kiểm chứng sau dừng là exited, running=false, ghi tại final_checks.json mục staging_lifecycle. Phần dừng không còn chờ quyết định; chưa có yêu cầu xóa vĩnh viễn. Không phát sinh quyết định y khoa mới, các mục chuyên môn PENDING vẫn thuộc công việc bác sĩ riêng.", "",
    ])


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
        "Rà kỹ thuật báo cáo: Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo; kết luận ĐẠT CÓ ĐIỀU KIỆN, xem [biên bản trong README](README.md). Rà chuyên môn lâm sàng: PENDING. Đây là kết quả kỹ thuật, không phải phê duyệt lâm sàng.", "",
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
