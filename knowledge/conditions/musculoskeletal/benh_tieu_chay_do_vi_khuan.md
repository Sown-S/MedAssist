---
schema: okf_condition_v1
condition_code: benh_tieu_chay_do_vi_khuan
name_vi: Bệnh tiêu chảy do vi khuẩn
name_en: Bệnh tiêu chảy do vi khuẩn
icd10_code: A04.9
disease_group: musculoskeletal
description: 'Tiêu chảy do vi khuẩn là bệnh thường gặp ở mọi lứa tuổi, liên quan mật
  thiết đến vệ sinh an toàn thực phẩm. Biểu hiện lâm sàng chung thường thấy là: sốt,
  nôn, đau bụng, và tiêu chảy nhiều lần.'
relations:
- symptom_code: dysentery_tenesmus_bloody_stool
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.88
  is_key: true
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
excerpts:
- excerpt_key: benh_tieu_chay_do_vi_khuan_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh tiêu chảy do vi khuẩn
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: benh_tieu_chay_do_vi_khuan_chan_doan
- Nôn và buồn nôn.
- Tiêu chảy nhiều lần, tính chất phân phụ thuộc vào căn nguyên gây bệnh:
- Tiêu chảy do độc tố vi khuẩn: phân có nhiều nước, không có bạch cầu hoặc
- Tiêu chảy do vi khuẩn xâm nhập: phân thường có nhầy, đôi khi có máu.
- Biểu hiện toàn thân:
- Có thể sốt hoặc không sốt.
- Tình trạng nhiễm độc: mệt mỏi, nhức đầu, có thể có hạ huyết áp.
- Tình trạng mất nước.
