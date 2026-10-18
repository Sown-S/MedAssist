---
schema: okf_condition_v1
condition_code: sot_xuat_huyet_dengue
name_vi: Sốt xuất huyết Dengue
name_en: Dengue fever
icd10_code: A97.0
disease_group: infectious
description: Bệnh truyền nhiễm cấp tính do vi rút Dengue lây truyền qua muỗi Aedes,
  đặc trưng bởi sốt cao đột ngột liên tục 2 đến 7 ngày, đau đầu, đau hốc mắt, đau
  mỏi cơ khớp và xuất huyết.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: retro_orbital_pain
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: petechiae_mucosal_bleeding
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: nausea_vomiting
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: rhinorrhea_clear
  polarity: CONTRADICTS
  weight: 0.5
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: sot_xuat_huyet_dengue_chan_doan
  title: Chẩn đoán lâm sàng Sốt xuất huyết Dengue
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Sốt xuất huyết Dengue
---

## excerpt: sot_xuat_huyet_dengue_chan_doan
- Sốt cao đột ngột, liên tục từ 2 đến 7 ngày kèm xung huyết da, đau nhức hai hốc mắt, đau đầu, đau mỏi cơ khớp toàn thân, nghiệm pháp dây thắt dương tính hoặc có chấm xuất huyết dưới da, chảy máu chân răng.
- Theo dõi sát từ ngày thứ 3 đến ngày thứ 7 để phát hiện sớm các dấu hiệu cảnh báo sốc.
