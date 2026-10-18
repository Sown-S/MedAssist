---
schema: okf_condition_v1
condition_code: hoi_chung_co_vai_canh_tay
name_vi: Hội chứng cổ vai cánh tay
name_en: Cervical scapulohumeral syndrome
icd10_code: M53.1
disease_group: musculoskeletal
description: Nhóm triệu chứng lâm sàng liên quan đến bệnh lý cột sống cổ có kèm rối
  loạn chức năng rễ, dây thần kinh cột sống cổ, gây đau vùng cổ, vai và lan xuống
  một bên tay kèm tê bì.
relations:
- symptom_code: cervical_radicular_pain
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: mechanical_spinal_pain
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: shoulder_pain_restricted_motion
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.75
  is_key: false
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: hoi_chung_co_vai_canh_tay_chan_doan
  title: Chẩn đoán lâm sàng Hội chứng cổ vai cánh tay
  source_key: moh_co_xuong_khop_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục 3.1.1 - Hội chứng cổ vai cánh tay (Quyết định số 361/QĐ-BYT,
    trang 149-150)
---

## excerpt: hoi_chung_co_vai_canh_tay_chan_doan
- Hội chứng cột sống cổ: đau và co cứng cơ vùng cổ gáy, hạn chế vận động cổ.
- Hội chứng rễ thần kinh cổ: đau vùng gáy lan xuống vai, cánh tay, bàn tay kèm cảm giác tê bì, kiến bò theo rễ; nghiệm pháp Spurling và dấu hiệu chuông bấm dương tính.
