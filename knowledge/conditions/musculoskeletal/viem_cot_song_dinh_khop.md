---
schema: okf_condition_v1
condition_code: viem_cot_song_dinh_khop
name_vi: Viêm cột sống dính khớp
name_en: Ankylosing spondylitis
icd10_code: M45
disease_group: musculoskeletal
description: Bệnh thấp viêm mạn tính đặc trưng bởi tổn thương khớp cùng chậu, cột
  sống và các khớp lớn ở chi dưới, thường kèm viêm điểm bám gân và có xu hướng gây
  dính khớp.
relations:
- symptom_code: inflammatory_low_back_pain
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: sacroiliac_buttock_pain
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: enthesitis_heel_pain
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: morning_stiffness_over_1h
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: mechanical_spinal_pain
  polarity: CONTRADICTS
  weight: 0.55
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: viem_cot_song_dinh_khop_chan_doan
  title: Tiêu chuẩn New York sửa đổi (1984) chẩn đoán Viêm cột sống dính khớp
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục 3.1 & 3.3 - Viêm cột sống dính khớp (Quyết định số 361/QĐ-BYT,
    trang 48-50)
---

## excerpt: viem_cot_song_dinh_khop_chan_doan
- Đau vùng cột sống thắt lưng kéo dài >= 3 tháng kiểu viêm (cải thiện khi luyện tập, không giảm khi nghỉ) kèm cứng cột sống.
- Đau vùng mông một hoặc hai bên do viêm khớp cùng chậu, viêm các khớp gốc chi dưới (khớp háng, khớp gối) và viêm điểm bám tận tại gân Achilles hoặc cân gan chân.
