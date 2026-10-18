---
schema: okf_condition_v1
condition_code: viem_mui_hong_cap
name_vi: Viêm mũi họng cấp (Cảm lạnh)
name_en: Acute nasopharyngitis
icd10_code: J00
disease_group: respiratory
description: Nhiễm trùng cấp tính đường hô hấp trên do vi rút gây ra, thường biểu
  hiện sốt nhẹ, hắt hơi, chảy nước mũi trong, nghẹt mũi, đau rát họng và tự giới hạn
  sau 5 đến 7 ngày.
relations:
- symptom_code: rhinorrhea_clear
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: nasal_congestion
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: sore_throat
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.45
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: pleuritic_chest_pain
  polarity: CONTRADICTS
  weight: 0.6
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: viem_mui_hong_cap_chan_doan
  title: Chẩn đoán lâm sàng Viêm mũi họng cấp
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Viêm mũi họng cấp
---

## excerpt: viem_mui_hong_cap_chan_doan
- Khởi phát cấp tính với cảm giác khô nóng rát họng, hắt hơi, chảy nước mũi trong và nghẹt mũi.
- Có thể kèm sốt nhẹ, ho khan và mệt mỏi nhẹ toàn thân.
- Khám họng thấy niêm mạc mũi họng đỏ xung huyết, không có giả mạc hay mủ ở amidan, phổi thông khí bình thường.
