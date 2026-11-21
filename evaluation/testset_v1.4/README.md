# Testset v1.4

Bộ riêng cho KB-2026.11: **82 ca lâm sàng + 29 ca trích xuất**. **Đã đóng băng nội dung ngày 17/11/2026** theo quyết định của Tuấn, kèm các giới hạn đã ghi. Trạng thái, hash, thời điểm và quyết định đóng băng nằm trong manifest; rà chuyên môn vẫn PENDING_CROSS_REVIEW.

| Tệp | Vai trò |
|---|---|
| `clinical_cases_labeled.jsonl` | 82 ca lâm sàng |
| `symptom_extraction_testset.jsonl` | 29 ca trích xuất |
| `manifest_freeze.json` | Hash, nhãn cũ/mới, phạm vi và quyết định |
| [CHANGES.md](CHANGES.md) | Thay đổi, phản hồi Huy, rà kỹ thuật và giới hạn |
| `verify_v1_4.py` | Kiểm chỉ đọc, hỗ trợ draft/frozen |
| `freeze_v1_4.py` | Xem trước/áp dụng quyết định đóng băng |

Chỉ **5 ID** khác v1.3: CLIN-019, EXT-010, EXT-014, EXT-024, EXT-026; 4 ID đổi nhãn, **106 bản ghi nguyên byte**. EXT-011 và mọi lời kể giữ nguyên. Ngày 17/11 Huy báo rà đủ 111 ca, đúng danh sách ID và combined hash. Tổng kết nhóm ĐỒNG Ý thiếu CLIN-021; Huy chưa chạy verifier sửa ngày 17/11. Tuấn quyết định đóng băng kèm hai giới hạn này và các điểm chờ bác sĩ; chi tiết ở CHANGES.md.

Giới hạn: CLIN-019 chờ bác sĩ; EXT-022/023 giữ ABSENT sốt thiếu dữ kiện theo quyết định giữ phạm vi của Tuấn; EXT-024 giữ nhãn với giới hạn trích đoạn BYT; các vấn đề khác từ v1.3 được ghi tại CHANGES.md. KB và v1.3 không đổi; chưa chạy benchmark v1.4.

Từ thư mục gốc repo:

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
.\venv\Scripts\python.exe evaluation/testset_v1.4/verify_v1_4.py
```

Kỳ vọng PASS: 82+29 ca, 5 ID khác byte, 106 bản ghi nguyên byte, không mã lạ/ID trùng; 179 tệp KB và hash v1.3 khớp. Runner dùng trực tiếp `--testset evaluation/testset_v1.4`, không sửa runner.

Combined v1.4: `a136d072e8c5149f25409591b245b61865e3320a5233ad73ef9d4d54aec86161`. Chuẩn hóa CRLF→LF; combined = SHA-256 của `sha_ext + ":" + sha_clin` mã hóa UTF-8. Quy trình đóng băng/commit ở [README tổng evaluation](../README.md).

Hash kiểm nội dung JSONL, CSV, README, CHANGES, manifest nguồn, snapshot KB và prompt đều chuẩn hóa CRLF→LF. Hash byte thô cũ giữ làm lịch sử; `text_file_sha256` dùng để kiểm nội dung hiện tại. Các số đếm bản ghi nguyên byte trong kết quả kiểm được tính sau chuẩn hóa xuống dòng. Kiểm hồi quy toàn bộ verifier trên bản sao LF/CRLF: `python evaluation/testset_v1.4/verify_v1_4.py --self-test-portability` (sau khi kích hoạt venv).

Quyết định đóng băng nội dung ngày 17/11 được ghi tại `freeze_authorization`; trạng thái áp dụng và thời điểm thực tế nằm trong manifest. Script vẫn kiểm đúng 111 ID và hash của biên bản Huy. Chỗ lệch tổng kết CLIN-021 và việc Huy chưa chạy verifier mới chỉ được chấp nhận khi có quyết định rõ ràng của Tuấn cho đúng hash; không sửa trạng thái biên bản thành hoàn tất. Các ca chờ bác sĩ tiếp tục chờ; không đổi nhãn sau freeze.
