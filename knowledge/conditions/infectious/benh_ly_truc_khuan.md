---
schema: okf_condition_v1
condition_code: benh_ly_truc_khuan
name_vi: Bệnh lỵ trực khuẩn
name_en: Bacillary dysentery
icd10_code: A03.9
disease_group: infectious
description: Bệnh do Shigella là tình trạng viêm nhiễm cấp tính ở đường tiêu hóa do trực khuẩn Shigella
  gây nên với hội chứng lỵ điển hình là đau quặn bụng, mót rặn và đi ngoài phân lỏng như nước rửa thịt.
  Biểu hiện lâm sàng của bệnh do Shigella có thể thay đổi từ thể tiêu chảy nhẹ phân lỏng nước cho đến
  các thể nặng nề với đau bụng quặn, mót rặn, tiêu phân nhày máu, sốt và dấu hiệu nhiễm trùng nhiễm độc.
relations:
- symptom_code: dysentery_tenesmus_bloody_stool
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: watery_diarrhea
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: reduced_urine_output
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: sym_altered_consciousness
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: sym_seizures
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: intoxication_coated_tongue_dry_lips
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.3
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
- Lâm sàng
- Thời kỳ ủ bệnh
- Thường kéo dài 12 - 72 giờ (trung bình 1 - 5 ngày), không có biểu hiện lâm sàng.
- Thời kỳ khởi phát
- Khởi phát đột ngột với các triệu chứng:
- Hội chứng nhiễm trùng: sốt cao 39 - 40C, thường kèm theo ớn lạnh, đau nhức
- ơ toàn thân, mệt mỏi, chán ăn, buồn nôn hoặc nôn, trẻ nhỏ có thể bị co giật do sốt cao.
- Triệu chứng tiêu hóa: tiêu chảy phân lỏng, toàn nước, kèm theo đau bụng.
- Thời kỳ này kéo dài 1 đến 3 ngày.
- Thời kỳ toàn phát
- Đau bụng quặn từng cơn. Thể trạng suy sụp nhanh chóng, người mệt mỏi, hốc
- Mót rặn, đau vùng trực tràng, có thể dẫn đến sa trực tràng do rặn nhiều.
- Đi ngoài phân nhầy máu mũi, nhiều lần (có thể 20 - 40 lần/ngày), số lượng
- Khám bụng: đau, chướng nhất là phần dưới bên trái, vùng đại tràng sigma, có
- thể đau toàn bộ khung đại tràng.
- Thời kỳ lui bệnh và hồi phục
- Sốt giảm dần rồi hết, người đỡ mệt, cảm giác thèm ăn dần trở lại.
- Các cơn đau bụng thưa và nhẹ dần rồi hết.
- Giảm rồi hết cảm giác mót rặn.
- Số lần đi ngoài giảm dần, nhày máu mũi giảm dần rồi hết, đi ngoài phân sệt rồi
