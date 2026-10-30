---
schema: okf_condition_v1
condition_code: viem_mu_noi_nhan_ngoai_sinh
name_vi: Viêm mủ nội nhãn ngoại sinh
name_en: Viêm mủ nội nhãn ngoại sinh
icd10_code: H44.1
disease_group: ophthalmology
description: Viêm mủ nội nhãn đƣợc dùng trong lâm sàng để chỉ tình trạng viêm của
  các thành phần trong nhãn cầu đặc trƣng bởi sự xâm nhập của bạch cầu đa nhân trung
  tính gây hoại tử mủ do các tác nhân gây bệnh vào mắt sau chấn thƣơng mắt hoặc.
relations:
- symptom_code: corneal_ulcer_hypopyon_keratitis
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: intraocular_pressure_glaucoma_cupping
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: retinal_vitreous_optic_disc_lesion
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: visual_acuity_decreased_blur
  polarity: SUPPORTS
  weight: 0.94
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: ocular_pain_photophobia_tearing
  polarity: SUPPORTS
  weight: 0.94
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
excerpts:
- excerpt_key: viem_mu_noi_nhan_ngoai_sinh_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Viêm mủ nội nhãn ngoại sinh
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 40/QĐ-BYT)
---

## excerpt: viem_mu_noi_nhan_ngoai_sinh_chan_doan
- Thể cấp tính: bệnh thƣờng biểu hiện sau chấn thƣơng hay sau phẫu thuật
- trong tuần đầu. Các triệu chứng thƣờng rầm rộ.
- Cơ năng: phản ứng viêm biểu hiện:
- Sƣng nề mi mắt, chảy nƣớc mắt, khó mở mắt.
- Nóng: Bệnh nhân có cảm giác nóng ở mi và mắt.
- Đỏ: Mi và kết mạc đỏ rực lên.
- Đau nhức mắt, buồn nôn, có thể kèm nhức đầu.
- Nhìn mờ, sợ ánh sáng.
