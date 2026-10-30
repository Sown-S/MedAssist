---
schema: okf_condition_v1
condition_code: benh_dich_hach
name_vi: Bệnh dịch hạch
name_en: Bệnh dịch hạch
icd10_code: A20.9
disease_group: infectious
description: Dịch hạch là bệnh nhiễm trùng nhiễm độc do vi khuẩn Yersinia pestis (Pasteurella
  pestis) gây nên. Bệnh lây truyền sang người do bọ chét đốt và truyền vi khuẩn.
relations:
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
- symptom_code: petechiae_mucosal_bleeding
  polarity: SUPPORTS
  weight: 0.88
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.84
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.88
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
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
- Sốt cao, rét run, mệt mỏi, bệnh cảnh nhiễm độc nặng (xanh tái, mệt, thở nhanh,
- Hạch sưng đỏ, phù quanh hạch, hay gặp là hạch bẹn, đôi khi là hạch đùi, hạch
- Có thể thấy nốt phỏng tại vị trí vết đốt, phát ban dạng dát ở tay và chân.
- Gan, lách to.
- Trường hợp nặng có thể có rối loạn ý thức, rối loạn tiêu hóa, đông máu nội
- Tình trạng nhiễm trùng nhiễm độc nặng với biểu hiện viêm phổi cấp tính, khó
- thở và ho ra máu.
- Thường gặp ở các người bệnh nhiều tuổi.
