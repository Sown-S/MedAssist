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
  Các yếu tố nguy cơ người già, trẻ sơ sinh/đẻ non. Người sử dụng thuốc ức chế miễn
  dịch, như sử dụng corticoid kéo dài, các thuốc chống thải ghép, hoặc đang điều trị
  hóa chất và tia xạ.
relations:
- symptom_code: sepsis_sirs_organ_dysfunction_hypoperfusion
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: skin_cellulitis_pus_abscess
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: eosinophilic_meningitis_paresthesia_headache
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: viral_hepatitis_jaundice_dark_urine_ast_alt
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: tachypnea_accessory_muscle_retractions
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: splenomegaly_left_hypochondriac_mass
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: epidemiological_exposure_vector_travel
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
excerpts:
- excerpt_key: nhiem_khuan_huyet_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Nhiễm khuẩn huyết
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: nhiem_khuan_huyet_chan_doan
- Lâm sàng: có tính chất gợi ý đến nhiễm khuẩn huyết, gồm: sốt cao, gan lách to,
- ó triệu chứng ổ nhiễm khuẩn khởi điểm, hoặc có tình trạng nhiễm khuẩn nặng có hoặc
- Cấy máu dương tính là tiêu chuẩn vàng để chẩn đoán nhiễm khuẩn huyết. Nên
- Cấy các bệnh phẩm khác của ổ nhiễm khuẩn khởi điểm hoặc ổ nhiễm khuẩn
- Lâm sàng
- Sốt và các triệu chứng toàn thân:
- Sốt là triệu chứng rất thường gặp, có thể kèm theo rét run hoặc không. Trong
- Vị trí ổ nhiễm trùng khởi điểm:
- Nhiễm trùng tiêu hóa: áp xe gan, viêm túi mật, viêm ruột, viêm đại tràng, thủng
- Nhiễm trùng sinh dục tiết niệu: viêm đài bể thận, áp xe thận, sỏi thận có biến
- Nhiễm trùng vùng tiểu khung: viêm phúc mạc vùng tiểu khung, áp xe buồng
- Nhiễm trùng hô hấp dưới: viêm phổi, viêm mủ màng phổi, áp xe phổi…
- Nhiễm trùng mạch máu do các đường truyền tĩnh mạch, các catheter mạch
- Nhiễm trùng tim mạch: viêm nội tâm mạc nhiễm khuẩn, áp xe cơ tim, áp xe
- Các nhiễm trùng da và niêm mạc.
- Triệu chứng rối loạn chức năng cơ quan: suy gan, suy thận….
- Biến chứng:
- Sốc nhiễm khuẩn: huyết áp tâm thu < 90 mmHg, hoặc huyết áp tâm thu giảm
- Suy đa tạng: thường biểu hiện bằng một hay nhiều biểu hiện sau:
- Giảm oxy máu động mạch (PaO2 /FiO2 < 300).
