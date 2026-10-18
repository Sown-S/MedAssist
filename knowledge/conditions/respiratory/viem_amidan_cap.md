---
schema: okf_condition_v1
condition_code: viem_amidan_cap
name_vi: Viêm amidan cấp
name_en: Acute tonsillitis
icd10_code: J03.9
disease_group: respiratory
description: Tình trạng viêm xung huyết hoặc xuất tiết mủ cấp tính của amidan khẩu
  cái do vi rút hoặc vi khuẩn, đặc trưng bởi sốt cao, đau họng, nuốt đau và sưng đau
  hạch góc hàm.
relations:
- symptom_code: odynophagia_tonsillar_exudate
  polarity: SUPPORTS
  weight: 0.95
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: sore_throat
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.65
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
- symptom_code: rhinorrhea_clear
  polarity: CONTRADICTS
  weight: 0.4
  is_key: false
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
excerpts:
- excerpt_key: viem_amidan_cap_chan_doan
  title: Tiêu chuẩn gợi ý Viêm amidan cấp
  source_key: moh_noi_khoa_2023
  source_edition: Quyết định số 4817/QĐ-BYT
  source_locator: Mục Chẩn đoán Viêm amidan cấp
---

## excerpt: viem_amidan_cap_chan_doan
- Khởi phát đột ngột với sốt cao 38.5°C - 39.5°C, rét run, đau rát họng nhiều và nuốt đau nhói lên tai.
- Khám thực thể thấy hai amidan sưng to, niêm mạc đỏ rực, bề mặt có thể có chấm mủ trắng hoặc giả mạc dễ bóc.
- Thường sờ thấy hạch góc hàm hai bên sưng nhẹ và ấn đau.
