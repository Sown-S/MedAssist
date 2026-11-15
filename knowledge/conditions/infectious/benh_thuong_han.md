---
schema: okf_condition_v1
condition_code: benh_thuong_han
name_vi: Bệnh thương hàn
name_en: Typhoid fever
icd10_code: A01.0
disease_group: infectious
description: Bệnh thương hàn (Typhoid fever) là một bệnh cấp tính toàn thân do vi khuẩn Salmonella enterica
  typ huyết thanh Typhi gây nên với bệnh cảnh sốt kéo dài, có nhiều biến chứng nặng như xuất huyết tiêu
  hóa, thủng ruột, viêm cơ tim, viêm não dễ dẫn đến tử vong.
relations:
- symptom_code: typhoid_stepwise_fever_bradycardia_tuphos
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: eosinophilic_meningitis_paresthesia_headache
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: watery_diarrhea
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: reduced_urine_output
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: cold_extremities
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: viral_hepatitis_jaundice_dark_urine_ast_alt
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: sym_altered_consciousness
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: sym_seizures
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: pulmonary_crackles_rales_consolidation
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: dizziness_vertigo
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_prolonged
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: abdominal_distension_borborygmi_pain
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: intoxication_coated_tongue_dry_lips
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: splenomegaly_left_hypochondriac_mass
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: epidemiological_exposure_vector_travel
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: benh_thuong_han_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh thương hàn
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_thuong_han_chan_doan
- Lâm sàng
- Thời kỳ ủ bệnh
- Không có triệu chứng.
- Thời kỳ khởi phát (tuần thứ nhất): từ từ, tăng dần.
- Sốt nhẹ sau tăng dần tới 400C trong vòng 1 tuần.
- Đau đầu, suy nhược, mất ngủ, chóng mặt.
- Buồn nôn, táo bón.
- Khám lâm sàng: lưỡi bẩn, bụng chướng, lách to có thể to, nghe phổi có thể thấy
- rale phế quản và gõ đục đáy phổi phải (dấu hiệu Lesieur).
- Thời kỳ toàn phát (tuần thứ hai): thường kéo dài 2 - 3 tuần trừ những trường
- Sốt hình cao nguyên 400C.
- Tiêu chảy phân màu vàng bí ngô hoặc đỏ nâu, mùi khẳm.
- Bụng chướng, lách to, dấu hiệu ùng ục hố chậu phải.
- Đào ban: ban màu hồng nhạt kích thước 2 - 4 mm ở ngực bụng, hết sau vài ngày,
- Loét Duguet: loét hình bầu dục ở nếp a-mi-đan trước, dài 6-8 mm, rộng 4-6 mm,
- Thời kỳ lui bệnh và hồi phục (tuần thứ ba)
- Sốt giảm dần rồi hết.
- Hết tiêu chảy, bụng đỡ chướng dần.
- Sốt từ từ tăng dần, nhiệt độ hình cao nguyên.
- Đào ban ở bụng, ngực.
