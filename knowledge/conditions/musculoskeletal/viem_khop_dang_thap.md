---
schema: okf_condition_v1
condition_code: viem_khop_dang_thap
name_vi: Bệnh viêm khớp dạng thấp
name_en: Rheumatoid arthritis
icd10_code: M05.9
disease_group: musculoskeletal
description: Bệnh lý tự miễn mạn tính diễn biến phức tạp với biểu hiện viêm màng hoạt
  dịch đa khớp ngoại biên đối xứng, cứng khớp buổi sáng trên 1 giờ và nguy cơ gây
  biến dạng khớp.
relations:
- symptom_code: morning_stiffness_over_1h
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: symmetric_polyarthritis
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.55
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: morning_stiffness_under_30m
  polarity: CONTRADICTS
  weight: 0.55
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: viem_khop_dang_thap_chan_doan
  title: Tiêu chuẩn chẩn đoán Viêm khớp dạng thấp (ACR 1987 & ACR/EULAR 2010)
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục 3.1 & 3.2 - Bệnh viêm khớp dạng thấp (Quyết định số 361/QĐ-BYT,
    trang 11-12)
---

## excerpt: viem_khop_dang_thap_chan_doan
- Cứng khớp buổi sáng kéo dài trên 1 giờ.
- Viêm sưng phần mềm hoặc tràn dịch tối thiểu 3 trong 14 nhóm khớp, có viêm các khớp ở bàn tay (cổ tay, bàn ngón, ngón gần) và có tính chất đối xứng hai bên kéo dài >= 6 tuần.
