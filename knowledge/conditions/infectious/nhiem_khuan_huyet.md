---
schema: okf_condition_v1
condition_code: nhiem_khuan_huyet
name_vi: Nhiễm khuẩn huyết
name_en: Sepsis
icd10_code: A41.9
disease_group: infectious
description: Nhiễm khuẩn huyết là một tình trạng nhiễm trùng cấp tính nặng, do vi
  khuẩn lưu hành trong máu gây ra, biểu hiện bằng các triệu chứng toàn thân, có thể
  dẫn đến sốc nhiễm khuẩn và suy đa tạng với tỷ lệ tử vong rất cao (từ 20 - 50%).
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: skin_cellulitis_pus_abscess
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.84
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: nhiem_khuan_huyet_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Nhiễm khuẩn huyết
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: nhiem_khuan_huyet_chan_doan
- Sốt và các triệu chứng toàn thân:
- Sốt là triệu chứng rất thường gặp, có thể kèm theo rét run hoặc không. Trong
- Vị trí ổ nhiễm trùng khởi điểm:
- Nhiễm trùng tiêu hóa: áp xe gan, viêm túi mật, viêm ruột, viêm đại tràng, thủng
- Nhiễm trùng sinh dục tiết niệu: viêm đài bể thận, áp xe thận, sỏi thận có biến
- Nhiễm trùng vùng tiểu khung: viêm phúc mạc vùng tiểu khung, áp xe buồng
- Nhiễm trùng hô hấp dưới: viêm phổi, viêm mủ màng phổi, áp xe phổi…
- Nhiễm trùng mạch máu do các đường truyền tĩnh mạch, các catheter mạch
