---
schema: okf_condition_v1
condition_code: phoi_tac_nghen_man_tinh
name_vi: Phổi tắc nghẽn mạn tính
name_en: BPTNMT
icd10_code: J98.9
disease_group: respiratory
description: Bệnh phổi tắc nghẽn mạn tính (BPTNMT) là bệnh hô hấp phổ biến có thể
  phòng và điều trị được. Bệnh đặc trưng bởi các triệu chứng hô hấp dai dẳng và giới
  hạn luồng khí, là hậu quả của những bất thường của đường thở và/hoặc phế nang thường
  do phơi.
relations:
- symptom_code: cough_productive_sputum
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: dyspnea_chronic_exertional
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: wheezing_bronchospasm
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: history_smoking_dust_exposure
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.89
  is_key: true
  source_key: moh_qd_4562_2018
  source_edition: Quyết định số 4562/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.82
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
- Bệnh hay gặp ở nam giới trên 40 tuổi.
- Tiền sử: hút thuốc lá, thuốc lào (bao gồm cả hút thuốc chủ động và thụ động).
- ứng đường thở (hen phế quản hoặc viêm phế quản co thắt).
- Ho, khạc đờm kéo dài không do các bệnh phổi khác như lao phổi, giãn phế
- quản...: là triệu chứng thường gặp. Lúc đầu có thể chỉ có ho ngắt quãng, sau đó ho dai
- dẳng hoặc ho hàng ngày (ho kéo dài ít nhất 3 tháng trong 1 năm và trong 2 năm liên
- tiếp), ho khan hoặc ho có đờm, thường khạc đờm về buổi sáng. Ho đờm mủ là một
- Khó thở: tiến triển nặng dần theo thời gian, lúc đầu chỉ có khó thở khi gắng sức,
