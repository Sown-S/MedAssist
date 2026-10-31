---
schema: okf_condition_v1
condition_code: nhuoc_thi
name_vi: Nhược thị
name_en: Nhược thị
icd10_code: H53.0
disease_group: ophthalmology
description: Nhược thị là tình trạng giảm thị lực ở một hoặc hai mắt hoặc có sự khác
  biệt thị lực giữa hai mắt trên 2 dòng sau khi đã được điều chỉnh kính tối ưu hoặc
  điều trị được nguyên nhân, có thể là nhược thị cơ năng hoặc nhược thị thực thể .
relations:
- symptom_code: visual_acuity_decreased_blur
  polarity: SUPPORTS
  weight: 0.96
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: diplopia_strabismus_proptosis
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: ocular_pain_photophobia_tearing
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
- symptom_code: conjunctival_ciliary_injection_discharge
  polarity: SUPPORTS
  weight: 0.78
  is_key: false
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
excerpts:
- excerpt_key: nhuoc_thi_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Nhược thị
  source_key: moh_qd_40_2015
  source_edition: Quyết định số 40/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 40/QĐ-BYT)
---

## excerpt: nhuoc_thi_chan_doan
- Triệu chứng cơ năng: nhìn mờ một hoặc hai mắt, mỏi mắt, có thể kèm
- Triệu chứng thực thể.
- Giảm thị lực: ở một mắt hoặc cả hai mắt sau khi chỉnh kính, hoặc chênh
- lệch thị lực 2 mắt ≥ 2 hàng thị lực. Ở trẻ nhỏ không thử được thị lực thì dựa vào sự
- Hiện tƣợng đám đông: bệnh nhân đọc từng chữ từng mắt rời rạc dễ dàng
- Có thể có lác mắt, mắt không có khả nặng định thị hoặc định thị ngoại tâm.
- Khám có thể phát hiện được nguyên nhân.
- Siêu âm nhãn cầu có thể phát hiện được nguyên nhân.
