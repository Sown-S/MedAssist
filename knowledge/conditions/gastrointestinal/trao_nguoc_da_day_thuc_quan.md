---
schema: okf_condition_v1
condition_code: trao_nguoc_da_day_thuc_quan
name_vi: Bệnh trào ngược dạ dày - thực quản (GERD)
name_en: Gastroesophageal reflux disease
icd10_code: K21.9
disease_group: gastrointestinal
description: Tình trạng dịch dạ dày trào ngược lên thực quản gây ra các triệu chứng
  điển hình như ợ nóng, ợ chua sau xương ức, đau thượng vị và có thể gây ho khan kéo
  dài.
relations:
- symptom_code: heartburn_regurgitation
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: epigastric_burning_pain
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: bloating_dyspepsia
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: sore_throat
  polarity: SUPPORTS
  weight: 0.55
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.6
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: diarrhea_watery
  polarity: CONTRADICTS
  weight: 0.5
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: trao_nguoc_da_day_thuc_quan_chan_doan
  title: Chẩn đoán lâm sàng Trào ngược dạ dày - thực quản
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán GERD
---

## excerpt: trao_nguoc_da_day_thuc_quan_chan_doan
- Triệu chứng điển hình là cảm giác nóng rát từ vùng thượng vị lan ngược lên sau xương ức (ợ nóng) và dịch chua trào lên cổ họng (ợ trớ), tăng lên sau khi ăn no hoặc khi cúi gập người, nằm ngửa.
- Cần loại trừ các dấu hiệu báo động như nuốt nghẹn tiến triển, nôn ra máu, đi ngoài phân đen hoặc sút cân.
