# Testset v1.4 riêng — bản nháp chờ rà chéo

- 82 ca lâm sàng và 29 ca trích xuất, sao từ v1.3; chỉ 5 ID có thay đổi. 106 ca còn lại giữ nguyên từng byte, kể cả xuống dòng.
- Manifest: `manifest_freeze_v1.4.json`; `review_status=PENDING_CROSS_REVIEW`, chưa đóng băng, chưa chạy benchmark.
- Bốn ca đổi nhãn: EXT-010, EXT-014, EXT-024, EXT-026. CLIN-019 giữ toàn bộ nhãn v1.3, chỉ cập nhật trạng thái/ghi chú chờ bác sĩ.
- Cập nhật 16/11/2026 theo xác nhận người giao việc: EXT-010 chọn **A**, bỏ ABSENT cơ học; chỉ áp dụng suy luận loại trừ giữa hai mã khác nhau, không đảo thống nhất EXT-011 (15 phút đối chiếu >1 giờ trên cùng thông số). EXT-011 giữ nguyên byte.
- CLIN-019: **CẦN BÁC SĨ QUYẾT**, giữ nguyên nhãn và không thêm clinical_note; checklist bác sĩ xác minh nằm ngoài JSONL trong CHANGES.md.
- EXT-014/024/026 đã có nhãn theo đề xuất được người giao việc đồng ý; giữ nguyên ba bản ghi so với bản v1.4 trước cập nhật. Toàn bộ bộ ca vẫn chờ rà chéo, không ghi phê duyệt lâm sàng.
- Nhận xét Huy đầy đủ, nhãn cũ → mới, nguồn và đề xuất: [CHANGES.md](CHANGES.md). Nhãn mới là đề xuất chờ rà chéo, không phải phê duyệt chuyên môn.
- `review_status` lịch sử của 106 ca được sao nguyên byte từ v1.3, không phải xác nhận/APPROVED mới cho v1.4. Trạng thái chung của v1.4 do manifest quyết định.
- [Manifest v1.3](../testset/manifest_freeze.json) và hai JSONL v1.3 giữ nguyên; README v1.3 chỉ nối thêm một dòng chỉ dẫn tới bộ riêng này.

Kiểm chứng từ root (không gọi pipeline/LLM/CSDL):

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
.\venv\Scripts\python.exe evaluation/testset_v1.4/verify_v1_4.py
```

Lưu ý tích hợp: runner hiện đọc tên file không có hậu tố phiên bản; không trỏ trực tiếp `--testset` vào thư mục này rồi cho là đã đánh giá v1.4. Điều chỉnh cách chạy v1.4 thuộc việc riêng; không sửa runner trong công việc này.
