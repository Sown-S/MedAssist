---
schema: okf_condition_v1
condition_code: benh_bach_bien
name_vi: Bệnh bạch biến
name_en: Vitiligo
icd10_code: L80
disease_group: dermatology
description: Bạch biến là một bệnh da do rối loạn sắc tố với các đám da giảm hoặc mất sắc tố có thể gặp
  ở mọi vị trí trên cơ thể nhưng thường gặp ở vùng mặt, cẳng tay và bộ phận sinh dục. Bệnh bạch biến có
  thể khởi phát ở bất kỳ tuổi nào, nhưng thường gặp ở người trẻ. Nam chiếm 32,5% và nữ là 67,5%. Một số
  trường hợp bệnh có tính chất gia đình. Bệnh ảnh hưởng nhiều đến tâm sinh lý và thẩm mỹ của người bệnh.
relations:
- symptom_code: vitiligo_chalk_white_depigmented_macules
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: palmoplantar_keratoderma_fissures
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: pigmentary_macule_patch
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
excerpts:
- excerpt_key: benh_bach_bien_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh bạch biến
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 75/QĐ-BYT)
---

## excerpt: benh_bach_bien_chan_doan
- Chẩn đoán xác định
- Thương tổn da
- . Thương tổn không có vảy, không ngứa, không đau. Các vết trắng dần lan
- Các triệu chứng khác
- . Bệnh khởi phát từ từ, rất khó nhận thấy, nhưng cũng có trường hợp bệnh
- số vùng da bị viêm tấy hơi cao hơn mặt da, biến đi nhanh chóng sau đó mới xuất
- Các thể lâm sàng của bạch biến bao gồm:
- Một số bệnh có liên quan đến bệnh bạch biến
- Cận lâm sàng
- Mô bệnh học: giảm hoặc không có tế bào sắc tố thượng bì.
- Phản ứng DOPA
- Xét nghiệm định lượng hormon tuyến giáp, tuyến thượng thận, tuyến yên
