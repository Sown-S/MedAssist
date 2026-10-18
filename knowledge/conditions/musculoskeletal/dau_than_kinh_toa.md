---
schema: okf_condition_v1
condition_code: dau_than_kinh_toa
name_vi: Đau thần kinh tọa
name_en: Sciatica
icd10_code: M54.3
disease_group: musculoskeletal
description: Hội chứng đau dọc theo đường đi của dây thần kinh tọa từ cột sống thắt
  lưng lan xuống mặt ngoài đùi, cẳng chân tới các ngón chân, thường do thoát vị đĩa
  đệm L4-L5 hoặc L5-S1.
relations:
- symptom_code: sciatica_radicular_pain
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: mechanical_spinal_pain
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: morning_stiffness_under_30m
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: inflammatory_low_back_pain
  polarity: CONTRADICTS
  weight: 0.55
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.75
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: dau_than_kinh_toa_chan_doan
  title: Chẩn đoán lâm sàng Đau thần kinh tọa
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục 3.1.1 - Đau thần kinh tọa (Quyết định số 361/QĐ-BYT, trang 140-141)
---

## excerpt: dau_than_kinh_toa_chan_doan
- Đau dọc đường đi của dây thần kinh tọa từ cột sống thắt lưng lan xuống mông, đùi, cẳng chân tới ngón chân cái (rễ L5) hoặc ngón út (rễ S1), tăng khi đi lại, ho, rặn, hắt hơi và giảm khi nằm nghỉ.
- Khám thấy hệ thống điểm đau Valleix, dấu chuông bấm dương tính và nghiệm pháp Lasègue dương tính.
