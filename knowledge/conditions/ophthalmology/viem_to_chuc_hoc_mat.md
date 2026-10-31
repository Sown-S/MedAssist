---
schema: okf_condition_v1
condition_code: viem_to_chuc_hoc_mat
name_vi: Viêm tổ chức hốc mắt
name_en: Viêm tổ chức hốc mắt
icd10_code: H05.0
disease_group: ophthalmology
description: Viêm tổ chức hốc mắt là viêm của phần mô mềm trong hốc mắt. Viêm tổ chức
  hốc mắt gặp ở cả trẻ em và người lớn. Ở trẻ em dưới 5 tuổi thì hay phối hợp với
  viêm đường hô hấp trên. Ở trẻ em trên 5 tuổi hay phối hợp với viêm xoang. Ở.
relations:
- symptom_code: diplopia_strabismus_proptosis
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
- symptom_code: visual_acuity_decreased_blur
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: skin_cellulitis_pus_abscess
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
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
- excerpt_key: viem_to_chuc_hoc_mat_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Viêm tổ chức hốc mắt
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 40/QĐ-BYT)
---

## excerpt: viem_to_chuc_hoc_mat_chan_doan
- Xuất hiện đau đột ngột, đau ở vùng hốc mắt
- Đau khi vận động nhãn cầu, liếc mắt…
- Xung huyết kết mạc
- Phù kết mạc
- Lồi mắt: lồi mắt có thể lồi thẳng trục hoặc không thẳng trục
- Hạn chế vận nhãn hoặc liệt vận nhãn
- Giảm thị lực nhiều mức độ khác nhau
- Nếu viêm gần đỉnh hốc mắt có thể có giảm thị lực trầm trọng
