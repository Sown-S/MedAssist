---
schema: okf_condition_v1
condition_code: viem_da_day_ta_trang_cap
name_vi: Viêm dạ dày - tá tràng cấp
name_en: Acute gastroduodenitis
icd10_code: K29.7
disease_group: gastrointestinal
description: Tổn thương viêm cấp tính niêm mạc dạ dày và hành tá tràng, biểu hiện
  đau vùng thượng vị liên quan bữa ăn, kèm đầy bụng, khó tiêu và buồn nôn.
relations:
- symptom_code: epigastric_burning_pain
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: bloating_dyspepsia
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: nausea_vomiting
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: heartburn_regurgitation
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.55
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: diarrhea_watery
  polarity: CONTRADICTS
  weight: 0.45
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: viem_da_day_ta_trang_cap_chan_doan
  title: Biểu hiện lâm sàng Viêm dạ dày - tá tràng cấp
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Viêm dạ dày - tá tràng
---

## excerpt: viem_da_day_ta_trang_cap_chan_doan
- Đau vùng thượng vị âm ỉ hoặc nóng rát, có tính chất chu kỳ liên quan đến bữa ăn (khi đói hoặc ngay sau ăn), kèm cảm giác đầy bụng, chướng hơi, ợ hơi và buồn nôn.
- Khám bụng mềm, ấn đau tức khu trú vùng thượng vị, không có phản ứng thành bụng.
