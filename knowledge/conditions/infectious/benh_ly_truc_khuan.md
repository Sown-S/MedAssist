---
schema: okf_condition_v1
condition_code: benh_ly_truc_khuan
name_vi: Bệnh lỵ trực khuẩn
name_en: Bệnh lỵ trực khuẩn
icd10_code: A03.9
disease_group: infectious
description: Bệnh do Shigella là tình trạng viêm nhiễm cấp tính ở đường tiêu hóa do
  trực khuẩn Shigella gây nên với hội chứng lỵ điển hình là đau quặn bụng, mót rặn
  và đi ngoài phân lỏng như nước rửa thịt.
relations:
- symptom_code: dysentery_tenesmus_bloody_stool
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.86
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: benh_ly_truc_khuan_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh lỵ trực khuẩn
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_ly_truc_khuan_chan_doan
- Thường kéo dài 12 - 72 giờ (trung bình 1 - 5 ngày), không có biểu hiện lâm sàng.
- b. Thời kỳ khởi phát
- Khởi phát đột ngột với các triệu chứng:
- Hội chứng nhiễm trùng: sốt cao 39 - 40C, thường kèm theo ớn lạnh, đau nhức
- cơ toàn thân, mệt mỏi, chán ăn, buồn nôn hoặc nôn, trẻ nhỏ có thể bị co giật do sốt cao.
- Triệu chứng tiêu hóa: tiêu chảy phân lỏng, toàn nước, kèm theo đau bụng.
- Thời kỳ này kéo dài 1 đến 3 ngày.
- Đau bụng quặn từng cơn. Thể trạng suy sụp nhanh chóng, người mệt mỏi, hốc
