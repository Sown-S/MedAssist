---
schema: okf_condition_v1
condition_code: nhiem_khuan_da_va_mo_mem
name_vi: Nhiễm khuẩn da và mô mềm
name_en: Nhiễm khuẩn da và mô mềm
icd10_code: L08.9
disease_group: musculoskeletal
description: Nhiễm trùng da và mô mềm là tình trạng viêm cấp tính của da và mô mềm
  thường do các vi khuẩn ký sinh trên da như tụ cầu, liên cầu,… gây ra khi có các
  yếu tố thuận lợi với các đặc điểm sưng nóng đỏ đau vùng da và phần mềm bị tổn thương.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.72
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.77
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: vesicular_blister_rash
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: skin_cellulitis_pus_abscess
  polarity: SUPPORTS
  weight: 0.94
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: nhiem_khuan_da_va_mo_mem_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Nhiễm khuẩn da và mô mềm
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
---

## excerpt: nhiem_khuan_da_va_mo_mem_chan_doan
- Nhiễm trùng da và mô mềm là tình trạng viêm cấp tính của da và mô mềm
- thuận lợi với các đặc điểm sưng nóng đỏ đau vùng da và phần mềm bị tổn thương.
- Phân loại theo Hiệp hội bệnh truyền nhiễm Hoa Kỳ (IDSA) gồm năm loại:
- Nhiễm trùng bề mặt da.
- Nhiễm trùng đơn giản: chốc, viêm quầng, viêm mô tế bào.
- Nhiễm trùng hoại tử.
- Nhiễm trùng liên quan đến vết cắn của thú vật.
- Nhiễm trùng liên quan đến phẫu thuật và suy giảm miễn dịch.
