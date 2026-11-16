# Đánh giá KB-2026.11 — 15/11/2026

Rà kỹ thuật báo cáo: **Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo; ĐẠT CÓ ĐIỀU KIỆN** theo biên bản bên dưới. Rà chuyên môn lâm sàng: **PENDING**. Không ghi nhận người thứ hai độc lập hoặc bác sĩ đã thẩm định. Kích hoạt tri thức trên staging là mô phỏng kỹ thuật được Tuấn cho phép rõ trong hội thoại.

## Nơi đọc kết quả

- [So sánh hai lượt](so_sanh.md): chỉ số, trạng thái Full/fallback, ca khác top-3 và giới hạn.
- [Tự đánh giá A–E](tu_danh_gia.md): đối chiếu yêu cầu, kiểm chứng cuối và việc cần người thật quyết.
- [RuleOnly](rule_only/summary.md): `results.json`, `cases.csv` và bằng chứng gọi model cho trích xuất trong cùng thư mục.
- [Full](rule_llm/summary.md): `results.json`, `cases.csv` và bằng chứng gọi model cho lâm sàng/trích xuất trong cùng thư mục.
- [Kiểm chỉ số độc lập](independent_verification.json) và [ca đổi hạng CSV](rank_changes.csv).

Cả hai lượt đã kết thúc, mỗi lượt đủ 82 ca lâm sàng và 29 ca trích xuất. Ledger một lần gọi và thời gian thực tế nằm ở `attempt_rule_only.json`, `attempt_rule_llm.json`.

## Môi trường và quy trình

- Chạy đánh giá trên nhánh `eval/kb-2026-11-2026-11-15`; lọc file trên `eval/kb202611-results-cleanup`; rà kỹ thuật báo cáo trên `eval/kb202611-report-review`. Không push/tag.
- Đồng bộ tài liệu theo README Tuấn chỉnh sửa trên nhánh `eval/kb202611-align-readme`; không thay đổi dữ liệu đánh giá.
- PostgreSQL ở container mới `medassist-kb202611-eval-20261115`, loopback `127.0.0.1:15435`; database `medassist_kb202611_stage_20261115`. Dựng từ trống bằng vai trò SQL chuẩn và Alembic; không sao hay kết nối CSDL `medassist`.
- **Quyết định sau đánh giá ngày 15/11/2026: Tuấn quyết định dừng staging trước, chưa xóa container hoặc dữ liệu.** Đã thực hiện `docker stop medassist-kb202611-eval-20261115`; lần kiểm chứng sau dừng ghi nhận `running=false`, `status=exited`, volume dữ liệu được giữ nguyên. Bằng chứng trạng thái và quyết định nằm trong `final_checks.json` mục `staging_lifecycle`. Thư mục kết quả đánh giá được giữ nguyên; chưa có yêu cầu xóa staging vĩnh viễn.
- KB-2026.11 Active trên staging; đối chiếu tại [staging_acceptance_after.json](staging_acceptance_after.json), cùng `staging_setup.json`, `import_staging.log`, `dry_run_active.log`. Tài khoản `kb_stage_physician_test` chỉ mô phỏng kỹ thuật trên staging theo quyền Tuấn đã xác nhận rõ. Rà chéo vẫn PENDING.
- Model thật: `hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M`, endpoint được người dùng cung cấp `http://100.127.111.5:11434`. Không dùng fake. Cấu hình đĩa không đổi; provider/URL của tiến trình đánh giá được đặt riêng.
- Adapter hiện không nhận IP Tailscale trực tiếp; [run_once.py](run_once.py) dùng relay TCP loopback tạm tới đúng endpoint đó, không giải mã/ghi nội dung chuyển tiếp và không sửa adapter. Relay đóng sau lượt chạy.
- Mỗi mode chỉ một lần gọi `scripts.run_eval.main`, không `--limit`, không `--skip-extraction`, không `--extraction-only`, không file ca thay thế. Các tham số chính xác và thời gian thực tế lưu trong ledger từng lượt.
- `RuleOnly` áp dụng cho lâm sàng/DDx; phần trích xuất của cả hai lượt vẫn dùng Gemma thật để đáp ứng đủ 29 ca. Không mô tả lượt RuleOnly này là hoàn toàn không gọi model.
- Instrumentation chỉ quan sát đầu/cuối ca và lời gọi LLM, ghi model/token/thời gian/loại lỗi. Không ghi prompt/response và không thay kết quả trả về của pipeline; không đổi prompt, luật, thuật toán hoặc timeout. Log gốc được giữ nguyên, chỉ tạo bản ghép case_id để kiểm chứng sau.
- Bằng chứng model thật lấy từ metadata HTTP của chính hai lượt đánh giá. Các báo cáo tiền kiểm trước khi chạy và log trung gian đã được bỏ sau khi hoàn tất đánh giá; số lượt benchmark vẫn là một lần/mode.

