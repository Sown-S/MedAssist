---
schema: okf_condition_v1
condition_code: viem_mang_bo_dao_sau_chan_thuong
name_vi: Viêm màng bồ đào sau chấn thương
name_en: Viêm màng bồ đào sau chấn thương
icd10_code: H20.2
disease_group: ophthalmology
description: Là phản ứng của MBĐ đáp ứng với tác nhân sau chấn thương hay nhiễm trùng.
relations:
- symptom_code: corneal_ulcer_hypopyon_keratitis
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: intraocular_pressure_glaucoma_cupping
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
- symptom_code: conjunctival_ciliary_injection_discharge
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
excerpts:
- excerpt_key: viem_mang_bo_dao_sau_chan_thuong_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Viêm màng bồ đào sau chấn thương
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 40/QĐ-BYT)
---

## excerpt: viem_mang_bo_dao_sau_chan_thuong_chan_doan
- Triệu chứng chủ quan
- Tại mắt: Người bệnh thấy các triệu chứng:
- Cảm giác ruồi bay
- Toàn thân: Đau nhức đầu, người mệt mỏi.
- Triệu chứng khách quan
- Phản ứng thể mi (+)
- Có thể có tụ máu, rách mi
- Kết mạc cương tụ phù nề: cương tụ rìa giác mạc hoặc cương tụ toàn bộ.
