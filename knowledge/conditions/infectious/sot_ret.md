---
schema: okf_condition_v1
condition_code: sot_ret
name_vi: Sốt rét
name_en: KSTSR
icd10_code: B54
disease_group: infectious
description: Bệnh sốt rét là bệnh truyền nhiễm do 5 loài ký sinh trùng Plasmodium
  gây nên gồm Plasmodium falciparum, Plasmodium vivax, Plasmodium malariae, Plasmodium
  ovale và Plasmodium knowlesi. Bệnh lây truyền chủ yếu là do muỗi Anopheles.
relations:
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: sweating_profuse
  polarity: SUPPORTS
  weight: 0.94
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.88
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.86
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
excerpts:
- excerpt_key: sot_ret_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Sốt rét
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 2699/QĐ-BYT)
---

## excerpt: sot_ret_chan_doan
- 1. Trường hợp nghi ngờ sốt rét
- Là những trường hợp có sốt và có yếu tố dịch tễ.
- Người bệnh đang sốt hoặc có tiền sử sốt trong 3 ngày gần đây.
- Có triệu chứng điển hình của cơn sốt rét: rét run, sốt và vã mồ hôi.
- Hoặc có triệu chứng không điển hình của cơn sốt rét: sốt không thành cơn (người bệnh thấy ớn lạnh, gai rét) hoặc sốt cao liên tục, sốt dao động.
- b) Đang ở hoặc đã đến vùng sốt rét lưu hành trong thời gian ít nhất 7 ngày hoặc có tiền sử mắc sốt rét.
- Tất cả các trường hợp nghi ngờ sốt rét đều phải làm xét nghiệm để phát hiện KSTSR. Nếu lần đầu xét nghiệm soi lam âm tính, mà vẫn còn nghi ngờ người bệnh bị sốt rét, thì phải xét nghiệm lam máu thêm 2 - 3 lần cách nhau 8 giờ hoặc vào thời điểm người bệnh đang lên cơn sốt.
- 2. Trường hợp bệnh sốt rét xác định.
