---
schema: okf_condition_v1
condition_code: xuat_huyet_noi_nhan_sau_chan_thuong
name_vi: Xuất huyết nội nhãn sau chấn thương
name_en: Xuất huyết nội nhãn sau chấn thương
icd10_code: H44.8
disease_group: ophthalmology
description: Xuất huyết nội nhãn là tình trạng chảy máu vào tiền phòng và/hoặc dịch
  kính xảy ra sau chấn thương. Tùy theo mức độ xuất huyết và nguồn gốc xuất huyết
  sẽ ảnh hƣởng đến thị lực và tình trạng biến chứng kèm theo.
relations:
- symptom_code: retinal_vitreous_optic_disc_lesion
  polarity: SUPPORTS
  weight: 0.97
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: corneal_ulcer_hypopyon_keratitis
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: visual_acuity_decreased_blur
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: ocular_pain_photophobia_tearing
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
excerpts:
- excerpt_key: xuat_huyet_noi_nhan_sau_chan_thuong_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Xuất huyết nội nhãn sau chấn thương
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 40/QĐ-BYT)
---

## excerpt: xuat_huyet_noi_nhan_sau_chan_thuong_chan_doan
- Trường hợp XHTP
- Nhìn mờ sau chấn thương
- Khám mắt thấy có máu trong tiền phòng. Có thể chia thành các mức độ
- Độ I: Láng máu tiền phòng hoặc ngấn máu dưới 1/3 tiền phòng
- Độ II: Máu chiếm 1/3 đến ½ tiền phòng
- Độ III: Máu chiếm trên ½ tiền phòng
- Tổn thương bán phần trước: Trợt biểu mô giác mạc, rách màng
- Descemet, phù giác mạc, lùi góc, đứt chân mống mắt, đứt cơ vòng đồng tử, đục-
