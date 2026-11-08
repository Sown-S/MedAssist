---
schema: okf_condition_v1
condition_code: dau_than_kinh_toa
name_vi: Đau thần kinh tọa
name_en: Sciatica pain
icd10_code: M54.3
disease_group: musculoskeletal
description: 'Đau thần kinh tọa (sciatica pain) còn gọi là đau thần kinh hông to, biểu hiện bởi cảm giác
  đau dọc theo đường đi của thần kinh tọa: đau tại cột sống thắt lưng lan tới mặt ngoài đùi, mặt trước
  ngoài cẳng chân, mắt cá ngoài và tận ở các ngón chân. Tùy theo vị trí tổn thương mà hướng lan của đau
  có khác nhau. Thường gặp đau thần kinh tọa một bên, ở lứa tuổi lao động (30-50 tuổi).'
relations:
- symptom_code: sciatica_lasegue_positive
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: lumbar_spondylosis_paraspinal_spasm
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: radicular_sensory_motor_reflex_deficit
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: joint_range_of_motion_limitation
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: periarticular_tendon_bursa_tenderness
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: muscle_tenderness_cramps_myotonia
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: dau_than_kinh_toa_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Đau thần kinh tọa
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
---

## excerpt: dau_than_kinh_toa_chan_doan
- Lâm sàng
- Đau dọc đường đi của dây thần kinh tọa, đau tại cột sống thắt lưng lan tới mặt
- trí tổn thương mà biểu hiện trên lâm sàng có khác nhau: Tổn thương rễ L4 đau đến
- khoeo chân; tổn thương rễ L5 đau lan tới mu bàn chân tận hết ở ngón chân cái (ngón I);
- tổn thương rễ L5 đau lan tới lòng bàn chân (gan chân) tận hết ở ngón V (ngón út). Một
- số trường hợp không đau cột sống thắt lưng, chỉ đau dọc chân.
- Đau có thể liên tục hoặc từng cơn, giảm khi nằm nghỉ ngơi, tăng khi đi lại
- nhiều. Trường hợp có hội chứng chèn ép: tăng khi ho, rặn, hắt hơi. Có thể có triệu
- hứng yếu cơ. Giai đoạn muộn có teo cơ tứ đầu đùi, hạn chế vận động, co cứng cơ cạnh
- Một số nghiệm pháp:
- Hệ thống điểm đau Valleix, dấu chuông bấm dương tính.
- Dấu hiệu Lasègue dương tính.
- Các dấu hiệu khác có giá trị tương đương dấu hiệu Lasègue: dấu hiệu Chavany,
- ấu hiệu Bonnet.
- Phản xạ gân xương: Phản xạ gân bánh chè giảm hoặc mất trong tổn thương rễ
