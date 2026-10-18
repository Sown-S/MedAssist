---
schema: okf_condition_v1
condition_code: nhiem_trung_tieu_hoa_cap
name_vi: Viêm dạ dày - ruột nhiễm trùng cấp
name_en: Acute infectious gastroenteritis
icd10_code: A09
disease_group: gastrointestinal
description: Tình trạng nhiễm trùng cấp tính đường tiêu hóa do vi khuẩn hoặc vi rút,
  đặc trưng bởi tiêu chảy phân lỏng nhiều lần, đau bụng quặn, buồn nôn, nôn và sốt.
relations:
- symptom_code: diarrhea_watery
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: abdominal_cramps
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: nausea_vomiting
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: recent_contaminated_food
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: nhiem_trung_tieu_hoa_cap_chan_doan
  title: Chẩn đoán lâm sàng Nhiễm trùng tiêu hóa cấp
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Tiêu chảy cấp nhiễm trùng
---

## excerpt: nhiem_trung_tieu_hoa_cap_chan_doan
- Khởi phát cấp tính với tiêu chảy phân lỏng hoặc nhiều nước từ 3 lần/ngày trở lên, kèm đau bụng quặn quanh rốn, buồn nôn, nôn và sốt.
- Luôn phải đánh giá mức độ mất nước (môi khô, mắt trũng, khát nước, mạch nhanh, tiểu ít) để phân tầng xử trí bù dịch kịp thời.
