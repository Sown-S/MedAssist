---
schema: okf_condition_v1
condition_code: benh_sot_mo
name_vi: Bệnh sốt mò
name_en: Scrub typhus
icd10_code: A75.3
disease_group: infectious
description: Sốt mò (scrub typhus) là một bệnh truyền nhiễm cấp tính lưu hành ở Việt
  Nam. Bệnh có biểu hiện đa dạng, bao gồm sốt, vết loét ngoài da, phát ban, sưng hạch,
  tổn thương nhiều cơ quan và phủ tạng, có thể dẫn tới tử vong nếu không được điều
  trị thích hợp và kịp thời.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: eschar_ulcer_bite_lesion
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: eosinophilic_meningitis_paresthesia_headache
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: seasonal_flu_abrupt_fever_myalgia_coryza
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
- symptom_code: pulmonary_crackles_rales_consolidation
  polarity: SUPPORTS
  weight: 0.92
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
- symptom_code: fever_prolonged
  polarity: SUPPORTS
  weight: 0.86
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: serositis_pleural_pericardial
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: hepatomegaly_right_hypochondriac_tenderness
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: epidemiological_exposure_vector_travel
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: splenomegaly_left_hypochondriac_mass
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
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.72
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
- excerpt_key: benh_sot_mo_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh sốt mò
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_sot_mo_chan_doan
- Cần nghĩ đến sốt mò khi người bệnh có tiền sử sống hoặc đi đến các vùng có sốt
- mò lưu hành; người bệnh có bệnh cảnh sốt cấp tính với tổn thương ở nhiều cơ quan và
- phủ tạng. Chẩn đoán sốt mò trên lâm sàng rất dễ dàng nếu người bệnh có vết loét đặc
- Các xét nghiệm chẩn đoán sốt mò thường được sử dụng:
- Xét nghiệm huyết thanh học: xét nghiệm kháng thể hấp phụ miễn dịch gắn men
- Phản ứng nhân chuỗi men polymerase (PCR).
- Lâm sàng
- Thời gian ủ bệnh của sốt mò kéo dài từ 6 ngày đến 21 ngày (trung bình từ 9 đến
- Sốt: thường khởi phát đột ngột; người bệnh sốt cao liên tục, có thể kèm theo rét
- run, đau đầu, đau mỏi người.
- Biểu hiện da và niêm mạc:
- Da xung huyết, có thể phù nhẹ dưới da vùng mặt và mu chân; xung huyết kết
- Vết loét ngoài da: là dấu hiệu đặc hiệu của bệnh sốt mò; vết loét có hình bầu
- ục, kích thước từ 0,5-2 cm, có vẩy đen hoặc đã bong vẩy tạo thành vết loét có gờ,
- không tiết dịch; các vết loét thường không đau, khu trú ở những vùng da mềm như nách,
- Ban ngoài da: ban thường xuất hiện vào cuối tuần thứ nhất của bệnh, có dạng
- át sẩn, phân bổ chủ yếu ở thân, có thể ở cả chân tay; có thể gặp ban xuất huyết.
- Sưng hạch lympho: người bệnh thường có hạch sưng tại chỗ vết loét và hạch
- toàn thân; hạch có kích thước 1,5-2 cm, mềm, không đau, di dộng bình thường.
- Gan to, lách to: có thể gặp ở khoảng 40% số người bệnh sốt mò. Một số trường
