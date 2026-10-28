---
schema: okf_condition_v1
condition_code: benh_viem_khop_vay_nen
name_vi: Bệnh viêm khớp vẩy nến
name_en: Psoriatic arthritis
icd10_code: M89.9
disease_group: musculoskeletal
description: 'Viêm khớp vảy nến là tình trạng viêm khớp có liên quan với bệnh vảy
  nến. Tỷ lệ viêm khớp vảy nến chiếm 10-30% bệnh nhân bị vảy nến: 80% trường hợp có
  viêm khớp xuất hiện sau tổn thương vảy nến; 15% xuất hiện đồng thời và 10% trường
  hợp viêm khớp xuất hiện trước khi có tổn thương da.'
relations:
- symptom_code: psoriatic_plaque_nail_pitting
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.82
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: bone_pain_fracture_lesion
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: asymmetric_oligoarthritis_lower
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: enthesitis_achilles_heel
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: benh_viem_khop_vay_nen_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh viêm khớp vẩy nến
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
---

## excerpt: benh_viem_khop_vay_nen_chan_doan
- 2.1. Triệu chứng lâm sàng
- Viêm khớp:
- Thể viêm ít khớp: thường là các khớp lớn (80%)
- Thể viêm khớp ngoại biên đối xứng (25%)
- Thể viêm khớp trục (cột sống và khớp cùng chậu) (10%)
- Thể viêm các khớp liên đốt xa (10%)
- Thể viêm khớp ngoại biên biến dạng nặng (5%)
- Bệnh diễn tiến từng đợt, các dạng triệu chứng lâm sàng không cố định mà có thể
