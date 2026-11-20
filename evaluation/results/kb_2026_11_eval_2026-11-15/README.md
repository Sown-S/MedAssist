# Đánh giá KB-2026.11 — 15/11/2026

**Một lượt cho mỗi chế độ**, trên testset v1.3 đóng băng: 82 ca lâm sàng và 29 ca trích xuất/lượt. Rà chuyên môn lâm sàng: **PENDING**.

## Cấu hình

- Server `0.2.5`, commit `c6a6916a80134b2611990e6193136bbeee17fffd`; KB-2026.11 Active trên staging.
- PostgreSQL riêng: container `medassist-kb202611-eval-20261115`, `127.0.0.1:15435`, database `medassist_kb202611_stage_20261115`. Không dùng hoặc sao CSDL `medassist`.
- `LLM_PROVIDER=ollama`; model `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`, endpoint `http://100.127.111.5:11434` qua relay TCP loopback tạm của `run_once.py`.
- Prompt suy luận `reasoning-v3`; trích xuất `phrases`, 4 ứng viên/cụm, prompt `extraction-phrases-compact-v3, extraction-phrases-v2`.
- Mode runner: `RuleOnly` và `Full`; không giới hạn ca, không bỏ trích xuất. RuleOnly chỉ áp dụng cho lâm sàng/DDx; cả hai lượt đều gọi model thật cho 29 ca trích xuất.
- Cấu hình và thời gian mỗi lượt: `attempt_rule_only.json`, `attempt_rule_llm.json`. Container đánh giá đã được dừng sau chạy ngày 15/11, dữ liệu giữ lại; bằng chứng tại `final_checks.json`, mục `staging_lifecycle`.

## Kết quả

| Chỉ số | RuleOnly + trích xuất | Full + trích xuất |
|---|---|---|
| Số ca lâm sàng / trích xuất | 82 / 29 | 82 / 29 |
| Recall cờ đỏ | 48/48 | 48/48 |
| Báo nhầm Emergency | 0 | 0 |
| Mức ưu tiên đúng | 82/82 | 82/82 |
| DDx top-1 (18 ca có nhãn) | 83.33% | 88.89% |
| DDx top-3 (18 ca có nhãn) | 94.44% | 94.44% |
| Trích xuất F1 mã + trạng thái | 58.46% | 58.46% |
| Trích xuất khớp toàn ca / hoàn tất kỹ thuật | 1/29 / 26/29 | 1/29 / 26/29 |

- Full: 24 ca lâm sàng gọi model; 48 ca cờ đỏ Skipped; 10 ca không có ứng viên trả Degraded/RuleOnly. Cả hai lượt có 29 lời gọi model cho trích xuất.
- Có **2 ca khác danh sách/thứ tự top-3**. Chi tiết, thời gian, ca lỗi và fallback: [so_sanh.md](so_sanh.md), [rank_changes.csv](rank_changes.csv).
- Đầu ra chuẩn: `rule_only/` và `rule_llm/`, mỗi thư mục có `summary.md`, `results.json`, `cases.csv`, log tiến độ và log gọi model. `artifacts_manifest.json` liệt kê tệp và hash.

## Giới hạn

Một lượt/mode, chỉ 18 ca có nhãn DDx; không kiểm định ý nghĩa thống kê, độ ổn định hoặc khả năng khái quát trên 153 bệnh. Chênh lệch một ca không chứng minh ưu thế tổng quát. Thời gian phụ thuộc cache, GPU, hàng đợi model và Tailscale; thống kê lâm sàng gồm cả ca không gọi LLM. Ba lỗi trích xuất vẫn nằm trong mẫu số; hoàn tất kỹ thuật không đồng nghĩa đúng nhãn. Không dùng kết quả để điều chỉnh KB, luật, prompt hoặc testset.

## Kiểm lại từ đầu ra đã lưu

Từ thư mục gốc repo:

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
.\venv\Scripts\python.exe evaluation/results/kb_2026_11_eval_2026-11-15/verify_compare.py
```

Kỳ vọng PASS: 82 + 29 ca/mode, một lượt/mode, toàn bộ chỉ số khớp `results.json`, hai ca đổi top-3, 179 tệp KB và hash v1.3 không đổi. Script chỉ đọc đầu ra đã lưu, tính lại và in kết quả kiểm chứng ra màn hình; không ghi tệp trong repo, không gọi model hoặc CSDL. Không chạy lại `run_once.py` để kiểm báo cáo.

Combined SHA-256 v1.3 sau chuẩn hóa CRLF→LF: `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`. Sáu đầu ra chuẩn và log/ledger gốc được bảo toàn; `artifacts_manifest.json` phục vụ kiểm byte. Một số log bị Git ignore; cần có đủ các tệp được liệt kê để chạy lại verifier.
