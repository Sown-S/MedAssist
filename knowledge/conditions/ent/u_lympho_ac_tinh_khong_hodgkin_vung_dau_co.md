---
schema: okf_condition_v1
condition_code: u_lympho_ac_tinh_khong_hodgkin_vung_dau_co
name_vi: U lympho ác tính không hodgkin vùng đầu cổ
name_en: Non-Hodgkin lymphoma of the head and neck
icd10_code: C85.9
disease_group: ent
description: U lympho ác tính không Hodgkin ngoài hạch vùng đầu cổ (ULAKHNH) thuộc
  nhóm bệnh tăng sinh ác tính của dòng tế bào lympho biểu hiện ở niêm mạc vùng tai
  mũi họng-đầu cổ. Định nghĩa này sẽ cho phép phân biệt với thể u lympho ác tính không
  Hodgkin tại hạch (tỏa lan trên hệ thống hạch toàn thân).
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: vocal_abuse_phonotrauma_strain
  polarity: SUPPORTS
  weight: 0.88
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: laryngeal_paresthesia_throat_clearing
  polarity: SUPPORTS
  weight: 0.88
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.74
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
excerpts:
- excerpt_key: u_lympho_ac_tinh_khong_hodgkin_vung_dau_co_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng U lympho ác tính không hodgkin vùng đầu cổ
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5643/QĐ-BYT)
---

## excerpt: u_lympho_ac_tinh_khong_hodgkin_vung_dau_co_chan_doan
- Lâm sàng
- Triệu chứng toàn thân khá điển hình: sốt cao từng đợt kéo dài, đổ mồ hôi, gày sút
- Kèm theo có biểu hiện các triệu chứng cơ năng của nơi u khu trú như các dấu hiệu
- kèm loét, có thể hoại tử. Có thể kèm nổi hạch vùng cổ.
- Chẩn đoán thể lâm sàng theo Working formular (WF: W1-10), giai đoạn theo hệ
