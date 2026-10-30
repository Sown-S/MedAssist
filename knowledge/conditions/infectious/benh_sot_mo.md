---
schema: okf_condition_v1
condition_code: benh_sot_mo
name_vi: Bệnh sốt mò
name_en: Bệnh sốt mò
icd10_code: A75.3
disease_group: infectious
description: Sốt mò (scrub typhus) là một bệnh truyền nhiễm cấp tính lưu hành ở Việt
  Nam. Bệnh có biểu hiện đa dạng, bao gồm sốt, vết loét ngoài da, phát ban, sưng hạch,
  tổn thương nhiều cơ quan và phủ tạng, có thể dẫn tới tử vong nếu không được điều
  trị thích.
relations:
- symptom_code: eschar_ulcer_bite_lesion
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: meningeal_neck_stiffness_kernig
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_prolonged
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.9
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: serositis_pleural_pericardial
  polarity: SUPPORTS
  weight: 0.85
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: benh_sot_mo_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh sốt mò
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_sot_mo_chan_doan
- Thời gian ủ bệnh của sốt mò kéo dài từ 6 ngày đến 21 ngày (trung bình từ 9 đến
- Sốt: thường khởi phát đột ngột; người bệnh sốt cao liên tục, có thể kèm theo rét
- run, đau đầu, đau mỏi người.
- Biểu hiện da và niêm mạc:
- Da xung huyết, có thể phù nhẹ dưới da vùng mặt và mu chân; xung huyết kết
- Vết loét ngoài da: là dấu hiệu đặc hiệu của bệnh sốt mò; vết loét có hình bầu
- không tiết dịch; các vết loét thường không đau, khu trú ở những vùng da mềm như nách,
- Ban ngoài da: ban thường xuất hiện vào cuối tuần thứ nhất của bệnh, có dạng
