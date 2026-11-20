# Hồ sơ đánh giá MedAssist — KB-2026.11

| Phần | Điểm đọc chính | Nội dung |
|---|---|---|
| Kết quả 15/11 | [README kết quả](results/kb_2026_11_eval_2026-11-15/README.md) | Một lượt RuleOnly và Full trên v1.3; số liệu, cấu hình, lỗi/fallback và bằng chứng gốc |
| Testset v1.4 | [README v1.4](testset_v1.4/README.md) | 82+29 ca; manifest, thay đổi/rà chéo và công cụ kiểm/đóng băng |
| Hỏi chuyên gia | [Tổng kết phiếu](review/expert_questions_tong_ket.md) | 615 câu; ưu tiên 6 bệnh → 2 ICD → 110 liên kết |
| Testset v1.3 | [README v1.3](testset/README.md) | Bộ đóng băng gốc; không thay hai JSONL hoặc manifest |

Giữ dữ liệu và bằng chứng ở thư mục tương ứng. Testset v1.4 chỉ có một hồ sơ thay đổi/rà chéo CHANGES.md; trạng thái vận hành lấy từ manifest. Các nhận xét chuyên môn chưa chốt vẫn PENDING. Không dùng kết quả benchmark để sửa KB, luật, prompt hoặc testset.

## Quy trình đóng băng v1.4 và commit

Chạy từ thư mục gốc repo, trên nhánh làm việc riêng. Các bước 1–2 chỉ kiểm tra và xem trước. Bước 3 ghi quyết định đóng băng; bước 5 tạo commit. Không push hoặc tạo tag.

