---
schema: okf_condition_v1
condition_code: nhan_viem_dong_cam
name_vi: Nhãn viêm đồng cảm
name_en: Nhãn viêm đồng cảm
icd10_code: H44.2
disease_group: ophthalmology
description: Nhãn viêm đồng cảm (NVĐC) là tình trạng viêm màng bồ đào u hạt của cả
  hai mắt, xảy ra sau khi một mắt bị chấn thương xuyên hay phẫu thuật nội nhãn. Mắt
  chấn thương được gọi là mắt gây đồng cảm còn mắt kia là mắt bị nhãn viêm.
relations:
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
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
excerpts:
- excerpt_key: nhan_viem_dong_cam_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Nhãn viêm đồng cảm
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 40/QĐ-BYT)
---

## excerpt: nhan_viem_dong_cam_chan_doan
- a. Chẩn đoán xác định: dựa vào các triệu chứng lâm sàng và cận lâm sàng sau
- Nhãn viêm đồng cảm có thể xuất hiện sớm hoặc muộn sau khi 1 mắt bị
- Triệu chứng cơ năng: giảm thị lực, sợ ánh sáng, chảy nước mắt, đau
- Triệu chứng thực thể chính tại mắt là các dấu hiệu của viêm màng bồ
- đào bao gồm: tủa lắng đọng mặt sau giác mạc màu trắng, dạng u hạt (mỡ cừu).
- trong bệnh saccoidose. Khám phần sau nhãn cầu cho thấy dịch kính vẩn đục hoặc
- có tế bào viêm trong dịch kính, lồng bao mạch máu võng mạc, có thể có phù gai
- dịch võng mạc. Đặc biệt, có các nốt tổn thương hắc võng mạc màu trắng vàng,
