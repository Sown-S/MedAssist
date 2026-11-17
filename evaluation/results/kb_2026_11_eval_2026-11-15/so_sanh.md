# So sánh RuleOnly và Full — KB-2026.11

Báo cáo kỹ thuật mô tả một lượt mỗi chế độ. Rà chuyên môn lâm sàng: PENDING; kết quả không thay thế thẩm định lâm sàng.

Mỗi chế độ chạy đúng một lần trên staging riêng medassist_kb202611_stage_20261115 (127.0.0.1:15435), server 0.2.5, commit c6a6916a80134b2611990e6193136bbeee17fffd. Không dùng/sao CSDL medassist.

Sau khi đánh giá hoàn tất, ngày 15/11/2026 Tuấn quyết định dừng staging trước và giữ nguyên dữ liệu. Container medassist-kb202611-eval-20261115 đã dừng; lần kiểm sau dừng ghi nhận exited/running=false, không xóa container hoặc volume. Bằng chứng: final_checks.json mục staging_lifecycle. Trạng thái này không thay đổi snapshot KB Active đã dùng khi chạy benchmark.

Provider ollama; model hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M; prompt suy luận reasoning-v3; trích xuất phrases, prompt extraction-phrases-compact-v3, extraction-phrases-v2. Endpoint thật http://100.127.111.5:11434 qua relay TCP loopback tạm; không sửa adapter/prompt/ngân sách thời gian. Lượt RuleOnly chỉ dùng luật cho lâm sàng/DDx, vẫn dùng model thật cho 29 ca trích xuất.

Thời điểm bắt đầu: RuleOnly 2026-11-15T16:39:15.147551+07:00; Full 2026-11-15T16:44:07.281522+07:00. Múi giờ +07:00.

## Chỉ số

| Chỉ số | RuleOnly + trích xuất thật | Full + trích xuất thật |
|---|---|---|
| Số ca lâm sàng / trích xuất | 82 / 29 | 82 / 29 |
| Recall cờ đỏ | 48/48 (100.00%) | 48/48 (100.00%) |
| Báo nhầm Emergency (số ca) | 0 | 0 |
| Mức ưu tiên đúng | 82/82 (100.00%) | 82/82 (100.00%) |
| DDx top1 | 15/18 (83.33%) | 16/18 (88.89%) |
| DDx top3 | 17/18 (94.44%) | 17/18 (94.44%) |
| Luật precision | 100.00% | 100.00% |
| Trích xuất mã + trạng thái precision | 59.38% | 59.38% |
| Trích xuất chỉ mã precision | 59.38% | 59.38% |
| Luật recall | 100.00% | 100.00% |
| Trích xuất mã + trạng thái recall | 57.58% | 57.58% |
| Trích xuất chỉ mã recall | 57.58% | 57.58% |
| Luật f1 | 100.00% | 100.00% |
| Trích xuất mã + trạng thái f1 | 58.46% | 58.46% |
| Trích xuất chỉ mã f1 | 58.46% | 58.46% |
| Trích xuất khớp toàn ca | 1/29 | 1/29 |
| Trích xuất completed=true | 26/29 | 26/29 |
| Trích xuất lỗi / chưa phân loại | 3 / 0 | 3 / 0 |
| Trích xuất quá 30.000 ms (số ca) | 0 | 0 |
| Lâm sàng mean_ms | 7.74 | 9186.75 |
| Lâm sàng p50_ms | 0.50 | 1.80 |
| Lâm sàng p95_ms | 18.50 | 36845.50 |
| Lâm sàng max_ms | 63.40 | 43042.30 |
| Trích xuất mean_ms | 9041.77 | 8835.16 |
| Trích xuất p50_ms | 8806.70 | 8673.10 |
| Trích xuất p95_ms | 11732.30 | 10906.10 |
| Trích xuất max_ms | 13922.70 | 11994.80 |
| Tổng wall time runner (ms) | 263442.4 | 1010115.2 |
| Số HTTP gọi model: lâm sàng / trích xuất | 0 / 29 | 24 / 29 |
| HTTP model hoàn tất / tổng | 29/29 | 53/53 |
| Phân bố ai_status / mode lâm sàng | Degraded/RuleOnly: 34; Skipped/RuleOnly: 48 | Completed/Full: 24; Skipped/RuleOnly: 48; Degraded/RuleOnly: 10 |

DDx chỉ tính trên ca không Emergency có nhãn DDx; không lấy 82 ca làm mẫu số DDx. Top-1: ứng viên đầu có trong tập nhãn; top-3: có ít nhất một nhãn trúng trong ba ứng viên. Không suy ra chất lượng toàn bộ 153 bệnh. P95 là phần tử tại chỉ số round(0,95 × (n−1)) sau sắp xếp; thời gian gồm gọi qua Tailscale và có thể gồm tải model/hàng đợi phía Ollama.

