---
schema: okf_condition_v1
condition_code: lupus_ban_do_he_thong
name_vi: Bệnh Lupus ban đỏ hệ thống
name_en: Systemic lupus erythematosus
icd10_code: M32.9
disease_group: musculoskeletal
description: Bệnh lý tự miễn của mô liên kết gây tổn thương đa cơ quan (da, niêm mạc,
  khớp, thận, máu, tim phổi, thần kinh), đặc trưng bởi kháng thể kháng nhân và nhiều
  tự kháng thể khác.
relations:
- symptom_code: malar_butterfly_rash
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: oral_nasal_ulcers
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fever_prolonged
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: symmetric_polyarthritis
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: lupus_ban_do_he_thong_chan_doan
  title: Tiêu chuẩn lâm sàng Lupus ban đỏ hệ thống (ACR 1997 & SLICC 2012)
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục 3.1 & 3.3 - Bệnh Lupus ban đỏ hệ thống (Quyết định số 361/QĐ-BYT,
    trang 18-20)
---

## excerpt: lupus_ban_do_he_thong_chan_doan
- Toàn thân: sốt dai dẳng kéo dài không rõ nguyên nhân, mệt mỏi, gầy sút.
- Da niêm mạc: ban đỏ hình cánh bướm ở mặt, nhạy cảm ánh sáng, loét niêm mạc miệng hoặc mũi họng, rụng tóc.
- Cơ xương khớp: đau hoặc viêm đa khớp tương tự viêm khớp dạng thấp nhưng hiếm khi gây biến dạng khớp.
