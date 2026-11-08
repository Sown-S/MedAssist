---
schema: okf_condition_v1
condition_code: benh_viem_khop_dang_thap
name_vi: Bệnh viêm khớp dạng thấp
name_en: Rheumatoid Arthritis
icd10_code: M05.9
disease_group: musculoskeletal
description: Viêm khớp dạng thấp (VKDT) là một bệnh lý tự miễn điển hình, diễn biến mạn tính với các biểu
  hiện tại khớp, ngoài khớp và toàn thân ở nhiều mức độ khác nhau. Bệnh diễn biến phức tạp, gây hậu quả
  nặng nề do đó cần được điều trị tích cực ngay từ đầu bằng các biện pháp điều trị hữu hiệu để làm ngừng
  hay làm chậm tiến triển của bệnh, hạn chế tàn phế và nâng cao chất lượng sống cho người bệnh.
relations:
- symptom_code: morning_stiffness_over_1h
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: symmetric_polyarthritis_hands
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: rheumatoid_nodules_ulnar_deviation
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: joint_swelling_warmth_redness_effusion
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: serositis_pleural_pericardial
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: myalgia_arthralgia
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
- excerpt_key: benh_viem_khop_dang_thap_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh viêm khớp dạng thấp
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
---

## excerpt: benh_viem_khop_dang_thap_chan_doan
- Chẩn đoán xác định: khi có ≥ 4 tiêu chuẩn. Triệu chứng viêm khớp (tiêu chuẩn
- Tiêu chuẩn của Hội Thấp khớp học Hoa Kỳ (ACR) 1987
- Hiện nay tiêu chuẩn này vẫn đang được áp dụng rộng rãi nhất trên thế giới và
- Việt Nam đối với thể biểu hiện nhiều khớp và thời gian diễn biến viêm khớp trên 6 tuần.
- Cứng khớp buổi sáng kéo dài trên 1 giờ.
- Viêm tối thiểu ba nhóm khớp: sưng phần mềm hay tràn dịch tối thiểu 3 trong
- Viêm các khớp ở bàn tay: sưng tối thiểu một nhóm trong số các khớp cổ tay,
- Viêm khớp đối xứng.
- Hạt dưới da.
- Yếu tố dạng thấp trong huyết thanh dương tính.
- Dấu hiệu X quang điển hình của VKDT: chụp khớp tại bàn tay, cổ tay hoặc
- Tiêu chuẩn ACR 1987 có độ nhạy 91-94% và độ đặc hiệu 89% ở những bệnh
- nhân VKDT đã tiến triển. Ở giai đoạn bệnh mới khởi phát, độ nhạy chỉ dao động từ
- Lưu ý: Hạt dưới da hiếm gặp ở Việt Nam. Ngoài ra, cần khảo sát các triệu chứng
- ngoài khớp như: teo cơ, viêm mống mắt, tràn dịch màng ngoài tim, tràn dịch màng phổi,
- viêm mạch máu... thường ít gặp, nhẹ, dễ bị bỏ sót.
- Tiêu chuẩn của Hội Thấp khớp học Hoa Kỳ và Liên đoàn chống Thấp khớp
- League Against Rhumatism). Tiêu chuẩn này có thể áp dụng trong trường hợp bệnh ở
- giai đoạn sớm, các khớp viêm dưới 06 tuần và thể ít khớp. Tuy nhiên cần luôn theo dõi
- ệnh lý khớp khác không phải viêm khớp dạng thấp
