---
schema: okf_condition_v1
condition_code: benh_phong
name_vi: Bệnh phong
name_en: Leprosy
icd10_code: A30.9
disease_group: dermatology
description: Bệnh phong là bệnh nhiễm trùng kinh diễn do trực khuẩn Mycobacterium
  leprae (M. leprae) gây nên. Bệnh có thể gây các tàn tật nếu không được phát hiện
  và điều trị kịp thời.
relations:
- symptom_code: pigmentary_macule_patch
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.82
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: pruritus_intense_skin_itch
  polarity: SUPPORTS
  weight: 0.78
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: scaly_plaque_hyperkeratosis
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
excerpts:
- excerpt_key: benh_phong_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh phong
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 75/QĐ-BYT)
---

## excerpt: benh_phong_chan_doan
- Thời kỳ ủ bệnh: rất khó xác định. Thời kỳ ủ bệnh của bệnh phong rất lâu:
- Thương tổn da
- Thương tổn thần kinh
- . Rối loạn cảm giác: mất hay giảm cảm giác đau, nóng lạnh, xúc giác tại các
- thương tổn da hoặc các vùng da do dây thần kinh chi phối bị viêm.
- . Viêm các dây thần kinh ngoại biên bị viêm có thể gây liệt, tàn tật.
- . Các dây thần kinh hay bị viêm: trụ, cổ nông, hông khoeo ngoài, giữa và
- Rối loạn bài tiết: da khô, bóng mỡ do không bài tiết mồ hôi.
