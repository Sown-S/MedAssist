---
schema: okf_condition_v1
condition_code: nhiem_chlamydia_trachomatis_sinh_duc_tiet_nieu
name_vi: Nhiễm chlamydia trachomatis sinh dục-tiết niệu
name_en: Chlamydia trachomatis infections
icd10_code: A56.2
disease_group: dermatology
description: 'Chlamydia là tác nhân gây mù loà và bệnh lây truyền qua đường tình dục
  (LTQĐTD). Có ba biến thể sinh học khác nhau của Chlamydia: Biến thể trachoma-serovars
  A, B và C gây bệnh mắt hột.'
relations:
- symptom_code: genital_ulcer_chancre_discharge
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.82
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.82
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
excerpts:
- excerpt_key: nhiem_chlamydia_trachomatis_sinh_duc_tiet_nieu_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Nhiễm chlamydia trachomatis sinh dục-tiết niệu
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 75/QĐ-BYT)
---

## excerpt: nhiem_chlamydia_trachomatis_sinh_duc_tiet_nieu_chan_doan
- Nhiễm C. trachomatis ở nam: biểu hiện chủ yếu là viêm niệu đạo.
- Viêm niệu đạo:
- . Ở những người bệnh bị viêm niệu đạo không do lậu có khoảng 35-50% là
- do C. trachomatis. Triệu chứng là đi tiểu khó (đái buốt, đái rắt, đau khi đi tiểu) và
- . Khám thấy miệng sáo đỏ, viêm nề, không thấy các bệnh lý khác như sưng
- hạch bẹn, các ổ đau trong niệu đạo, các thương tổn bệnh herpes ở miệng sáo và
- 50% không biểu hiện triệu chứng, khi xét nghiệm dịch niệu đạo bằng nhuộm Gram
- Chú ý là viêm niệu đạo sau lậu không do lậu thường do C. trachomatis.
