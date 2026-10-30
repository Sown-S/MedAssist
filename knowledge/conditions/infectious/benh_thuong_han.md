---
schema: okf_condition_v1
condition_code: benh_thuong_han
name_vi: Bệnh thương hàn
name_en: Bệnh thương hàn
icd10_code: A01.0
disease_group: infectious
description: Bệnh thương hàn (Typhoid fever) là một bệnh cấp tính toàn thân do vi
  khuẩn Salmonella enterica typ huyết thanh Typhi gây nên với bệnh cảnh sốt kéo dài,
  có nhiều biến chứng nặng như xuất huyết tiêu hóa, thủng ruột, viêm cơ tim, viêm
  não dễ dẫn đến.
relations:
- symptom_code: meningeal_neck_stiffness_kernig
  polarity: SUPPORTS
  weight: 0.96
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
- symptom_code: dizziness_vertigo
  polarity: SUPPORTS
  weight: 0.88
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: epistaxis_nasal_bleeding
  polarity: SUPPORTS
  weight: 0.88
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_prolonged
  polarity: SUPPORTS
  weight: 0.85
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
  weight: 0.82
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
- Không có triệu chứng.
- b. Thời kỳ khởi phát (tuần thứ nhất): từ từ, tăng dần.
- Sốt nhẹ sau tăng dần tới 400C trong vòng 1 tuần.
- Đau đầu, suy nhược, mất ngủ, chóng mặt.
- Sốt hình cao nguyên 400C.
- Tiêu chảy phân màu vàng bí ngô hoặc đỏ nâu, mùi khẳm.
- Đào ban: ban màu hồng nhạt kích thước 2 - 4 mm ở ngực bụng, hết sau vài ngày,
- Sốt giảm dần rồi hết.
