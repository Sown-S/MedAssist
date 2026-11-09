---
schema: okf_condition_v1
condition_code: phoi_tac_nghen_man_tinh
name_vi: Phổi tắc nghẽn mạn tính
name_en: Chronic obstructive pulmonary disease
icd10_code: J44.9
disease_group: respiratory
description: Bệnh phổi tắc nghẽn mạn tính (BPTNMT) là bệnh hô hấp phổ biến có thể phòng và điều trị. Bệnh
  đặc trưng bởi các triệu chứng hô hấp dai dẳng và giới hạn luồng khí, là hậu quả của những bất thường
  của đường thở và/hoặc phế nang thường do phơi nhiễm với các phân tử hoặc khí độc hại, trong đó khói
  thuốc lá, thuốc lào là yếu tố nguy cơ chính, ô nhiễm không khí và khói chất đốt cũng là yếu tố nguy
  cơ quan trọng gây BPTNMT.
relations:
- symptom_code: cough_productive_sputum
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: dyspnea_chronic_exertional
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: fixed_postbronchodilator_fev1_fvc_under_70
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: wheezing_bronchospasm
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: history_smoking_dust_exposure
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: copd_barrel_chest_pursed_lip_breathing
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: copd_acute_exacerbation_sputum_purulence
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: tachypnea_accessory_muscle_retractions
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: pulmonary_crackles_rales_consolidation
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: decreased_breath_sounds_hyperresonance
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: chronic_cor_pulmonale_edema_jugular_vein
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: cyanosis_hypoxemia_central_peripheral
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: chest_tightness_pleuritic_pain
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: recurrent_lower_respiratory_infections
  polarity: SUPPORTS
  weight: 0.6
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
- Chẩn đoán xác định áp dụng cho cơ sở y tế đã được trang bị máy đo CNTK
- Những bệnh nhân có tiền sử tiếp xúc với các yếu tố nguy cơ, có các dấu hiệu lâm
- Đo chức năng thông khí phổi: kết qủa đo CNTK phổi là tiêu chuẩn vàng để
- Một số điểm cần lưu ý:
- Cần trang bị máy đo CNTK đảm bảo đủ tiêu chuẩn (xem phụ lục về tiêu chuẩn
- Kỹ thuật viên cần được đào tạo về đo CNTK và biết cách làm test hồi phục phế quản.
- Bệnh nhân cần phải ngừng thuốc giãn phế quản trước khi đo chức năng hô hấp
- Nhận định kết quả:
- Chẩn đoán xác định khi: rối loạn thông khí tắc nghẽn không hồi phục hoàn
- Thông thường bệnh nhân BPTNMT sẽ có kết quả test HPPQ âm tính (chỉ số
- Nếu bệnh nhân thuộc kiểu hình chồng lấp hen và BPTNMT có thể có test
- Dựa vào chỉ số FEV1 giúp đánh giá mức độ tắc nghẽn đường thở (xem mục 1.3).
- X-quang phổi:
- BPTNMT ở giai đoạn sớm hoặc không có khí phế thũng, hình ảnh X-quang
- Giai đoạn muộn có hội chứng phế quản hoặc hình ảnh khí phế thũng: trường
- X-quang phổi giúp phát hiện một số bệnh phổi đồng mắc hoặc biến chứng của
- CLVT ngực lớp mỏng 1mm độ phân giải cao (HRCT):
- Giúp phát hiện tình trạng giãn phế nang, bóng kén khí, phát hiện sớm ung thư
- Đánh giá bệnh nhân trước khi chỉ định can thiệp giảm thể tích phổi bằng phẫu
- Điện tâm đồ: ở giai đoạn muộn có thể thấy các dấu hiệu của tăng áp động
