# Tự đánh giá A–E — hai lượt đánh giá KB-2026.11

Rà kỹ thuật báo cáo: Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo; kết luận ĐẠT CÓ ĐIỀU KIỆN, xem [biên bản trong README](README.md). Rà chuyên môn lâm sàng: PENDING. Các mục ĐẠT dưới đây dựa trên kiểm tra đầu ra, không thay xác nhận lâm sàng của bác sĩ.

## A. Đọc lại và đối chiếu yêu cầu gốc

| Yêu cầu | Đã làm chưa | Bằng chứng | Kết luận |
|---|---|---|---|
| Đọc runner, docstring, tham số và README mục 6/LLM | Đã đọc; không đoán mode | run_eval_help.txt; README mục môi trường | ĐẠT |
| Chạy help để lấy mode thật | Help thành công bằng Python venv/UTF-8, mode RuleOnly/Full/both | run_eval_help.txt; ledger arguments | ĐẠT |
| Đọc quy trình RuleOnly cũ, dùng staging riêng | Đã đối chiếu rule_only_once.json/README cũ; dựng cluster staging từ trống, không sao medassist | staging_setup.json; staging_acceptance_after.json; evaluation/results/kb_2026_11_acceptance/README.md | ĐẠT |
| KB-2026.11 Active, không giả phê duyệt người thật | Kích hoạt kỹ thuật bằng tài khoản mô phỏng theo quyền Tuấn xác nhận rõ; rà chéo vẫn PENDING | import_staging.log; dry_run_active.log; staging_acceptance_after.json | ĐẠT |
| Kiểm Ollama/Gemma/provider; dừng nếu chưa sẵn sàng, không fake | Chỉ chạy khi kết nối/model thật đã sẵn sàng. Provider hai lượt là ollama | meta trong results.json; llm_calls.jsonl; ledger từng lượt | ĐẠT |
| RuleOnly đúng một lần, đủ 82 lâm sàng + 29 trích xuất | Đủ 111 ID đúng tập đóng băng; không skip, limit hoặc extraction-only | attempt_rule_only.json; rule_only/results.json; rule_only/cases.csv | ĐẠT |
| Full đúng một lần, đủ 82 lâm sàng + 29 trích xuất | Đủ 111 ID; có HTTP model thật, phân biệt mode yêu cầu với mode thực tế | attempt_rule_llm.json; rule_llm/results.json; llm_calls.jsonl | ĐẠT CÓ ĐIỀU KIỆN: có ca không đi qua Full, được công khai |
| Trích xuất đủ ca, phân biệt chạy xong với thành công | Cả hai có 29 dòng, đối chiếu completed/failure; không bỏ ca lỗi khỏi mẫu số | results.json; independent_verification.json | ĐẠT CÓ ĐIỀU KIỆN: lỗi được giữ trong mẫu số |
| Lưu đúng summary.md/results.json/cases.csv vào hai thư mục | Runner chuẩn ghi đủ ba file, CSV 82 dòng dữ liệu mỗi lượt | rule_only/ và rule_llm/ | ĐẠT |
| Hash KB trước/sau giống nhau | Toàn bộ 179 đường dẫn và byte hash khớp baseline và trước/sau từng lượt | knowledge_hashes_before.json ở gốc; knowledge_hashes_before.json và knowledge_hashes_after.json trong từng mode; ledger knowledge_hashes_equal | ĐẠT |
| Hash v1.3 khớp manifest, không cập nhật manifest | Tính lại từng JSONL chuẩn hóa CRLF→LF, kết hợp đúng thứ tự extraction:clinical | independent_verification.json; git diff | ĐẠT |
| Full gọi LLM thật, có model/log/thời gian, không che fallback | HTTP envelope ghi model/token/thời gian thực, ghép ca bằng timestamp/progress, báo mọi lỗi và fallback | llm_calls.jsonl; progress.jsonl; independent_verification.json; so_sanh.md | ĐẠT |
| So sánh recall/báo nhầm, mức ưu tiên, DDx top-1/top-3, trích xuất, thời gian | Bảng sinh từ giá trị đã tính lại; mẫu số DDx ghi riêng | so_sanh.md; recomputed_metrics trong independent_verification.json | ĐẠT |
| Liệt kê ca đổi thứ hạng | So toàn bộ danh sách top-3 theo ID, gồm cả thay thành viên và thứ tự | rank_changes.csv; bảng trong so_sanh.md | ĐẠT |
| Tính lại bằng script độc lập, từng số khớp results.json | Không import runner/pipeline để tính chỉ số; so toàn bộ cấu trúc clinical/extraction với sai số float 1e-10 | verify_compare.py; independent_verification.json | ĐẠT |
| Không chỉnh KB/luật/prompt/testset theo kết quả | Không có diff file tracked; hash KB/testset giữ nguyên. Script chỉ quan sát, kiểm chứng và viết báo cáo | git diff/status; hash baseline/cuối | ĐẠT |
| Không kết luận khoa học vượt dữ liệu | Ghi rõ một lần/mode, bộ nhỏ, mẫu DDx nhỏ, cache/tải model/mạng/timeout; không tuyên bố ưu thế tổng quát hoặc an toàn toàn KB | so_sanh.md mục giới hạn | ĐẠT |
| CSDL thật không bị dùng để đánh giá; không đổi file ngoài results | Tất cả kết nối DB của dựng staging/runner đều đích loopback15435/database riêng, không sao dữ liệu thật. File docs untracked có sẵn từ việc trước giữ nguyên | staging_setup.json; ledger; staging_acceptance_after.json; git status/diff | ĐẠT |
| Nhánh mới, không push/tag, không bí mật | Tiếp tục nhánh eval riêng; không thực hiện push/tag. Kết quả không chứa URL CSDL có mật khẩu, token hoặc khóa riêng | README.md; quét bí mật và inventory artifact cuối | ĐẠT |

