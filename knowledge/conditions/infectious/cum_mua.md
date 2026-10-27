---
schema: okf_condition_v1
condition_code: cum_mua
name_vi: Cúm mùa
name_en: Cúm mùa
icd10_code: J11.1
disease_group: infectious
description: CHẨN ĐOÁN VÀ ĐIỀU TRỊ CÚM MÙA (Ban hành kèm theo Quyết định số 1840/QĐ-BYT
  ngày 03/06/2025) Cúm mùa (Seasonal Influenza) là một bệnh nhiễm trùng hô hấp cấp
  tính do những chủng vi rút cúm đang lưu hành (A/H1N1; A/H3N2; B) gây ra.
relations:
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.77
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: dyspnea_chronic_exertional
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: nasal_obstruction_stuffiness
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: rhinorrhea_nasal_congestion
  polarity: SUPPORTS
  weight: 0.86
  is_key: true
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
excerpts:
- excerpt_key: cum_mua_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Cúm mùa
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 1840/QĐ-BYT)
---

## excerpt: cum_mua_chan_doan
- CHẨN ĐOÁN VÀ ĐIỀU TRỊ CÚM MÙA (Ban hành kèm theo Quyết định số 1840/QĐ-BYT ngày 03/06/2025)
- Thời gian ủ bệnh thường từ 1 đến 4 ngày.
- Khởi phát thường đột ngột với sốt, ớn lạnh, đau đầu, đau cơ, mệt mỏi.
- Ho khan, đau họng, nghẹt mũi hoặc chảy nước mũi.
- Ở trẻ em có thể gặp triệu chứng buồn nôn, nôn, hoặc tiêu chảy.
- Triệu chứng có thể không điển hình ở người lớn > 65 tuổi.
- Phần lớn các người bệnh nhiễm cúm mùa chỉ sốt trong 3 đến 5 ngày, ho có thể kéo dài hơn và tự hồi phục. Tuy nhiên một số người bệnh có thể tiến triển thành cúm nặng.
- Biểu hiện viêm phổi: Đau tức ngực khó thở tăng dần. Có thể có biểu hiện tình trạng suy hô hấp cấp tiến triển nhanh, thậm chí biểu hiện sốc và suy đa cơ quan nếu không được phát hiện và điều trị kịp thời.
