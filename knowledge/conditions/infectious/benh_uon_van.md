---
schema: okf_condition_v1
condition_code: benh_uon_van
name_vi: Bệnh uốn ván
name_en: Tetanus
icd10_code: A35
disease_group: infectious
description: Uốn ván là một bệnh cấp tính nặng, có khả năng gây tử vong do độc tố
  của vi khuẩn uốn ván (Clostridium tetani) gây ra đặc trưng bởi các cơn co giật trên
  nền tăng trương lực cơ. Ở các nước phát triển, tỷ lệ mắc uốn ván hàng năm là 0,1
  - 0,2 trường hợp/1 triệu dân với tỷ lệ tử vong là 13,2%. Ở các nước đang phát triển,
  có khoảng 1 triệu trường hợp uốn ván mỗi năm với 300 nghìn đến 500 nghìn ca tử vong.
relations:
- symptom_code: trismus_tetanic_spasm
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: encephalopathy_delirium_convulsion
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: cough_productive_sputum
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: cyanosis_hypoxemia_central_peripheral
  polarity: SUPPORTS
  weight: 0.91
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: sore_throat_dysphagia
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.74
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: sweating_profuse
  polarity: SUPPORTS
  weight: 0.72
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: benh_uon_van_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh uốn ván
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_uon_van_chan_doan
- Chẩn đoán uốn ván chủ yếu dựa trên các biểu hiện lâm sàng bao gồm:
- Khít hàm: tăng dần và tăng lên khi kích thích, là dấu hiệu sớm nhất và gặp ở
- Co cứng cơ toàn thân, liên tục, đau: co cứng các cơ theo trình tự mặt, gáy, cổ,
- Cơn co giật toàn thân: xuất hiện trên nền co cứng cơ. Cơn giật tăng lên khi kích
- Có thể có cơn thắt hầu họng - thanh quản
- đ. Thường có vết thương trước khi xuất hiện triệu chứng uốn ván
- Người bệnh không có chủng ngừa hay chủng ngừa không đầy đủ đối với bệnh uốn ván
- Lâm sàng
- Thời kỳ ủ bệnh
- Tính từ khi có vết thương đến khi xuất hiện triệu chứng đầu tiên của bệnh uốn ván,
- Thời kỳ khởi phát
- Tính từ lúc cứng hàm đến khi có cơn co giật đầu tiên hoặc cơn co thắt hầu họng -
- thanh quản đầu tiên, thường từ 1-7 ngày. Thời gian khởi phát càng ngắn (< 48 giờ) bệnh
- Triệu chứng khởi đầu là cứng hàm: lúc đầu mỏi hàm, nói khó, nuốt vướng, khó
- ắn chặt hơn (dấu hiệu trismus). Dấu hiệu này gặp ở tất cả các người bệnh.
- Co cứng các cơ mặt làm cho người bệnh có “Vẻ mặt uốn ván” hay “Vẻ mặt
- ơ gáy làm cho cổ bị cứng và ngửa dần, 2 cơ ức đòn chũm nổi rõ.
- Co cứng cơ lưng làm cho tư thế người bệnh uốn cong hay ưỡn thẳng lưng. Co
- ứng cơ bụng làm cho 2 cơ thẳng trước gồ lên và sờ vào bụng thấy cứng.
- Co cứng cơ ngực, cơ liên sườn làm cho lồng ngực hạn chế di động.