## Kiểm chứng lại mà không chạy model

Từ thư mục gốc repo, chạy script đối chiếu độc lập sau khi có đủ hai kết quả:

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
.\venv\Scripts\python.exe evaluation/results/kb_2026_11_eval_2026-11-15/verify_compare.py
git status --short --untracked-files=all
git diff --stat
```

Script tính lại từ từng ca, đối chiếu số lượng và ID với testset đóng băng, CSV, toàn bộ chỉ số results.json, log gọi LLM, ledger và hash KB/testset. Script chỉ đọc dữ liệu đánh giá và ghi lại các báo cáo so sánh/kiểm chứng trong thư mục kết quả; không kết nối CSDL, không gọi model. Không chạy lại `run_once.py` hoặc runner: đã đặt chốt từ chối lượt thứ hai khi ledger/kết quả tồn tại.

Hash KB từng file trước/sau ở thư mục gốc và từng mode. SHA-256 testset chuẩn hóa CRLF→LF phải khớp manifest, combined `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`; không cập nhật manifest. Script tính lại chỉ số không điều chỉnh tri thức theo kết quả.

Các log `.log` và `.jsonl` có thể bị Git ignore theo quy tắc sẵn có; chúng vẫn là artifact trên đĩa. Danh sách file giao cuối và hash artifact ghi trong `artifacts_manifest.json`; không tự stage/commit/force-add file bị ignore.

## Tự đánh giá việc lọc file theo A–E

| A — Yêu cầu | Đã làm / bằng chứng | E — Kết luận |
|---|---|---|
| Chỉ giữ file cần thiết | Giữ đầu ra chuẩn, báo cáo, script kiểm chứng, ledger, log HTTP/progress gốc, hash và bằng chứng staging. Bỏ 17 file trung gian/trùng; danh sách cụ thể trong artifacts_manifest.json mục cleanup. | ĐẠT |
| Không làm mất kết quả/bằng chứng gốc | Hash byte của sáu đầu ra chuẩn, log gốc, ledger và snapshot KB được so trước/sau; final_checks.json ghi kết quả. | ĐẠT |
| Không còn liên kết hoặc script tái tạo file đã bỏ | Cập nhật README và script sinh báo cáo; ghép log trong bộ nhớ, chỉ giữ CSV đổi hạng. Kiểm đường dẫn và chạy lại verifier. | ĐẠT |
| Giữ KB/testset, không chạy lại benchmark/CSDL | Verifier tính lại từ file; SHA-256 v1.3 và 179 file KB khớp. Không gọi model hoặc kết nối CSDL khi lọc file. | ĐẠT |
| Phạm vi đúng, không có bí mật | Git status/diff và quét nội dung; chỉ đổi trong thư mục kết quả này, file docs có sẵn giữ nguyên. | ĐẠT |

B — Chạy lại từ đầu trên bộ file cuối: lệnh verify_compare.py ở trên trả PASS, đủ 82+29 ca và một lượt/mode; hash testset/KB, hash đầu ra chuẩn trước/sau, liên kết cục bộ và inventory đều khớp. Các lệnh git status --short --untracked-files=all, git diff --stat, git diff --check đã chạy; kết quả lưu final_checks.json.

C — Soát phản biện: không xóa log LLM/progress gốc hoặc ledger để lấy chỗ cho báo cáo; không coi file Git ignore là đã mất; bộ còn 31 file, gồm manifest tự liệt kê phạm vi. Các lỗi/fallback và giới hạn khoa học trong so_sanh.md vẫn giữ nguyên.

D — Sau tự rà đã sửa script để không tái tạo JSON đổi hạng và bản ghép log trùng, đồng thời đổi mọi tham chiếu staging sang bằng chứng sau chạy còn giữ. Đã chạy lại bước B sau các chỉnh sửa này.

E — Lọc file: ĐẠT. Rà chuyên môn lâm sàng vẫn PENDING. Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo như ghi bên dưới. Tuấn đã quyết định dừng staging trước, giữ nguyên container và dữ liệu; chưa yêu cầu xóa vĩnh viễn.

## Biên bản rà kỹ thuật báo cáo — Tuấn trực tiếp thực hiện — 15/11/2026

Người trực tiếp rà kỹ thuật và xác nhận báo cáo: Tuấn, theo xác nhận rõ trong hội thoại “Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo”. Xác nhận này áp dụng cho việc rà báo cáo kỹ thuật, không thay đổi lịch sử chạy benchmark hoặc các phép kiểm tự động đã lưu. Phạm vi: số liệu, bằng chứng chạy, tính nhất quán và mức độ kết luận trong báo cáo; không xác nhận đã có phản biện độc lập bởi người thứ hai hoặc bác sĩ thẩm định y khoa của nhãn testset, quan hệ, trọng số, ICD hay luật.

**Quyết định:** giữ bộ kết quả để trình bày như báo cáo kỹ thuật mô tả **một lượt mỗi mode**, kết luận **ĐẠT CÓ ĐIỀU KIỆN**. Điều kiện sử dụng báo cáo: giữ nguyên mẫu số, các ca lỗi/không qua LLM và giới hạn nghiên cứu; không diễn giải chênh lệch một ca DDx là bằng chứng ưu thế tổng quát, không coi đây là thẩm định lâm sàng. Không yêu cầu chạy lại benchmark để hoàn thành lượt rà này.

### A. Yêu cầu và bằng chứng

| Yêu cầu rà | Bằng chứng đã đối chiếu | Kết luận |
|---|---|---|
| Ghi nhận Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo | Xác nhận rõ của Tuấn nêu trên; kết luận sử dụng báo cáo có điều kiện, giữ chuyên môn PENDING. | ĐẠT |
| Rà lại số liệu bằng cách tính khác | Tính trực tiếp từ JSON bằng tập hợp và phân số Fraction, không gọi verifier/pipeline để lấy kết quả: 48/48 cờ đỏ, 0 báo nhầm, 82/82 mức ưu tiên; DDx 15/18 và 16/18 top-1, cùng 17/18 top-3. Sau đó chạy lại verifier để so toàn bộ chỉ số. | ĐẠT |
| Kiểm phần trích xuất và cách đếm lỗi | Mỗi lượt TP/FP/FN mã + trạng thái = 57/39/42; P = 57/96, R = 57/99, F1 = 38/65 = 58,46% khi làm tròn. Khớp toàn ca 1/29, hoàn tất kỹ thuật 26/29; ba UNMAPPED_PHRASE vẫn nằm trong mẫu số. | ĐẠT CÓ ĐIỀU KIỆN: không gọi completed là đúng nhãn |
| Model có chạy thật, không che suy giảm | Đọc lại mọi HTTP envelope: đúng model, done=true, done_reason=stop, có token đầu ra, JSON hợp lệ. 29 lời gọi trích xuất ở RuleOnly; 24 lâm sàng + 29 trích xuất ở Full. 48 ca cờ đỏ bỏ LLM, 10 ca không có ứng viên giữ Degraded/RuleOnly. | ĐẠT |
| Bằng chứng gốc và phạm vi dữ liệu giữ nguyên | Hash 24 file bảo toàn từ bước lọc, gồm sáu đầu ra chuẩn, log và ledger; hash KB/testset; đối chiếu manifest và trạng thái Git. | ĐẠT |
| Mức kết luận phù hợp dữ liệu | Một lượt/mode, 18 ca có nhãn DDx, hai ca đổi top-3; không có kiểm định hoặc đánh giá biến thiên. Giữ nguyên giới hạn và không suy diễn an toàn lâm sàng. | ĐẠT CÓ ĐIỀU KIỆN: chỉ dùng mô tả lần chạy |

### B–D. Kiểm chứng cuối và lỗi đã sửa

B — Trên bản cuối, chạy lại verify_compare.py, phép tính trực tiếp bằng Fraction, kiểm hash KB/testset, hash bằng chứng gốc, liên kết/tên file, git status/diff và quét bí mật. Xác nhận Tuấn trực tiếp rà báo cáo nằm tại final_checks.json mục direct_report_review_confirmation; bằng chứng tính lại chỉ số ở independent_verification.json. Các kiểm tra tự động trước đó được giữ trong lịch sử kiểm chứng. Không truy cập CSDL, không gọi model, không tăng số lượt benchmark.

C — Soát phản biện: completed của trích xuất không phải khớp nhãn; mode Full được yêu cầu không đồng nghĩa 82 ca đều gọi LLM; p50 lâm sàng gồm ca bỏ LLM. Chỉ số phản ánh nhãn v1.3 đã đóng băng, không xác nhận tính đúng y khoa của nhãn đó. Việc Tuấn trực tiếp rà báo cáo kỹ thuật không được suy ra thành phê duyệt lâm sàng hoặc phản biện độc lập bởi người thứ hai.

D — Đã sửa tham chiếu cũ “before/after ở gốc” vì sau lọc gốc chỉ giữ baseline before, còn đủ cặp before/after ở mỗi mode. Đã phân biệt việc Tuấn trực tiếp rà báo cáo kỹ thuật với phần chuyên môn lâm sàng PENDING; bỏ cách ghi chung “rà người thật PENDING” dễ mâu thuẫn với vai trò Tuấn trong README. Đã cập nhật mẫu sinh báo cáo để chạy verifier không phục hồi nội dung cũ. Không sửa bất kỳ số liệu hay file đầu ra gốc nào. Sau sửa, lặp lại A–C và B trên bộ cuối, vẫn 31 file.

### E. Kết luận và việc cần người thật quyết

Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo: **ĐẠT CÓ ĐIỀU KIỆN** theo phạm vi trên. Các trường review_status vẫn PENDING cho rà chuyên môn lâm sàng; xác nhận trực tiếp rà kỹ thuật của Tuấn và lịch sử kiểm chứng tự động được ghi riêng, không dùng APPROVED hoặc ký thay bác sĩ. Tuấn đã quyết định dừng staging trước, giữ dữ liệu; phần này không còn chờ quyết định dừng. Các mục chuyên môn đang chờ bác sĩ vẫn thuộc công việc riêng; không phát sinh quyết định y khoa mới.

## Tự đánh giá việc đồng bộ theo README và xác nhận trực tiếp của Tuấn

| A — Yêu cầu | Đã làm / bằng chứng | E — Kết luận |
|---|---|---|
| Đồng bộ theo README Tuấn đã sửa | README, đầu báo cáo so_sanh.md/tu_danh_gia.md, mẫu sinh trong verify_compare.py và metadata thống nhất Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo, theo xác nhận mới của Tuấn. | ĐẠT |
| Giữ đúng lịch sử kiểm chứng và trạng thái chuyên môn | Giữ nguyên lịch sử các phép kiểm tự động; ghi nhận Tuấn trực tiếp rà báo cáo theo xác nhận mới, review_status chuyên môn vẫn PENDING. | ĐẠT |
| Không đổi dữ liệu hoặc chạy lại đánh giá | Hash 24 file bằng chứng giữ nguyên; số liệu, 179 file KB và hash v1.3 khớp; không gọi model/CSDL. | ĐẠT |

B — Chạy lại verify_compare.py trên bộ cuối, kiểm hash bằng chứng/KB/testset, đối chiếu các cách ghi vai trò, liên kết, inventory và git status/diff. Kết quả cụ thể lưu final_checks.json mục readme_alignment và direct_report_review_confirmation. Vẫn 31 file, không bổ sung file mới.

C–D — Sau tự rà đã đổi cách ghi “rà người thật/chuyên môn” thành “rà chuyên môn lâm sàng” để tránh phủ nhận vai trò Tuấn vừa xác nhận trong README, đồng thời giữ nguyên bằng chứng và lịch sử các phép kiểm tự động đã chạy. Đã sửa mẫu sinh để không ghi đè lại cách ghi cũ khi chạy verifier. Phép kiểm tiêu đề được sửa để tìm trực tiếp dòng mở đầu, không phụ thuộc số dòng trống hoặc chữ đậm Markdown; stdin từ PowerShell được đặt UTF-8 để không mất dấu tiếng Việt khi đối chiếu. Đã chuẩn hóa đường dẫn tuyệt đối trong phép kiểm inventory để so đúng với thư mục gốc repo. Sau đó lặp lại A–C và bước B.

E — Đồng bộ theo xác nhận Tuấn trực tiếp rà kỹ thuật: ĐẠT; kết luận đánh giá vẫn ĐẠT CÓ ĐIỀU KIỆN như trước. Tuấn đã quyết định dừng staging, chưa xóa dữ liệu. Các mục chuyên môn chờ bác sĩ giữ nguyên; không phát sinh quyết định y khoa mới.

## Tự đánh giá việc làm rõ metadata rà báo cáo

| A — Yêu cầu | Đã làm / bằng chứng | E — Kết luận |
|---|---|---|
| Người rà kỹ thuật hiện tại là Tuấn | final_checks.json giữ direct_report_review_confirmation và report_review_responsibility ghi reviewer là Tuấn. | ĐẠT |
| Tách lịch sử hỗ trợ kiểm chứng khỏi người rà hiện tại | Đổi ai_report_review thành verification_support_history; dùng performed_by cho bên hỗ trợ trong lịch sử, đánh dấu không phải người rà hiện tại. Không xóa kết quả phép tính hoặc bằng chứng cũ. | ĐẠT |
| Giữ nguyên dữ liệu và trạng thái chuyên môn | 24 hash bằng chứng gốc, số liệu hai lượt, hash KB/testset giữ nguyên; review_status lâm sàng PENDING. | ĐẠT |

B — Chạy lại verify_compare.py, kiểm cấu trúc JSON và vai trò hiện tại/lịch sử, hash KB/testset/bằng chứng, liên kết, inventory và git status/diff/check trên bản cuối. Kết quả lưu final_checks.json mục review_metadata_cleanup; vẫn 31 file. Không gọi model/CSDL.

C–D — Sau tự rà đã bỏ cách dùng trường reviewer và trạng thái AI_TECHNICAL_REVIEW_COMPLETED ở mục lịch sử hỗ trợ để tránh nhầm với lượt rà trực tiếp của Tuấn; cập nhật tên và phạm vi, giữ nguyên người thực hiện hỗ trợ trước đây và toàn bộ số liệu đã lưu. Không sửa nội dung kết quả đánh giá. Lặp lại A–C và bước B sau chỉnh sửa.

E — Làm rõ metadata: ĐẠT. Tuấn đã quyết định dừng staging trước và giữ dữ liệu; không phát sinh quyết định mới cần người thật. Các việc chuyên môn giữ nguyên phạm vi trước đó.

## Tự đánh giá việc ghi quyết định dừng staging

| A — Yêu cầu | Đã làm / bằng chứng | E — Kết luận |
|---|---|---|
| Ghi rõ quyết định là của Tuấn | Quyết định từ hội thoại “tôi quyết định cho dừng trước”, ghi trong README và final_checks.json mục staging_lifecycle. | ĐẠT |
| Ghi đúng trạng thái và phạm vi | Kiểm lại Docker: container staging exited, running=false, volume dữ liệu còn tồn tại; không xóa container/volume hay kết quả. | ĐẠT |
| Đồng bộ các tài liệu liên quan | Mẫu verify_compare.py, tu_danh_gia.md và so_sanh.md không còn ghi chờ quyết định dừng; giữ rõ snapshot staging khi chạy benchmark với trạng thái sau dừng. | ĐẠT |
| Không đổi dữ liệu đánh giá/KB/testset | Verifier PASS; hash 24 file bằng chứng và 179 file KB, hash testset đóng băng khớp; vẫn 31 file. | ĐẠT |

B — Chạy lại verify_compare.py và các phép kiểm hash, vai trò quyết định, liên kết, inventory, git status/diff/check; kiểm Docker chỉ đọc. Kết quả tại final_checks.json mục staging_stop_documentation. Không chạy benchmark hoặc truy cập CSDL.

C–D — Sau tự rà đã thay các mục còn ghi “chờ Sơn/Tuấn quyết định dừng” bằng quyết định Tuấn đã đưa ra; giữ các bản ghi staging_setup và staging_acceptance_after là bằng chứng tại thời điểm đánh giá, không sửa lịch sử đó thành trạng thái vận hành hiện tại. Đã cập nhật mẫu sinh để không phục hồi câu cũ, rồi lặp lại A–C và bước B.

E — Ghi nhận quyết định dừng staging: ĐẠT. Không còn việc cần người thật quyết cho bước dừng này; chưa có yêu cầu xóa vĩnh viễn, các mục chuyên môn PENDING không đổi.
