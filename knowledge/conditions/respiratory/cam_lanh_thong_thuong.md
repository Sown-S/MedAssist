---
schema: okf_condition_v1
condition_code: cam_lanh_thong_thuong
name_vi: Cảm lạnh thông thường
name_en: Common cold
icd10_code: J00
disease_group: respiratory
description: Viêm cấp tính niêm mạc mũi và họng do virus, thường có ngạt mũi và chảy nước mũi.
relations:
- symptom_code: rhinorrhea_nasal_congestion
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: nasal_obstruction_stuffiness
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: sore_throat_dysphagia
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: cough_productive_sputum
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
excerpts:
- excerpt_key: cam_lanh_thong_thuong_lam_sang
  title: Triệu chứng toàn thân và cơ năng trong mục Viêm mũi họng cấp tính
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
  source_locator: Phần 3, Viêm mũi họng cấp tính, mục 3.1.1 Lâm sàng, tr. 134
---

## Ranh giới hồ sơ và rà chéo

- Hồ sơ này giới hạn ở viêm mũi họng cấp do virus. Hồ sơ Tai Mũi Họng `hong_thanh_quan_viem_mui_hong_cap_tinh` dùng cùng mã J00 và cùng chương hướng dẫn, với phạm vi viêm mũi họng cấp rộng hơn. Hai hồ sơ có thể cùng xuất hiện trong kết quả truy xuất.
- Tuấn và Huy thống nhất giữ song song hai hồ sơ J00 và giữ nguyên tên hiển thị, nội dung hồ sơ Tai Mũi Họng trong KB-2026.12.
- Cúm mùa có tác nhân là virus cúm. Viêm họng cấp tập trung ở họng. Viêm mũi xoang cấp có tổn thương ở mũi và các xoang cạnh mũi.
- Mục 3.1.1 mô tả triệu chứng của viêm mũi họng cấp nói chung. Chảy mũi và ngạt mũi được nêu là thường gặp. Nuốt đau, ho khan, nhức đầu và mệt mỏi là biểu hiện hỗ trợ. Chưa chọn triệu chứng then chốt vì mục này chưa xác lập biểu hiện đặc trưng cho riêng thể do virus.
- `fever_low_grade` có trọng số 0.3. Khoảng sốt vừa 38–39 °C của nguồn giao với ngưỡng 37,5–38,4 °C của catalog tại 38–38,4 °C.
- Theo chốt 16/11, `fever_high` được để ngoài các quan hệ của hồ sơ cảm lạnh để sốt cao hướng việc đối chiếu sang hồ sơ Tai Mũi Họng hoặc cúm mùa.
- Tuấn và Huy thống nhất dùng `cough_productive_sputum` ở mức 0.3 để biểu diễn “sau ho có đờm” trong mục 3.1.1. Catalog mô tả mã này là “Ho khạc đờm mạn tính hoặc đờm nhầy mủ”. Đoạn trích chỉ xác nhận có đờm, chưa xác nhận tính mạn hay đờm nhầy mủ.
- author: "Tuan"
- cross_reviewer: "Huy"
- Huy xác nhận giữ song song hai hồ sơ J00, tám quan hệ hỗ trợ, trích dẫn về triệu chứng toàn thân và cơ năng, và 0 then chốt.
- review_status: PENDING_CROSS_REVIEW
- CHƯA RÀ LÂM SÀNG. Chờ bác sĩ TMH hoặc người phụ trách mã hóa ICD xác nhận: (1) dùng chung J00 cho hai hồ sơ có phù hợp quy ước mã hóa không; (2) ranh giới giữa hai hồ sơ khi cùng xuất hiện.

## excerpt: cam_lanh_thong_thuong_lam_sang

- Triệu chứng toàn thân: có thể chỉ sốt vừa 38°C -39°C nhưng cũng có khi sốt cao 40°C ở trẻ em, ớn lạnh, nhức đầu, đau mình mẩy, mệt mỏi, chán ăn, không làm việc được…
- Triệu chứng cơ năng: nuốt đau, đau nhói lan lên tai, ho kích thích, lúc đầu ho khan, sau ho có đờm, thường có ngạt mũi, chảy mũi nước, lúc đầu trong nhầy, sau đục. Tiếng nói mất trong hay khàn nhẹ…
