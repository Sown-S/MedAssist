---
schema: okf_condition_v1
condition_code: benh_sot_ret_khang_thuoc
name_vi: Bệnh sốt rét kháng thuốc
name_en: Bệnh sốt rét kháng thuốc
icd10_code: B50.9
disease_group: infectious
description: Sốt rét kháng thuốc (Resistance malaria - theo định nghĩa của WHO 2011
  - Global plan for Artemisinin resistance containment - GPARC) là khả năng một chủng
  ký sinh trùng sốt rét vẫn tồn tại và/hoặc nhân lên khi sử dụng thuốc sốt rét đủ
  liều hoặc.
relations:
- symptom_code: fever_prolonged
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.85
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: benh_sot_ret_khang_thuoc_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh sốt rét kháng thuốc
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_sot_ret_khang_thuoc_chan_doan
- Có triệu chứng điển hình của cơn sốt rét với 3 giai đoạn: rét run, sốt nóng và ra
- Hoặc có triệu chứng không điển hình của cơn sốt rét: sốt không thành cơn (người
- bệnh thấy ớn lạnh, gai rét, nhiệt độ nách 37,50C) hoặc sốt cao liên tục, sốt dao động.
- Đang ở hoặc qua lại vùng sốt rét lưu hành, có tiền sử mắc sốt rét trong 2 năm gần đây.
- b. Các dấu hiệu nguy hiểm dự báo sốt rét nặng
- Rối loạn ý thức nhẹ, thoáng qua (li bì, cuồng sảng, vật vã ...).
- Sốt cao liên tục.
- Rối loạn tiêu hóa: nôn, tiêu chảy nhiều lần trong ngày, đau bụng cấp.
