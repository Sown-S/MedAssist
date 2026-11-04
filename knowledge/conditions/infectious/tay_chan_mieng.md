---
schema: okf_condition_v1
condition_code: tay_chan_mieng
name_vi: Tay chân miệng
name_en: Hand, foot and mouth disease
icd10_code: B08.4
disease_group: infectious
description: Bệnh tay chân miệng là bệnh truyền nhiễm do vi rút đường ruột gây ra,
  lây từ người sang người chủ yếu theo đường tiêu hóa, dễ gây thành dịch. Bệnh xảy
  ra quanh năm và gặp ở mọi lứa tuổi nhưng thường gặp ở trẻ dưới 5 tuổi. Tác nhân
  gây bệnh thường gặp là Coxsackie virus A6, A10, A16 và Enterovirus 71 (EV71).
relations:
- symptom_code: hfmd_palmoplantar_vesicles_herpangina
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
- symptom_code: sepsis_sirs_organ_dysfunction_hypoperfusion
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
- symptom_code: oral_mucosal_ulcers
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
- symptom_code: epidemiological_exposure_vector_travel
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
excerpts:
- excerpt_key: tay_chan_mieng_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Tay chân miệng
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 292/QĐ-BYT)
---

## excerpt: tay_chan_mieng_chan_doan
- Triệu chứng lâm sàng
- Các thể lâm sàng
- Biến chứng
- Phân độ lâm sàng
