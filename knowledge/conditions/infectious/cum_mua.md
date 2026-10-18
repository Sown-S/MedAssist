---
schema: okf_condition_v1
condition_code: cum_mua
name_vi: Cúm mùa
name_en: Seasonal influenza
icd10_code: J11.1
disease_group: infectious
description: Bệnh nhiễm trùng hô hấp cấp tính do các chủng vi rút cúm đang lưu hành
  (A/H1N1, A/H3N2, B) gây ra, khởi phát đột ngột với sốt cao, đau mỏi cơ toàn thân
  và triệu chứng hô hấp.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: sore_throat
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: nasal_congestion
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
excerpts:
- excerpt_key: cum_mua_chan_doan
  title: Bệnh cảnh lâm sàng và phân độ Cúm mùa (1840/QĐ-BYT)
  source_key: moh_cum_mua_2025
  source_edition: Quyết định số 1840/QĐ-BYT
  source_locator: Mục II.1 & II.2.3 - Chẩn đoán cúm mùa (Quyết định số 1840/QĐ-BYT)
---

## excerpt: cum_mua_chan_doan
- Thời gian ủ bệnh từ 1 đến 4 ngày, khởi phát đột ngột với sốt, ớn lạnh, đau đầu, đau cơ, mệt mỏi kèm ho khan, đau họng, nghẹt mũi hoặc chảy nước mũi.
- Ở trẻ em có thể gặp buồn nôn, nôn hoặc tiêu chảy.
- Biểu hiện cúm nặng: đau tức ngực, khó thở tăng dần, thở nhanh, thở gắng sức, SpO2 <= 95% hoặc rối loạn tri giác.
