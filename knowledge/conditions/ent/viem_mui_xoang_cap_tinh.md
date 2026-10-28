---
schema: okf_condition_v1
condition_code: viem_mui_xoang_cap_tinh
name_vi: Viêm mũi xoang cấp tính
name_en: Viêm mũi xoang cấp tính
icd10_code: J01.9
disease_group: ent
description: 'Viêm mũi xoang được hiểu theo nghĩa rộng là viêm mũi và các xoang cạnh
  mũi, gây ra một nhóm các rối loạn. Phân loại viêm mũi xoang theo thời gian bị viêm
  gồm có: cấp tính (từ 4 tuần trở lại), bán cấp tính (4-12 tuần) và mạn tính (trên
  12 tuần).'
relations:
- symptom_code: nasal_obstruction_stuffiness
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: facial_sinus_pain_anosmia
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: epistaxis_nasal_bleeding
  polarity: SUPPORTS
  weight: 0.88
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: rhinorrhea_nasal_congestion
  polarity: SUPPORTS
  weight: 0.86
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
excerpts:
- excerpt_key: viem_mui_xoang_cap_tinh_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Viêm mũi xoang cấp tính
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5643/QĐ-BYT)
---

## excerpt: viem_mui_xoang_cap_tinh_chan_doan
- Chẩn đoán hình ảnh:
- Chụp cắt lớp vi tính (CT Scanner) là phương pháp đang được lựa chọn
- trong chẩn đoán viêm mũi xoang. Tuy nhiên hình ảnh trong viêm mũi xoang cấp tính
- Chụp cộng hưởng từ (MRI) của xoang thường ít được thực hiện hơn CT
- Xét nghiệm:
- Xét nghiệm không thực sự có giá trị trong việc đánh giá viêm mũi xoang cấp tính.
- Tuy nhiên trong một số trường hợp viêm mũi xoang cấp tính cũng cần tiến hành một số
- Viêm mũi xoang cấp tính cần chẩn đoán phân biệt với nhiều bệnh khác gồm có:
