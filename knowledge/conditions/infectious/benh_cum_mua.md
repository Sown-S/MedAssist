---
schema: okf_condition_v1
condition_code: benh_cum_mua
name_vi: Bệnh cúm mùa
name_en: Bệnh cúm mùa
icd10_code: J11.0
disease_group: infectious
description: Cúm mùa là một bệnh nhiễm trùng hô hấp cấp tính do virus cúm gây nên.
  Bệnh xảy ra hàng năm, thường vào mùa đông xuân. Bệnh lây nhiễm trực tiếp từ người
  bệnh sang người lành thông qua các giọt bắn nhỏ khi nói chuyện, khi ho, hắt hơi.
  Tại Việt.
relations:
- symptom_code: genital_ulcer_chancre_discharge
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: allergic_sneezing_nasal_itch
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: nasal_obstruction_stuffiness
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: rhinorrhea_nasal_congestion
  polarity: SUPPORTS
  weight: 0.86
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: sore_throat_dysphagia
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: benh_cum_mua_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh cúm mùa
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_cum_mua_chan_doan
- Sốt (thường trên 380C), đau nhức cơ toàn thân và có một trong số các biểu hiện
- về hô hấp như đau họng, hắt hơi, ngạt mũi, chảy nước mũi, ho, khó thở.
- Hình ảnh chụp XQ phổi bình thường hoặc có tổn thương thâm nhiễm lan tỏa
- Có yếu tố dịch tễ: sống hoặc đến từ khu vực có bệnh cúm lưu hành hoặc có tiếp
- Lâm sàng: có các triệu chứng như nêu trên.
- Xét nghiệm dương tính với virus cúm bằng kỹ thuật RT-PCR hoặc real time
- Có tổn thương ở phổi với biểu hiện suy hô hấp trên lâm sàng (thở nhanh, khó
- Có các biến chứng thứ phát như viêm xoang, viêm phổi do bội nhiễm vi khuẩn,
