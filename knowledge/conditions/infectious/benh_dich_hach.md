---
schema: okf_condition_v1
condition_code: benh_dich_hach
name_vi: Bệnh dịch hạch
name_en: Plague
icd10_code: A20.9
disease_group: infectious
description: 'Dịch hạch là bệnh nhiễm trùng nhiễm độc do vi khuẩn Yersinia pestis
  (Pasteurella pestis) gây nên. Bệnh lây truyền sang người do bọ chét đốt và truyền
  vi khuẩn. Ba bệnh cảnh lâm sàng chính của dịch hạch là: thể phổi, thể nhiễm khuẩn
  huyết và thể hạch. Cả 3 thể này đều có thể gây tử vong cao.'
relations:
- symptom_code: plague_painful_bubo_toxemia
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: sepsis_sirs_organ_dysfunction_hypoperfusion
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: hemoptysis_blood_streaked_sputum
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: tachypnea_accessory_muscle_retractions
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: petechiae_mucosal_bleeding
  polarity: SUPPORTS
  weight: 0.88
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: abdominal_distension_borborygmi_pain
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: epidemiological_exposure_vector_travel
  polarity: SUPPORTS
  weight: 0.78
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: splenomegaly_left_hypochondriac_mass
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: intoxication_coated_tongue_dry_lips
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.68
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: benh_dich_hach_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh dịch hạch
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_dich_hach_chan_doan
- Yếu tố về dịch tễ học và lâm sàng: trong vùng dịch tễ, trước tất cả các trường
- hợp viêm hạch mủ cần phải nghĩ tới chẩn đoán viêm hạch do vi khuẩn dịch hạch.
- Chẩn đoán xác định chắc chắn khi có bằng chứng từ xét nghiệm vi khuẩn học
- Lâm sàng: thời gian ủ bệnh thường ngắn, từ 1-6 ngày tùy từng thể.
- Dịch hạch thể hạch
- Sốt cao, rét run, mệt mỏi, bệnh cảnh nhiễm độc nặng (xanh tái, mệt, thở nhanh,
- Hạch sưng đỏ, phù quanh hạch, hay gặp là hạch bẹn, đôi khi là hạch đùi, hạch
- nách, hoặc hạch cổ. Chọc hạch có thể ra dịch mủ. Hạch có thể rò tự nhiên.
- Có thể thấy nốt phỏng tại vị trí vết đốt, phát ban dạng dát ở tay và chân.
- Gan, lách to.
- Trường hợp nặng có thể có rối loạn ý thức, rối loạn tiêu hóa, đông máu nội
- Dịch hạch thể phổi tiên phát
- Tình trạng nhiễm trùng nhiễm độc nặng với biểu hiện viêm phổi cấp tính, khó
- thở và ho ra máu.
- Dịch hạch thể nhiễm khuẩn huyết
- Thường gặp ở các người bệnh nhiều tuổi.
- Nôn, buồn nôn, đau bụng và tiêu chảy.
- Tình trạng nhiễm độc rõ, nhịp tim nhanh, thở nhanh, tụt huyết áp, hạ nhiệt độ.
- Có thể thấy chấm xuất huyết toàn thân và tiến triển nhanh chóng hoại tử ở các
