---
schema: okf_condition_v1
condition_code: benh_ghe
name_vi: Bệnh ghẻ
name_en: Scabies
icd10_code: B86
disease_group: dermatology
description: Là một bệnh da khá phổ biến, thường xuất hiện ở những vùng dân cƣ đông
  đúc, nhà ở chật hẹp, thiếu vệ sinh, thiếu nước sinh hoạt. Bệnh lây qua tiếp xúc
  trực tiếp hoặc qua quần áo, chăn màn.
relations:
- symptom_code: pruritus_intense_skin_itch
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: vesicular_blister_rash
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: pustular_furuncle_folliculitis
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
- symptom_code: fever_high
  polarity: CONTRADICTS
  weight: 0.85
  is_key: false
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
excerpts:
- excerpt_key: benh_ghe_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh ghẻ
  source_key: moh_qd_75_2015
  source_edition: Quyết định số 75/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 75/QĐ-BYT)
---

## excerpt: benh_ghe_chan_doan
- Tổn thương là dát hình tròn hay hình bầu dục trên có vảy da mỏng. Có thể
- Màu tổn thương hay gặp nhất là màu nâu (tăng sắc tố) và nâu vàng (giảm
- sắc tố); thỉnh thoảng có hiện tƣợng viêm nhẹ (màu hồng).
- Dưới ánh sáng đen Wood, tổn thương lang ben có màu vàng sáng hoặc vàng
- Bệnh nhân có thể có ngứa nhẹ nhất là khi thời tiết nóng bức.
- Soi trực tiếp: hình ảnh bào tử xen kẽ với sợi nấm ngắn từ bệnh phẩm được
- Nuôi cấy: khi nuôi cấy Malassezia cần phủ trên đó lớp dầu bởi khả năng ƣa
- Tổn thương da tăng hoặc giảm sắc tố, vảy da mỏng
