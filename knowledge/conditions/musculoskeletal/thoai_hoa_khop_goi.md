---
schema: okf_condition_v1
condition_code: thoai_hoa_khop_goi
name_vi: Thoái hóa khớp gối
name_en: Knee osteoarthritis
icd10_code: M17.9
disease_group: musculoskeletal
description: Tổn thương thoái hóa mạn tính mất cân bằng giữa tổng hợp và hủy hoại
  của sụn khớp và xương dưới sụn tại khớp gối, gây đau khớp kiểu cơ học và hạn chế
  vận động.
relations:
- symptom_code: knee_crepitus_mechanical_pain
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: morning_stiffness_under_30m
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: morning_stiffness_over_1h
  polarity: CONTRADICTS
  weight: 0.65
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.8
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: thoai_hoa_khop_goi_chan_doan
  title: Tiêu chuẩn ACR 1991 chẩn đoán Thoái hóa khớp gối
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục 3.1 - Chẩn đoán và điều trị thoái hóa khớp gối (Quyết định số
    361/QĐ-BYT, trang 124)
---

## excerpt: thoai_hoa_khop_goi_chan_doan
- Đau khớp gối có tính chất cơ học (tăng khi đi lại, lên xuống cầu thang, giảm khi nghỉ ngơi).
- Cứng khớp buổi sáng kéo dài dưới 30 phút (dấu hiệu phá rỉ khớp), có tiếng lục khục khi cử động khớp gối, tuổi thường trên 38 và có gai xương ở rìa khớp trên phim X-quang.