## B. Kiểm chứng lại từ đầu trên kết quả cuối

Lệnh từ root: `.\venv\Scripts\python.exe evaluation/results/kb_2026_11_eval_2026-11-15/verify_compare.py`. Chạy lại sau khi hoàn tất báo cáo; mã thoát 0 và PASS. Lệnh này không chạy lại benchmark, không gọi LLM/CSDL. Đồng thời kiểm git status --short --untracked-files=all, git diff --stat, git diff --check; quét bí mật và kiểm các file/liên kết báo cáo trên đĩa. Artifact bị ignore vẫn được liệt kê trong artifacts_manifest.json.

Hash testset cuối: 4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d. 179 file KB khớp trước/sau. Đối chiếu 82/29 ca/mode, ledger attempts=1/mode, toàn bộ chỉ số tính lại và CSV thành công. Script không dùng kết quả RuleOnly cũ ngày 11/11 để thay lượt mới.

## C. Soát như người phản biện

Ca Full ngoài Emergency về fallback: ['CLIN-068', 'CLIN-069', 'CLIN-070', 'CLIN-071', 'CLIN-072', 'CLIN-073', 'CLIN-074', 'CLIN-075', 'CLIN-076', 'CLIN-077']. Lỗi trích xuất theo lượt: {'rule_only': {'EXT-008': 'UNMAPPED_PHRASE', 'EXT-010': 'UNMAPPED_PHRASE', 'EXT-028': 'UNMAPPED_PHRASE'}, 'rule_llm': {'EXT-008': 'UNMAPPED_PHRASE', 'EXT-010': 'UNMAPPED_PHRASE', 'EXT-028': 'UNMAPPED_PHRASE'}}. Các ca này vẫn nằm trong results.json và mẫu số, không bị loại để nâng chỉ số. Số ca đổi top-3: 2; không mặc định đổi hạng là tốt hơn.

Đếm theo file, không theo dự kiến. RuleOnly lâm sàng không gọi LLM nhưng trích xuất có gọi; Full cờ đỏ có thể Skipped đúng thiết kế. HTTP thành công/JSON hợp lệ chưa đồng nghĩa đầu ra qua Node 4, vì vậy trạng thái pipeline được báo riêng. Hai lượt chạy tuần tự, không ngẫu nhiên hóa hoặc chạy lặp để đánh giá phương sai. Không suy diễn y khoa từ thứ hạng và không sửa KB sau đánh giá.

