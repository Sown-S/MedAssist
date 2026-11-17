# Phiếu hỏi chuyên gia — KB-2026.11

Ngày chuẩn bị: 16/11/2026. Trạng thái: **PENDING_CROSS_REVIEW**. Chưa ghi nhận câu trả lời bác sĩ; KB không thay đổi.

## Phạm vi và thứ tự ưu tiên

Nhóm trọng tâm gồm 28 hồ sơ trong `knowledge/conditions/musculoskeletal/` và 10 bệnh phổ biến: sáu bệnh trong bảng dưới cùng `viem_amidan_cap_va_man_tinh`, `viem_mui_xoang_di_ung`, `hen_phe_quan`, `phoi_tac_nghen_man_tinh`.

**Ưu tiên 1 — chọn then chốt cho 6 bệnh phổ biến**, nhóm a trong phiếu trọng tâm:

| condition_code | Tên bệnh trong KB |
|---|---|
| `cum_mua` | Cúm mùa |
| `hong_thanh_quan_viem_mui_hong_cap_tinh` | Họng - thanh quản viêm mũi họng cấp tính |
| `viem_hong_cap_tinh` | Viêm họng cấp tính |
| `viem_mui_xoang_cap_tinh` | Viêm mũi xoang cấp tính |
| `viem_tai_giua_cap_tinh_tre_em` | Viêm tai giữa cấp tính trẻ em |
| `viem_thanh_quan_cap_tinh` | Viêm thanh quản cấp tính |

**Ưu tiên 2 — hai mục ICD**, nhóm b: `benh_viem_khop_vay_nen` (L40.5) và `viem_khop_thieu_nien_tu_phat_the_viem_khop_vay_nen` (M09.0; cần xác minh mã dấu sao/mã kèm).

**Ưu tiên 3 — 110 liên kết trọng tâm**, nhóm c, đã nhóm theo bệnh chủ tham chiếu. Phiếu ngoài nhóm để rà sau.

Phạm vi amidan: **một mã gộp cấp và mạn**, `viem_amidan_cap_va_man_tinh` (Viêm amidan cấp và mạn tính). Thanh quản hạ thanh môn là hồ sơ riêng `viem_thanh_quan_cap_tinh_ha_thanh_mon` (Viêm thanh quản cấp tính hạ thanh môn), **ngoài nhóm trọng tâm**.

## Số câu hỏi

| Nhóm | Trọng tâm | Ngoài nhóm | Tổng |
|---|---:|---:|---:|
| a) Bệnh chưa then chốt | 6 | 10 | 16 |
| b) ICD | 2 | 0 | 2 |
| c) Liên kết chờ bác sĩ | 110 | 487 | 597 |
| **Tổng** | **118** | **497** | **615** |

**118 + 497 = 615 = 16 + 2 + 597**; không sót/trùng. Mỗi bệnh chưa then chốt là một câu hỏi chứa các ứng viên; 16 bệnh có tổng 216 ứng viên hiện có. Không có bệnh cơ xương khớp nào trong danh sách thiếu then chốt.

Tệp: [trọng tâm](expert_questions_nhom_trong_tam.csv), [ngoài nhóm](expert_questions_ngoai_nhom.csv). Mỗi CSV có 10 cột, UTF-8 BOM, phân cột bằng dấu phẩy; ô có thể chứa xuống dòng. Không đếm dòng văn bản để đếm câu hỏi.

## Cách dùng và giới hạn

- Nhóm a: mã và trọng số ngăn bằng `;`, tên ngăn bằng ` | `, tương ứng theo vị trí. Liệt kê mọi quan hệ SUPPORTS hiện có, `is_key=false`, chưa chọn hoặc xếp hạng ứng viên. Nguồn gắn với quan hệ chưa chứng minh mã đủ đặc hiệu.
- Nhóm c: phân trong/ngoài nhóm theo `condition_code` của bệnh chứa quan hệ. Sắp xếp theo bệnh chủ → condition_code → symptom_code; bệnh chủ giữ nguyên từ bảng rà cũ, chưa được bác sĩ xác nhận. Chỉ lấy 597 hàng CẦN BÁC SĨ QUYẾT, không gồm 112 GIỮ và 23 XÓA.
- Bác sĩ chọn GIỮ NGUYÊN / BỎ / SỬA / CHƯA ĐỦ DỮ KIỆN; khi sửa ghi rõ mã/nội dung và căn cứ vào ô trả lời. Toàn bộ 615 ô trả lời hiện để trống; 597 câu liên kết không có phương án chọn sẵn.
- Chưa có bảng ICD tiếng Việt BYT để xác nhận cách dùng hai ICD trong bộ chứng cứ này. Then chốt, trọng số, liên kết và ICD đều chờ chuyên gia; không dùng thứ hạng pipeline để quyết định.

Nguồn: `evaluation/results/kb_2026_11_acceptance/conditions_without_key.json`, `cross_links.csv`, `key_symptoms.csv`, `README.md`; mỗi câu có đường dẫn hồ sơ bệnh, nguồn BYT và vị trí trích dẫn. Chín then chốt lịch sử được đối chiếu, không tạo thêm câu hỏi.

## Kiểm lại

Từ thư mục gốc repo:

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
.\venv\Scripts\python.exe evaluation/review/verify_expert_questions.py
```

Kỳ vọng PASS: 615 câu, không sót/trùng; **813 lượt đối chiếu quan hệ = 216 ứng viên + 597 liên kết**; mã/tên/trọng số/nguồn khớp KB; 9 then chốt lịch sử khớp; hash v1.3 đúng manifest. Script chỉ đọc, không gọi pipeline, LLM hoặc CSDL. Kiểm tra này không thay xác minh y khoa hay rà chéo của người thật.
