---
schema: okf_condition_v1
condition_code: hen_phe_quan
name_vi: Hen phế quản
name_en: Hen phế quản
icd10_code: J45.0
disease_group: respiratory
description: Hen phế quản là bệnh lý lâm sàng được chẩn đoán và điều trị theo hướng
  dẫn chuyên môn của Bộ Y tế.
relations:
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_3942_2017
  source_edition: Quyết định số 3942/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_qd_3942_2017
  source_edition: Quyết định số 3942/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_qd_3942_2017
  source_edition: Quyết định số 3942/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_3942_2017
  source_edition: Quyết định số 3942/QĐ-BYT
excerpts:
- excerpt_key: hen_phe_quan_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Hen phế quản
  source_key: moh_qd_3942_2017
  source_edition: Quyết định số 3942/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 3942/QĐ-BYT)
---

## excerpt: hen_phe_quan_chan_doan
- Hen phế quản là bệnh lý lâm sàng được chẩn đoán và điều trị theo hướng dẫn chuyên môn của Bộ Y tế.
