---
schema: okf_condition_v1
condition_code: viem_xoang_cap
name_vi: Viêm mũi xoang cấp
name_en: Acute sinusitis
icd10_code: J01.9
disease_group: respiratory
description: Tình trạng viêm cấp tính niêm mạc các xoang cạnh mũi kéo dài dưới 4 tuần,
  biểu hiện nghẹt mũi, chảy dịch mũi đặc đục và đau nhức căng nặng vùng mặt hoặc trán.
relations:
- symptom_code: facial_sinus_pain
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: rhinorrhea_purulent
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
- symptom_code: headache_dull
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
- symptom_code: cough_productive
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: viem_xoang_cap_chan_doan
  title: Chẩn đoán lâm sàng Viêm mũi xoang cấp
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Viêm mũi xoang cấp
---

## excerpt: viem_xoang_cap_chan_doan
- Chẩn đoán xác định dựa vào ít nhất 2 triệu chứng chính: nghẹt tắc mũi, chảy dịch mũi đục ra trước hoặc xuống thành sau họng, đau tức nặng vùng mặt hoặc trán tăng lên khi cúi đầu về phía trước.
- Ấn đau các điểm xoang (điểm Ewing, điểm Grunwald, điểm hố nanh).
