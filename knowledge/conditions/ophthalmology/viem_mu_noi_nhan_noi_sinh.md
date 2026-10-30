---
schema: okf_condition_v1
condition_code: viem_mu_noi_nhan_noi_sinh
name_vi: Viêm mủ nội nhãn nội sinh
name_en: Viêm mủ nội nhãn nội sinh
icd10_code: H44.0
disease_group: ophthalmology
description: Viêm mủ nội nhãn (VMNN) nội sinh là tình trạng viêm các tổ chức trong
  nhãn cầu, đặc trƣng bởi sự xâm nhập của bạch cầu đa nhân gây hoại tử mủ do các tác
  nhân gây bệnh đi đến mắt qua đƣờng máu, dẫn đến hình thành mủ trong tiền.
relations:
- symptom_code: corneal_ulcer_hypopyon_keratitis
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: retinal_vitreous_optic_disc_lesion
  polarity: SUPPORTS
  weight: 0.97
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: visual_acuity_decreased_blur
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: ocular_pain_photophobia_tearing
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.82
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
excerpts:
- excerpt_key: viem_mu_noi_nhan_noi_sinh_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Viêm mủ nội nhãn nội sinh
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 40/QĐ-BYT)
---

## excerpt: viem_mu_noi_nhan_noi_sinh_chan_doan
- Triệu chứng cơ năng
- Đau nhức mắt, đỏ mắt
- Nhìn mờ tùy mức độ, nhƣng thƣờng nhanh và nhiều
- Triệu chứng thức thể
- Phù mi, cảm giác thể mi (+)
- Mắt kích thích, kèm cƣơng tụ kết mạc, cƣơng tụ rìa
- Phù giác mạc, có thể có tủa sau giác mạc
- Xuất tiết ở diện đồng tử, dính bờ đồng tử
