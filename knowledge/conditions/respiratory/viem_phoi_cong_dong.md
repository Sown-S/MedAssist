---
schema: okf_condition_v1
condition_code: viem_phoi_cong_dong
name_vi: Viêm phổi mắc phải cộng đồng
name_en: Community-acquired pneumonia
icd10_code: J18.9
disease_group: respiratory
description: Nhiễm trùng cấp tính nhu mô phổi mắc phải ngoài bệnh viện, biểu hiện
  sốt cao, rét run, ho khạc đờm mủ, đau ngực kiểu màng phổi và khó thở.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: cough_productive
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: sputum_purulent
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: pleuritic_chest_pain
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: dyspnea_exertional
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: wheezing
  polarity: SUPPORTS
  weight: 0.55
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: rhinorrhea_clear
  polarity: CONTRADICTS
  weight: 0.35
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: viem_phoi_cong_dong_chan_doan
  title: Chẩn đoán lâm sàng Viêm phổi cộng đồng
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Viêm phổi cộng đồng
---

## excerpt: viem_phoi_cong_dong_chan_doan
- Triệu chứng cơ năng cấp tính: sốt cao, ớn lạnh rét run, ho khạc đờm đục màu vàng hoặc xanh, đau ngực kiểu màng phổi (tăng khi hít sâu hoặc ho) và khó thở, nhịp thở nhanh.
- Khám phổi có hội chứng đông đặc hoặc nghe thấy ran ẩm, ran nổ khu trú tại vùng phổi tổn thương.
