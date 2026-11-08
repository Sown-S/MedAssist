---
schema: okf_release_v1
label: KB-2026.10
description: Bản phát hành tri thức lâm sàng tinh lọc 169 bệnh, đã loại bỏ các liên kết chẩn đoán phân biệt nhầm lẫn, trọng số chuẩn hóa 3 mức (0.9/0.6/0.3).
---

## Changelog KB-2026.10

- Loại bỏ đủ 43 liên kết mã triệu chứng chéo trong đợt rà soát, bao gồm liên kết `acne_comedones_nodulocystic` (0.3) cuối cùng tại `benh_da_nghe_nghiep`. Hồ sơ này còn 14 quan hệ.
- Sửa lỗi cắt ngắn tên bệnh và mã ICD-10 so với bản develop cũ:
  - `chom_xuong_dui`: từ "Chỏm xương đùi" (M89.2) thành "Hoại tử vô mạch chỏm xương đùi" (M87).
  - `ngoai_xuong_canh_tay`: từ "Ngoài xương cánh tay" (M89.1) thành "Viêm lồi cầu ngoài xương cánh tay" (M77.1).
- Hai thay đổi tên bệnh và ICD-10 không ảnh hưởng nội dung testset v1.3 đã đóng băng: cả hai tệp `clinical_cases_labeled.jsonl` và `symptom_extraction_testset.jsonl` không có ca nào sử dụng hai `condition_code` trên. Giữ nguyên nội dung testset và `combined_sha256`: `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`.
