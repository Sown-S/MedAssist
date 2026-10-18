---
schema: okf_condition_v1
condition_code: hoi_chung_ruot_kich_thich
name_vi: Hội chứng ruột kích thích (IBS)
name_en: Irritable bowel syndrome
icd10_code: K58.9
disease_group: gastrointestinal
description: Rối loạn chức năng đường tiêu hóa mạn tính lành tính, biểu hiện đau bụng
  tái diễn liên quan đến đại tiện kèm thay đổi tần suất và hình dạng phân mà không
  có tổn thương thực thể.
relations:
- symptom_code: pain_relieved_by_defecation
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: abdominal_cramps
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: bloating_dyspepsia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: diarrhea_watery
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.75
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: CONTRADICTS
  weight: 0.7
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: hoi_chung_ruot_kich_thich_chan_doan
  title: Tiêu chuẩn Rome IV chẩn đoán Hội chứng ruột kích thích
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Hội chứng ruột kích thích
---

## excerpt: hoi_chung_ruot_kich_thich_chan_doan
- Đau bụng tái diễn trung bình ít nhất 1 ngày/tuần trong 3 tháng gần đây, kèm tối thiểu 2 trong 3 đặc điểm: liên quan đến đi đại tiện, thay đổi số lần đại tiện, hoặc thay đổi hình dạng/tính chất phân.
- Không có các dấu hiệu báo động thực thể như sốt, sút cân không rõ nguyên nhân hoặc đại tiện ra máu.
