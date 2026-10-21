---
schema: okf_condition_v1
condition_code: benh_viem_khop_thieu_nien_tu_phat_the_he_thong
name_vi: Bệnh viêm khớp thiếu niên tự phát thể hệ thống
name_en: Juvenile Idiopathic Arthritis with systemic onset
icd10_code: M08.2
disease_group: musculoskeletal
description: Viêm khớp thiếu niên tự phát thể hệ thống chiếm 5 - 15 % nhóm bệnh viêm
  khớp thiếu niên tự phát. Đây là biểu hiện tổn thương nội tạng của bệnh với sốt cao
  đặc trưng, kèm các tổn thương lan tỏa ngoài khớp (da, mạch máu, tim, phổi, gan,
  lách, hạch ...).
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fever_prolonged
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.86
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: benh_viem_khop_thieu_nien_tu_phat_the_he_thong_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh viêm khớp thiếu niên tự phát thể hệ thống
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
---

## excerpt: benh_viem_khop_thieu_nien_tu_phat_the_he_thong_chan_doan
- 3.1. Triệu chứng lâm sàng
- Triệu chứng tại khớp:
- Đau khớp là triệu chứng sớm và thường thoáng qua. Viêm đa khớp thường gặp
- Triệu chứng ngoài khớp:
- Sốt đặc trưng của bệnh thường xuất hiện trong đợt khởi phát, nhưng cũng có
- thể xảy ra sau đợt viêm khớp. Sốt thường kéo dài trên 2 tuần, nhưng có thể kéo dài từ
- nhiều tuần đến nhiều tháng. Sốt có thể xảy ra bất cứ lúc nào trong ngày, điển hình là sốt
- dao động với một hoặc hai cơn trong ngày, thường xảy ra vào buổi chiều hoặc tối. Sốt
