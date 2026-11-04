---
schema: okf_condition_v1
condition_code: benh_gut
name_vi: Bệnh gút
name_en: gout
icd10_code: M10.9
disease_group: musculoskeletal
description: Bệnh gút là bệnh viêm khớp do vi tinh thể, đặc trưng bởi những đợt viêm
  khớp cấp tái phát, có lắng đọng tinh thể muối urat natri trong các mô, gây ra do
  tăng acid uric trong máu. Đây là bệnh do rối loạn chuyển hóa nhân purin, thuộc nhóm
  bệnh rối loạn chuyển hóa.
relations:
- symptom_code: acute_podagra_tophi
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: gout_hyperuricemia_colchicine_response
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: asymmetric_oligoarthritis_lower
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
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.74
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: benh_gut_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh gút
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
---

## excerpt: benh_gut_chan_doan
- Chẩn đoán xác định (có thể áp dụng một trong các tiêu chuẩn sau)
- Tiêu chuẩn Bennet và Wood (1968): Độ nhạy 70%, độ đặc hiệu 82,7%
- Tiêu chuẩn Bennet và Wood (1968) được áp dụng rộng rãi nhất ở Việt Nam do dễ
- Hoặc tìm thấy tinh thể natri urat trong dịch khớp hay trong các hạt tôphi.
- Hoặc tối thiểu có hai trong các yếu tố sau đây:
- Tiền sử hoặc hiện tại có tối thiểu hai đợt sưng đau của một khớp với tính chất
- khởi phát đột ngột, đau dữ dội, và khỏi hoàn toàn trong vòng 2 tuần.
- Tiền sử hoặc hiện tại có sưng đau khớp bàn ngón chân cái với các tính chất
- Có hạt tôphi.
- Đáp ứng tốt với colchicin (giảm viêm, giảm đau trong 48 giờ) trong tiền sử
- Chẩn đoán xác định khi có tiêu chuẩn a hoặc 2 yếu tố của tiêu chuẩn b.
- Theo tiêu chuẩn của ILAR và Omeract năm 2000: Độ nhạy 70%, đặc hiệu 78,8%.
- Có tinh thể urat đặc trưng trong dịch khớp, và / hoặc:
- Hạt tôphi được chứng minh có chứa tinh thể urat bằng phương pháp hóa học
- Có 6 trong số 12 biểu hiện lâm sàng, xét nghiệm và Xquang sau:
- Viêm tiến triển tối đa trong vòng một ngày.
- Có hơn một cơn viêm khớp cấp.
- Viêm khớp ở một khớp.
- Đỏ vùng khớp.
- Sưng, đau khớp bàn ngón chân I.
