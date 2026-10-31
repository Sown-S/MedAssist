---
schema: okf_condition_v1
condition_code: benh_tac_tinh_mach_vong_mac
name_vi: Bệnh tắc tĩnh mạch võng mạc
name_en: Bệnh tắc tĩnh mạch võng mạc
icd10_code: H34.8
disease_group: ophthalmology
description: Tắc tĩnh mạch võng mạc là bệnh lý mạch máu võng mạc biểu hiện sự ngừng
  trệ tuần hoàn trở về ở võng mạc, xảy ra ở thân tĩnh mạch trung tâm võng mạc ngay
  đĩa thị, sau lá sàng được gọi là tắc tĩnh mạch trung tâm võng mạc hoặc tắc ở thân.
relations:
- symptom_code: visual_acuity_decreased_blur
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: retinal_vitreous_optic_disc_lesion
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
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.82
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
excerpts:
- excerpt_key: benh_tac_tinh_mach_vong_mac_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh tắc tĩnh mạch võng mạc
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 40/QĐ-BYT)
---

## excerpt: benh_tac_tinh_mach_vong_mac_chan_doan
- Bệnh thường xảy ra ở một mắt, giảm thị lực từ ít đến nhiều, có thể chỉ
- còn đếm ngón tay nhưng không hoàn toàn mất thị lực
- Mắt bị bệnh không đau nhức, không đỏ mắt.
- Khám đáy mắt: Tắc tĩnh mạch trung tâm võng mạc có 4 dấu hiệu chính:
- Tĩnh mạch giãn to, ngoằn nghèo.
- Phù đĩa thị, phù võng mạc và có thể phù hoàng điểm.
- Xuất huyết võng mạc trải rộng từ đĩa thị ra tận ngoại vi võng mạc, có thể
- xuất huyết nông hoặc xuất huyết sâu trong võng mạc.
