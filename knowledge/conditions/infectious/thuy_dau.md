---
schema: okf_condition_v1
condition_code: thuy_dau
name_vi: Bệnh thủy đậu
name_en: Varicella (Chickenpox)
icd10_code: B01.9
disease_group: infectious
description: Bệnh truyền nhiễm cấp tính do vi rút Varicella-Zoster gây ra, biểu hiện
  sốt nhẹ, mệt mỏi và phát ban mụn nước nhiều lứa tuổi mọc rải rác toàn thân gây ngứa.
relations:
- symptom_code: vesicular_rash_pruritic
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.55
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: thuy_dau_chan_doan
  title: Đặc điểm lâm sàng Bệnh thủy đậu
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Thủy đậu
---

## excerpt: thuy_dau_chan_doan
- Khởi phát với sốt nhẹ, mệt mỏi, đau đầu, sau 24-48 giờ xuất hiện các nốt hồng ban tiến triển nhanh thành mụn nước dịch trong, mọc nhiều đợt nên trên cùng một vùng da có nhiều lứa tuổi tổn thương (dát đỏ, mụn nước trong, mụn đục, vảy tiết) kèm ngứa.
