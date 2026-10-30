---
schema: okf_condition_v1
condition_code: hen_phe_quan
name_vi: Hen phế quản
name_en: Hen phế quản
icd10_code: J45.0
disease_group: respiratory
description: 'Định nghĩa của hen nặng và hen khó điều trị được bắt đầu với khái niệm
  hen không kiểm soát. Hen không kiểm soát bao gồm một hoặc hai yếu tố sau: Kiểm soát
  triệu chứng kém.'
relations:
- symptom_code: dyspnea_chronic_exertional
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_3942_2017
  source_edition: Quyết định số 3942/QĐ-BYT
- symptom_code: cough_productive_sputum
  polarity: SUPPORTS
  weight: 0.82
  is_key: true
  source_key: moh_qd_3942_2017
  source_edition: Quyết định số 3942/QĐ-BYT
- symptom_code: wheezing_bronchospasm
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_3942_2017
  source_edition: Quyết định số 3942/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
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
- Định nghĩa của hen nặng và hen khó điều trị được bắt đầu với khái niệm hen không kiểm soát. Hen không kiểm soát bao gồm một hoặc hai yếu tố sau: Kiểm soát triệu chứng kém.
