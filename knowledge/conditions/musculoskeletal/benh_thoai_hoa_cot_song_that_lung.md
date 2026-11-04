---
schema: okf_condition_v1
condition_code: benh_thoai_hoa_cot_song_that_lung
name_vi: Bệnh thoái hóa cột sống thắt lưng
name_en: Spondylosis
icd10_code: M47.8
disease_group: musculoskeletal
description: Thoái hóa cột sống thắt lưng (Spondylosis hoặc Oteoarthritis of lumbar
  spine) là bệnh mạn tính tiến triển từ từ tăng dần gây đau, hạn chế vận động, biến
  dạng cột sống thắt lưng mà không có biểu hiện viêm. Tổn thương cơ bản của bệnh là
  tình trạng thoái hóa sụn khớp và đĩa đệm cột sống phối hợp với những thay đổi ở
  phần xương dưới sụn và màng hoạt dịch.
relations:
- symptom_code: mechanical_spinal_pain_stiffness
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: lumbar_spondylosis_paraspinal_spasm
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: morning_stiffness_under_30m
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: sciatica_lasegue_positive
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: joint_range_of_motion_limitation
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: periarticular_tendon_bursa_tenderness
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: spinal_deformity_scoliosis_loss_lordosis
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: muscle_tenderness_cramps_myotonia
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.65
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: benh_thoai_hoa_cot_song_that_lung_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh thoái hóa cột sống thắt lưng
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
- excerpt_key: benh_thoai_hoa_cot_song_that_lung_phan_bac
  title: Dấu hiệu cần tìm nguyên nhân khác khi chẩn đoán thoái hóa cột sống
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục 3.3, bài Thoái hóa cột sống thắt lưng
---

## excerpt: benh_thoai_hoa_cot_song_that_lung_chan_doan
- Chẩn đoán thoái hóa cột sống đơn thuần dựa vào những dấu hiệu:
- Lâm sàng là đau cột sống có tính chất cơ học.
- Xquang cột sống thắt lưng thường quy (thẳng – nghiêng – chếch ¾ hai bên):
- Cần lưu ý bệnh nhân phải không có triệu chứng toàn thân như: sốt, gầy sút cân,
- thiếu máu... Cần làm các xét nghiệm máu (bilan viêm, phosphatase kiềm..) để khẳng
- định là các thông số này bình thường. Trường hợp có các bất thường về lâm sàng (đau
- quá mức, gầy sút cân, sốt…) hoặc tốc độ lắng máu tăng cao cần phải tìm nguyên nhân
- khác (xem thêm bài đau cột sống thắt lưng).
- Thoái hóa cột sống thắt lưng ít khi diễn ra một cách đơn thuần, đa phần kết
- Lâm sàng
- Có thể có dấu hiệu cứng cột sống vào buổi sáng. Đau cột sống âm ỉ và có tính chất
- ơ học (đau tăng khi vận động và giảm khi nghỉ ngơi). Khi thoái hóa ở giai đoạn nặng,
- ó thể đau liên tục và ảnh hưởng đến giấc ngủ. Bệnh nhân có thể cảm thấy tiếng lục
- Đau cột sống thắt lưng do thoái hóa không có biểu hiện triệu chứng toàn thân như
- sốt, thiếu máu, gầy sút cân. Nói chung bệnh nhân đau khu trú tại cột sống. Một số
- trường hợp có đau rễ dây thần kinh do hẹp lỗ liên hợp hoặc thoát vị đĩa đệm kết hợp. Có
- thể có biến dạng cột sống: gù, vẹo cột sống. Trường hợp hẹp ống sống: biểu hiện đau
- ách hồi thần kinh: bệnh nhân đau theo đường đi của dây thần kinh tọa, xuất hiện khi đi
- lại, nghỉ ngơi đỡ đau (Cộng hưởng từ cho phép chẩn đoán mức độ hẹp ống sống).

## excerpt: benh_thoai_hoa_cot_song_that_lung_phan_bac
Mục 3.3 yêu cầu không có triệu chứng toàn thân như sốt, gầy sút cân, thiếu máu; khi có bất thường phải tìm nguyên nhân khác. Sốt cao phản bác chẩn đoán thoái hóa cột sống thắt lưng đơn thuần, không loại trừ bệnh đồng mắc.
