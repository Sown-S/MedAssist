---
schema: okf_condition_v1
condition_code: phoi_tac_nghen_man_tinh
name_vi: Phổi tắc nghẽn mạn tính
name_en: BPTNMT
icd10_code: J98.9
disease_group: respiratory
description: Phổi tắc nghẽn mạn tính là bệnh lý lâm sàng được chẩn đoán và điều trị
  theo hướng dẫn chuyên môn của Bộ Y tế.
relations:
- symptom_code: history_smoking_dust_exposure
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: cough_productive_sputum
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: dyspnea_chronic_exertional
  polarity: SUPPORTS
  weight: 0.94
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: wheezing_bronchospasm
  polarity: SUPPORTS
  weight: 0.85
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.72
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
excerpts:
- excerpt_key: phoi_tac_nghen_man_tinh_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Phổi tắc nghẽn mạn tính
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 4562/QĐ-BYT)
---

## excerpt: phoi_tac_nghen_man_tinh_chan_doan
- 1.2.2. Chẩn đoán xác định áp dụng cho cơ sở y tế đã được trang bị
- 1.3.2. Đánh giá triệu chứng và ảnh hưởng của bệnh
- 3.3.2. Các thăm dò chẩn đoán cho đợt cấp BPTNMT tại bệnh viện
- 5.4.3. Điều trị giảm nhẹ khó thở
- Bảng 5.3. Phác đồ điều trị khó thở bằng Morphin ở bệnh nhân BPTNMT
- Biểu đồ 3.1. Hướng dẫn xử trí ban đầu đợt cấp BPTNMT&HPQ………………..…… 34
- Biểu đồ 3.2. Hướng dẫn dùng kháng sinh cho đợt cấp BPTNMT mức độ trung bình ... 36
- Biểu đồ 3.3. Điều trị kháng sinh cho bệnh nhân đợt cấp BPTNMT nhập viện .............. 38
