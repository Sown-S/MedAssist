---
schema: okf_condition_v1
condition_code: benh_gut
name_vi: Bệnh Gút (Gout)
name_en: Gout
icd10_code: M10.9
disease_group: musculoskeletal
description: Bệnh viêm khớp do lắng đọng vi tinh thể muối urat natri trong các mô
  do tăng acid uric máu, đặc trưng bởi những đợt viêm khớp cấp tính dữ dội tái phát
  và hạt tôphi.
relations:
- symptom_code: acute_podagra_first_mtp
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: tophi_nodules
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: symmetric_polyarthritis
  polarity: CONTRADICTS
  weight: 0.5
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: morning_stiffness_over_1h
  polarity: CONTRADICTS
  weight: 0.45
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: benh_gut_chan_doan
  title: Chẩn đoán lâm sàng Bệnh Gút theo tiêu chuẩn Bennet và Wood (1968)
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục 3.1 & 3.3 - Bệnh Gút (Quyết định số 361/QĐ-BYT, trang 89-91)
---

## excerpt: benh_gut_chan_doan
- Cơn gút cấp xuất hiện đột ngột vào ban đêm (thường sau bữa ăn giàu purin hoặc uống rượu), hay gặp nhất tại khớp bàn - ngón chân cái (60-70%) với tính chất sưng to, nóng, đỏ, phù nề, căng bóng, đau dữ dội và khỏi hoàn toàn trong vòng 5-14 ngày.
- Giai đoạn mạn tính xuất hiện hạt tôphi ở vành tai, khuỷu tay, ngón chân cái và đáp ứng nhanh với Colchicin trong 48 giờ.
