---
schema: okf_condition_v1
condition_code: viem_mui_xoang_di_ung
name_vi: Viêm mũi xoang dị ứng
name_en: Viêm mũi xoang dị ứng
icd10_code: J30.4
disease_group: ent
description: Viêm mũi xoang dị ứng là tình trạng viêm niêm mạc mũi-xoang biểu hiện
  bằng các triệu chứng hắt hơi, ngạt, ngứa và chảy mũi, qua trung gian kháng thể và
  xảy ra do tiếp xúc với dị nguyên trong không khí.
relations:
- symptom_code: allergic_sneezing_nasal_itch
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: rhinorrhea_nasal_congestion
  polarity: SUPPORTS
  weight: 0.94
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: nasal_obstruction_stuffiness
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.85
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
excerpts:
- excerpt_key: viem_mui_xoang_di_ung_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Viêm mũi xoang dị ứng
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5643/QĐ-BYT)
---

## excerpt: viem_mui_xoang_di_ung_chan_doan
- Khai thác tiền sử dị ứng bản thân như dị ứng thuốc, mày đay, chàm, hen phế
- Khai thác tiền sử dị ứng gia đình.
- Triệu chứng cơ năng:
- Hắt hơi từng tràng
- Ngạt tắc mũi
- Chảy nước mũi trong
- Triệu chứng thực thể:
- Soi mũi thấy:
