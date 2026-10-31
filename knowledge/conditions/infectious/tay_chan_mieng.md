---
schema: okf_condition_v1
condition_code: tay_chan_mieng
name_vi: Tay chân miệng
name_en: Tay chân miệng
icd10_code: B08.4
disease_group: infectious
description: Bệnh tay chân miệng là bệnh truyền nhiễm do vi rút đường ruột gây ra,
  lây từ người sang người chủ yếu theo đường tiêu hóa, dễ gây thành dịch. Bệnh xảy
  ra quanh năm và gặp ở mọi lứa tuổi nhưng thường gặp ở trẻ dưới 5 tuổi.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_qd_292_2024
  source_edition: Quyết định số 292/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.7
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
- Bệnh tay chân miệng là bệnh truyền nhiễm do vi rút đường ruột gây ra, lây từ người sang người chủ yếu theo đường tiêu hóa, dễ gây thành dịch. Bệnh xảy ra quanh năm và gặp ở mọi lứa tuổi nhưng thường gặp ở trẻ dưới 5 tuổi.
