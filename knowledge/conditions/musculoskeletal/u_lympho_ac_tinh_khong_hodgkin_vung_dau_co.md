---
schema: okf_condition_v1
condition_code: u_lympho_ac_tinh_khong_hodgkin_vung_dau_co
name_vi: U lympho ác tính không hodgkin vùng đầu cổ
name_en: U lympho ác tính không hodgkin vùng đầu cổ
icd10_code: C85.9
disease_group: musculoskeletal
description: U lympho ác tính không Hodgkin ngoài hạch vùng đầu cổ (ULAKHNH) thuộc
  nhóm bệnh tăng sinh ác tính của dòng tế bào lympho biểu hiện ở niêm mạc vùng tai
  mũi họng-đầu cổ. Định nghĩa này sẽ cho phép phân biệt với thể u lympho ác tính không.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: weight_loss_anorexia
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
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
- Triệu chứng toàn thân khá điển hình: sốt cao từng đợt kéo dài, đổ mồ hôi, gày sút
- Kèm theo có biểu hiện các triệu chứng cơ năng của nơi u khu trú như các dấu hiệu
- Chẩn đoán mô bệnh học và hóa mô miễn dịch bệnh phẩm sinh thiết khối u là tiêu chuẩn
- vàng, sẽ cho phép phân loại dưới typ ULAKHNH để lựa chọn phác đồ điều trị chuẩn.
- Chụp cắt lớp vi tính: CT, PET-CT cho phép xác định lan tràn tại chỗ và lan xa của u.