## 1. Kiểm lại

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
.\venv\Scripts\python.exe evaluation/testset_v1.4/verify_v1_4.py
if ($LASTEXITCODE -ne 0) { throw 'Kiểm v1.4 chưa đạt' }
.\venv\Scripts\python.exe evaluation/review/verify_expert_questions.py
if ($LASTEXITCODE -ne 0) { throw 'Kiểm phiếu chuyên gia chưa đạt' }
.\venv\Scripts\python.exe evaluation/results/kb_2026_11_eval_2026-11-15/verify_compare.py
if ($LASTEXITCODE -ne 0) { throw 'Kiểm báo cáo đánh giá chưa đạt' }
```

Cả ba phải PASS. Kết quả mong đợi: 82+29 ca; đúng 5 ID khác v1.3, 106 bản ghi nguyên byte; 615 câu hỏi chuyên gia; đủ hai lượt đánh giá cũ, một lượt/mode. Không chạy lại benchmark.

## 2. Xem trước đóng băng

```powershell
.\venv\Scripts\python.exe evaluation/testset_v1.4/freeze_v1_4.py --dry-run
```

Trước khi áp dụng, dry-run trả `status=DRY_RUN`, `manifest_written=false` và kiểm manifest frozen đề xuất trong bộ nhớ; không ghi tệp. Nếu manifest đã frozen, script từ chối áp dụng lại; dùng verify_v1_4.py để kiểm. Ngày 17/11 Tuấn đã chấp nhận đóng băng với các giới hạn biên bản được ghi riêng trong `freeze_authorization`, gắn đúng combined hash. Đọc kỹ danh sách giới hạn trước bước 3:

- CLIN-019 giữ nhãn, CẦN BÁC SĨ QUYẾT.
- EXT-022/023 giữ ABSENT sốt thiếu dữ kiện theo quyết định giữ phạm vi năm ID của Tuấn; khuyến nghị sửa của Huy được bảo lưu.
- EXT-024 giữ nhãn và giới hạn trích đoạn nguồn BYT; các vấn đề khác từ v1.3 tiếp tục ghi tại testset_v1.4/CHANGES.md.
- Huy báo rà đủ 111 ca ngày 17/11, danh sách và hash khớp; tổng kết nhóm ĐỒNG Ý còn thiếu CLIN-021, Huy chưa chạy verifier sửa ngày 17/11. Tuấn chấp nhận đóng băng kèm hai giới hạn; không ghi thêm verdict hoặc PASS của Huy.

Biên bản đầy đủ được ghi riêng tại `cross_review.full_review` trong manifest, giữ nguyên phản hồi năm ca trước đó. Các trường bắt buộc:

- `reviewer: "Huy"`, `status: "COMPLETED"`, `full_testset_confirmation: true`.
- `reviewed_at`: ngày rà dạng YYYY-MM-DD; `reviewed_case_ids`: đúng 111 ID duy nhất.
- `combined_sha256`: khớp bộ ca hiện tại.
- `record_path`: đường dẫn biên bản có thật trong repo; `record_sha256`: SHA-256 nội dung biên bản sau chuẩn hóa CRLF→LF.

Chỉ ghi các trường này sau khi nhận biên bản thực tế của Huy.

Đối với biên bản 17/11 còn lệch tổng kết, giữ nguyên `cross_review.full_review_submission.status=NEEDS_CLARIFICATION`. Script chỉ chấp nhận qua `freeze_authorization` của Tuấn với quyết định `FREEZE_WITH_RECORDED_REVIEW_LIMITATIONS`, đúng combined hash và biên bản đã băm; phải ghi nhận cả `CLIN_021_SUMMARY_COUNT` và `HUY_CURRENT_VERIFIER_NOT_RUN` trong `accepted_review_limitations`, cùng mô tả ở `known_limitations`. Vẫn bắt buộc phạm vi đủ 111 ID, hash khớp và có biên bản Huy; xác nhận năm ID không đủ. Quyết định này đã được Tuấn đưa ra ngày 17/11, không thay phê duyệt lâm sàng.

## 3. Áp dụng quyết định của Tuấn

Chỉ chạy sau khi Huy rà đủ 111 ca và Tuấn quyết định đóng băng nội dung cùng các giới hạn trên:

```powershell
.\venv\Scripts\python.exe evaluation/testset_v1.4/freeze_v1_4.py --apply --decision-by 'Tuấn' --accept-known-limitations
if ($LASTEXITCODE -ne 0) { throw 'Chưa áp dụng đóng băng; dừng' }
.\venv\Scripts\python.exe evaluation/testset_v1.4/verify_v1_4.py
if ($LASTEXITCODE -ne 0) { throw 'Kiểm sau đóng băng chưa đạt; dừng' }
```

Kỳ vọng `status=APPLIED`, sau đó PASS với `is_frozen=true`, `freeze_version=testset-v1.4-frozen`. Script chỉ cập nhật manifest v1.4: trạng thái, thời điểm +07:00, người quyết định, danh sách giới hạn và hash nội dung được khóa. Không thay hai JSONL, không sửa KB/v1.3, không tạo phê duyệt lâm sàng. Trạng thái rà chuyên môn vẫn PENDING_CROSS_REVIEW; phản hồi Huy và quyết định phạm vi trước đó được giữ nguyên như bản ghi lịch sử.

Nếu đã frozen, script từ chối ghi lại. Không sửa JSONL sau đóng băng; thay đổi dữ liệu tiếp theo cần bộ riêng và quyết định mới. Các biên bản Huy/CROSS_REVIEW phản ánh thời điểm rà trước đóng băng; trạng thái vận hành lấy từ manifest.

## 4. Stage đúng evaluation

```powershell
git status --short
git add -- evaluation/
```

Hai log đã có trong inventory kết quả bị Git ignore; cần thêm đích danh để người nhận có đủ bằng chứng chạy verifier:

```powershell
git add -f -- evaluation/results/kb_2026_11_eval_2026-11-15/dry_run_active.log evaluation/results/kb_2026_11_eval_2026-11-15/import_staging.log
git diff --cached --stat
git diff --cached --name-status
git diff --cached --check
```

Đối chiếu danh sách: toàn bộ tệp của commit nằm trong evaluation; README v1.3 chỉ có dòng chỉ dẫn đã thêm trước đó. Hai JSONL và manifest v1.3 không được có thay đổi. Không stage docs/, knowledge/, server/, bí mật hoặc dữ liệu diễn tập client.

## 5. Kiểm điều kiện và commit

```powershell
$freezeManifest = Get-Content evaluation/testset_v1.4/manifest_freeze.json -Raw -Encoding utf8 | ConvertFrom-Json
if (-not $freezeManifest.is_frozen) { throw 'v1.4 chưa đóng băng; chưa tạo commit đóng băng' }
$protectedChanges = git diff --cached --name-only -- knowledge/ server/ evaluation/testset/clinical_cases_labeled.jsonl evaluation/testset/symptom_extraction_testset.jsonl evaluation/testset/manifest_freeze.json
if ($protectedChanges) { throw 'Có thay đổi ở tệp được bảo vệ; dừng để kiểm tra' }
.\venv\Scripts\python.exe evaluation/testset_v1.4/verify_v1_4.py
if ($LASTEXITCODE -ne 0) { throw 'Kiểm v1.4 chưa đạt; dừng commit' }
git commit --only -m 'chore(evaluation): đóng băng v1.4 và hoàn thiện hồ sơ đánh giá' -m 'Ghi nhận phạm vi 5 ID và các giới hạn còn lại; bảo toàn KB và testset v1.3. Bổ sung kết quả hai chế độ và phiếu hỏi chuyên gia.' -- evaluation/
git show --stat --oneline HEAD
git status --short
```

Lệnh commit giới hạn path evaluation, không đưa các tệp docs đang mở vào commit. Kiểm lại danh sách trong `git show`; giữ commit ở máy, không push/tag. Các mục chuyên môn còn chờ vẫn được bảo toàn trong báo cáo và manifest.
