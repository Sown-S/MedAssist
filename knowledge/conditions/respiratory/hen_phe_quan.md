---
schema: okf_condition_v1
condition_code: hen_phe_quan
name_vi: Hen phế quản
name_en: Asthma
icd10_code: J45.9
disease_group: respiratory
description: Hen phế quản (HPQ) là một bệnh có đặc điểm là viêm mạn tính niêm mạc
  phế quản làm tăng phản ứng của phế quản thường xuyên với nhiều tác nhân kích thích,
  dẫn đến co thắt lan toả cơ trơn phế quản. Sự co thắt phế quản không cố định, thường
  có thể hồi phục tự nhiên hoặc sau khi dùng thuốc giãn phế quản. Trên lâm sàng, HPQ
  biểu hiện với các triệu chứng như thở khò khè, khó thở, nặng ngực và ho.
relations:
- symptom_code: wheezing_bronchospasm
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: nocturnal_asthma_dyspnea
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: asthma_reversible_airflow_limitation
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: asthma_atopy_trigger_allergen_exercise
  polarity: SUPPORTS
  weight: 0.97
  is_key: true
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: peak_expiratory_flow_variability
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: rhinorrhea_nasal_congestion
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: cough_productive_sputum
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: dyspnea_chronic_exertional
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: chest_tightness_pleuritic_pain
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: difficulty_speaking_phrases_orthopnea
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
- symptom_code: sweating_profuse
  polarity: SUPPORTS
  weight: 0.72
  is_key: false
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
excerpts:
- excerpt_key: hen_phe_quan_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Hen phế quản
  source_key: moh_qd_1851_2020
  source_edition: Quyết định số 1851/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 1851/QĐ-BYT)
---

## excerpt: hen_phe_quan_chan_doan
- viêm đường hô hấp mạn tính.
- (1) Bệnh sử của các triệu chứng hô hấp như thở khò khè, khó thở, tức ngực và
- (2) Giới hạn luồng khí thở ra biến đổi, được khẳng định ít nhất một lần.
- Hình 1. Lưu đồ chẩn đoán hen phế quản trên lâm sàng theo GINA (2019)
- Bệnh nhân có triệu chứng hô hấp
- Triệu chứng có điển hình cho HPQ ?
- Bệnh sử chi tiết/ Khám lâm sàng cho HPQ
- Bệnh sử/ Khám lâm sàng
- Điều trị kinh nghiệm với
- Đánh giá đáp ứng
- Thăm dò chẩn đoán
- không thấy có dấu hiệu
- Tiêu chuẩn chẩn đoán hen phế quản
- Tiền sử có các triệu chứng hô hấp thay đổi
- Các triệu chứng điển hình là thở khò khè, khó thở, nặng ngực và ho.
- Người bị hen thường có nhiều hơn một trong các triệu chứng nêu trên;
- Các triệu chứng biến đổi theo thời gian và cường độ;
- Các triệu chứng thường xảy ra hoặc nặng hơn vào ban đêm hay lúc thức giấc;
- Các triệu chứng thường khởi phát khi gắng sức, cười lớn, tiếp xúc các dị
- Các triệu chứng thường xảy ra hoặc trở nên xấu đi khi nhiễm vi rút.