## D. Các lỗi/điểm được làm rõ sau tự rà

Lỗi mã hóa help được sửa bằng UTF-8 trong tiến trình; đường dẫn kiểm prompt ban đầu được sửa theo thư mục thật, không sửa prompt. Lỗi stdin khởi tạo staging được xử lý bằng byte UTF-8, kiểm tra DB riêng trước khi tiếp tục. Lần bộ duyệt tự động từ chối activation không được thực thi lại bằng đường vòng; chỉ tiếp tục sau khi Tuấn cho phép rõ.

Instrumentation gặp trùng tên hàm run_extraction nên một số event gốc không có case_id; giữ log gốc và ghép độc lập trong bộ nhớ theo khoảng timestamp start/end duy nhất trong progress. Không gọi lại model để sửa log và không thay nội dung trả về của pipeline. Mã model cấu hình không tự chứng minh model đã gọi, và Active staging không phải phê duyệt lâm sàng. Bản ghép log và JSON đổi hạng trùng CSV đã được bỏ khi lọc file; script không tái tạo các bản trùng này. Sau hoàn tất tài liệu, lặp lại A–C và bước B; không dùng kết quả kiểm cũ để kết luận.

Sau tự rà đã phân biệt Degraded do không có ứng viên với lỗi gọi LLM: đối chiếu top-3 rỗng ở cả hai lượt, không có HTTP cho các ca tương ứng và nhánh bỏ qua reasoning khi không có ứng viên ở graph.py:104, cùng NO_CANDIDATES ở node4_output_validation.py:84. Không chạy lại các ca để xác định nguyên nhân và không quy các ca này thành model lỗi.

Đã làm rõ mẫu số thời gian: mean/p50/p95 lâm sàng tính trên cả 82 ca, gồm các ca Skipped và Degraded không gọi LLM; không diễn giải p50 đó là thời gian một lần suy luận Gemma.

Quét artifact cuối ban đầu đọc mọi file như UTF-8 nên vấp log do PowerShell chuyển hướng ở dạng UTF-16 có BOM; đã sửa thao tác kiểm để nhận diện BOM và giữ nguyên log gốc, rồi chạy lại kiểm chứng từ đầu.

Đã sửa tham chiếu snapshot ở gốc sau khi lọc file: gốc chỉ còn baseline trước chạy, còn đủ before/after trong từng mode. Theo README và xác nhận rõ trong hội thoại, Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo; chuyên môn lâm sàng vẫn PENDING. Đã đồng bộ mẫu sinh báo cáo để không ghi ngược vai trò này khi chạy lại verifier. Giữ đúng lịch sử các phép kiểm tự động, không suy ra đã có người thứ hai độc lập hoặc bác sĩ thẩm định. Không sửa số liệu hoặc đầu ra gốc.

## E. Kết luận và việc cần người thật quyết

Đủ dữ liệu hai lượt và khớp chỉ số/hash: ĐẠT. Đường Full: ĐẠT CÓ ĐIỀU KIỆN: có ca không đi qua Full, được công khai. Trích xuất: ĐẠT CÓ ĐIỀU KIỆN: lỗi được giữ trong mẫu số. Tuấn trực tiếp rà kỹ thuật và xác nhận báo cáo; kết luận ĐẠT CÓ ĐIỀU KIỆN cho báo cáo mô tả một lượt/mode. Rà chuyên môn lâm sàng vẫn PENDING. Giữ đầy đủ lỗi/fallback và giới hạn, không chạy thêm hoặc sửa tri thức theo testset.

Quyết định vận hành sau đánh giá ngày 15/11/2026: Tuấn quyết định dừng staging trước, giữ nguyên container và volume dữ liệu. Đã dừng medassist-kb202611-eval-20261115; trạng thái kiểm chứng sau dừng là exited, running=false, ghi tại final_checks.json mục staging_lifecycle. Phần dừng không còn chờ quyết định; chưa có yêu cầu xóa vĩnh viễn. Không phát sinh quyết định y khoa mới, các mục chuyên môn PENDING vẫn thuộc công việc bác sĩ riêng.