Mean/p50/p95 lâm sàng lấy trên toàn bộ 82 ca, gồm cả Skipped và Degraded không gọi LLM. Vì vậy p50 của lượt Full không đại diện thời gian suy luận một ca đi qua Gemma; thời gian/token từng lần gọi thật nằm trong llm_calls.jsonl. Wall time còn bao gồm vòng lặp runner, đọc snapshot và phần trích xuất.

## LLM thật, fallback và lỗi

- rule_only: ca lâm sàng ngoài Emergency không có mode Full (chỉ áp dụng lượt yêu cầu Full) = []; lỗi trích xuất = {'EXT-008': 'UNMAPPED_PHRASE', 'EXT-010': 'UNMAPPED_PHRASE', 'EXT-028': 'UNMAPPED_PHRASE'}; lỗi HTTP = []; lỗi JSON LLM = [].
- rule_llm: ca lâm sàng ngoài Emergency không có mode Full (chỉ áp dụng lượt yêu cầu Full) = ['CLIN-068', 'CLIN-069', 'CLIN-070', 'CLIN-071', 'CLIN-072', 'CLIN-073', 'CLIN-074', 'CLIN-075', 'CLIN-076', 'CLIN-077']; lỗi trích xuất = {'EXT-008': 'UNMAPPED_PHRASE', 'EXT-010': 'UNMAPPED_PHRASE', 'EXT-028': 'UNMAPPED_PHRASE'}; lỗi HTTP = []; lỗi JSON LLM = [].
- Lượt Full có các ca top-3 rỗng ở cả hai lượt và không gọi LLM: ['CLIN-068', 'CLIN-069', 'CLIN-070', 'CLIN-071', 'CLIN-072', 'CLIN-073', 'CLIN-074', 'CLIN-075', 'CLIN-076', 'CLIN-077']. Kết quả phù hợp nhánh không có ứng viên: graph.py:104 bỏ qua reasoning, node4_output_validation.py:84 trả NO_CANDIDATES và Degraded/RuleOnly. Đây là đối chiếu kết quả/log với mã nguồn, không phải chạy lại pipeline; không coi các ca này là lỗi kết nối/model hoặc Full thành công.

Metadata HTTP ghi model thực trả về, token, thời gian và lỗi, không ghi prompt hoặc nội dung sinh. Ca cờ đỏ có thể Skipped đúng thiết kế, không phải thất bại Full. Mọi fallback ngoài Emergency được liệt kê ở trên; không gọi chúng là Full thành công. Xem llm_calls.jsonl và progress.jsonl từng thư mục. Một số event trích xuất gốc không có case_id do trùng tên hàm run_extraction trong stack; script độc lập ghép duy nhất trong bộ nhớ theo khoảng thời gian start/end trong progress, giữ nguyên log gốc.

## Ca đổi danh sách hoặc thứ tự top-3

Có 2 ca khác top-3 giữa hai lượt; bảng gồm cả đổi thành viên và đổi thứ tự, không mặc định mọi khác biệt là cải thiện.

| Ca | RuleOnly top-3 | Full được yêu cầu: top-3 | Trạng thái thực tế |
|---|---|---|---|
| CLIN-003 | benh_viem_da_dang_herpes_cua_duhring_brocq, tay_chan_mieng, hong_thanh_quan_viem_mui_hong_cap_tinh | tay_chan_mieng, benh_viem_da_dang_herpes_cua_duhring_brocq, hong_thanh_quan_viem_mui_hong_cap_tinh | Completed/Full |
| CLIN-013 | dau_than_kinh_toa, benh_thoai_hoa_cot_song_that_lung, hoi_chung_dau_that_lung | dau_than_kinh_toa, hoi_chung_dau_that_lung, benh_thoai_hoa_cot_song_that_lung | Completed/Full |

## Kiểm chứng và giới hạn

Tính lại độc lập bằng verify_compare.py từ từng ca results.json, đối chiếu nhãn đầu vào, 82 dòng CSV mỗi lượt, 29 ca trích xuất mỗi lượt, toàn bộ chỉ số JSON và ledger một lần gọi. Các giá trị bảng được sinh trực tiếp từ phép tính đã khớp JSON; làm tròn chỉ để hiển thị. Audit: independent_verification.json; rank_changes.csv. KB 179 file có hash trước/sau giống nhau ở cả hai lượt. Hash v1.3 chuẩn hóa CRLF→LF khớp manifest: 4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d. Manifest không cập nhật.

Mỗi chế độ chỉ một lượt, bộ test nhỏ và chỉ một tập con có nhãn DDx; không kiểm định ý nghĩa thống kê, độ ổn định hay khả năng khái quát. Hai lượt chạy tuần tự nên cache model, tải GPU, lưu lượng Tailscale, hàng đợi Ollama và timeout có thể khác nhau; không quy toàn bộ chênh lệch thời gian hoặc trích xuất cho mode lâm sàng. Không điều chỉnh KB, luật, prompt hoặc testset theo kết quả. Chưa có quyết định/thẩm định y khoa mới. Báo cáo tiền kiểm cũ đã được bỏ khi lọc file; đầu ra đánh giá và bằng chứng chính vẫn giữ nguyên.
