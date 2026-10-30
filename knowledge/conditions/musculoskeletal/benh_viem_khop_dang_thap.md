---
schema: okf_condition_v1
condition_code: benh_viem_khop_dang_thap
name_vi: Bệnh viêm khớp dạng thấp
name_en: Rheumatoid Arthritis
icd10_code: M05.9
disease_group: musculoskeletal
description: Viêm khớp dạng thấp (VKDT) là một bệnh lý tự miễn điển hình, diễn biến
  mạn tính với các biểu hiện tại khớp, ngoài khớp và toàn thân ở nhiều mức độ khác
  nhau. Bệnh diễn biến phức tạp, gây hậu quả nặng nề do đó cần được điều trị tích
  cực ngay từ.
relations:
- symptom_code: symmetric_polyarthritis_hands
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: morning_stiffness_over_1h
  polarity: SUPPORTS
  weight: 0.97
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: psoriatic_plaque_nail_pitting
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: bone_pain_fracture_lesion
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: serositis_pleural_pericardial
  polarity: SUPPORTS
  weight: 0.85
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: benh_viem_khop_dang_thap_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh viêm khớp dạng thấp
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
---

## excerpt: benh_viem_khop_dang_thap_chan_doan
- 3.1. Tiêu chuẩn của Hội Thấp khớp học Hoa Kỳ (ACR) 1987
- Hiện nay tiêu chuẩn này vẫn đang được áp dụng rộng rãi nhất trên thế giới và
- Việt Nam đối với thể biểu hiện nhiều khớp và thời gian diễn biến viêm khớp trên 6 tuần.
- Cứng khớp buổi sáng kéo dài trên 1 giờ.
- Viêm tối thiểu ba nhóm khớp: sưng phần mềm hay tràn dịch tối thiểu 3 trong
- Viêm các khớp ở bàn tay: sưng tối thiểu một nhóm trong số các khớp cổ tay,
- Viêm khớp đối xứng.
- Hạt dưới da.
