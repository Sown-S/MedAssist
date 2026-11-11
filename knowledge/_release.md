---
schema: okf_release_v1
label: KB-2026.11
description: Bản phát hành tri thức 153 bệnh, 299 triệu chứng, 12 luật, 1522 quan hệ; trọng số 0.9/0.6/0.3; còn các mục chờ rà chuyên môn.
---

## Changelog KB-2026.11

- Gỡ 11 bệnh cấp cứu/nhiễm trùng nặng và 5 hồ sơ triệu chứng khỏi DDx; giữ nguyên catalog và luật. Danh sách mã và kiểm tra không có tham chiếu trong hai testset: `evaluation/results/kb_2026_11_acceptance/removal_checks.json`. Gỡ bệnh không bảo đảm ca đó đã được cổng an toàn bảo vệ.
- Gỡ 23 liên kết chéo; giữ 597 liên kết chưa chắc chờ bác sĩ quyết. Danh sách bệnh ← triệu chứng và lý do: `evaluation/results/kb_2026_11_acceptance/cross_links.csv`.
- Thêm then chốt cho 9 bệnh, gồm 4 bệnh TMH ưu tiên; còn 16 bệnh chưa chọn được then chốt đủ chắc. Danh sách từng bệnh, triệu chứng, trọng số cũ, nguồn và lý do: `evaluation/results/kb_2026_11_acceptance/key_symptoms.csv`. CHƯA RÀ LÂM SÀNG; không coi rà bộ ca v1.3 là duyệt các then chốt. Mỗi bệnh có 0 hoặc 1 then chốt SUPPORTS/0.9; 0.9 chỉ dành cho then chốt.
- Chỉ sửa ICD `benh_viem_khop_vay_nen`: M89.9 → L40.5; `viem_khop_thieu_nien_tu_phat_the_viem_khop_vay_nen`: M89.0 → M09.0. ICD CẦN BÁC SĨ XÁC NHẬN cách dùng một mã tại Việt Nam, đặc biệt mã dấu sao M09.0 đi kèm bệnh nền. Giữ nguyên mã bệnh/tên hồ sơ.
- Số liệu đếm từ tệp: 153 bệnh (dermatology 56, ent 36, musculoskeletal 28, ophthalmology 20, infectious 11, respiratory 2), 299 triệu chứng, 12 luật, 11 nguồn, 1.522 quan hệ, 156 trích dẫn; trọng số 0.9/0.6/0.3 lần lượt 137/882/503.
- Đã nhận rà Huy và xác nhận Tuấn: 106 ĐỒNG Ý, 5 CẦN SỬA; giữ các lưu ý chuyên môn, không khẳng định toàn bộ ca đạt. Giữ nguyên v1.3 và hash, sửa nhãn thuộc công việc v1.4. Đề xuất luật/trích xuất thuộc việc riêng, không áp dụng trong bản này. Xem `evaluation/review/README_review.md`.

## Changelog KB-2026.10

- Loại bỏ đủ 43 liên kết mã triệu chứng chéo trong đợt rà soát, bao gồm liên kết `acne_comedones_nodulocystic` (0.3) cuối cùng tại `benh_da_nghe_nghiep`. Hồ sơ này còn 14 quan hệ.
- Sửa lỗi cắt ngắn tên bệnh và mã ICD-10 so với bản develop cũ:
  - `chom_xuong_dui`: từ "Chỏm xương đùi" (M89.2) thành "Hoại tử vô mạch chỏm xương đùi" (M87).
  - `ngoai_xuong_canh_tay`: từ "Ngoài xương cánh tay" (M89.1) thành "Viêm lồi cầu ngoài xương cánh tay" (M77.1).
- Hai thay đổi tên bệnh và ICD-10 không ảnh hưởng nội dung testset v1.3 đã đóng băng: cả hai tệp `clinical_cases_labeled.jsonl` và `symptom_extraction_testset.jsonl` không có ca nào sử dụng hai `condition_code` trên. Giữ nguyên nội dung testset và `combined_sha256`: `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`.

## Ghi chú các mốc trước (KB-2026.08, KB-2026.09)

- KB-2026.08 và KB-2026.09 là các mốc trung gian; nội dung đã được gộp vào KB-2026.10 nên không có changelog riêng tại đây.
- KB-2026.09 thu hẹp phạm vi danh mục và bổ sung cổng an toàn: xem mục "Tương thích cổng an toàn (từ KB-2026.09)" trong `symptoms/symptom_catalog.md` và mục "Bao phủ khi thu hẹp phạm vi (từ KB-2026.09)" trong `rules/red_flags/rf_out_of_scope.md`.
- Testset v1.3 được đóng băng ở KB-2026.09 và hiện tham chiếu KB-2026.10 (xem `evaluation/testset/manifest_freeze.json`).
