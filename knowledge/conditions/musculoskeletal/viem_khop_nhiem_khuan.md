---
schema: okf_condition_v1
condition_code: viem_khop_nhiem_khuan
name_vi: Viêm khớp nhiễm khuẩn
name_en: Septic arthritis
icd10_code: M00.9
disease_group: musculoskeletal
description: Viêm khớp nhiễm khuẩn hay viêm khớp sinh mủ (pyogenic/ suppurative arthritis)
  là viêm khớp do vi khuẩn sinh mủ không đặc hiệu (không phải do lao, phong, nấm,
  ký sinh trùng hay virus) gây nên.
relations:
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: skin_cellulitis_pus_abscess
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.7
  is_key: false
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
excerpts:
- excerpt_key: viem_khop_nhiem_khuan_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Viêm khớp nhiễm khuẩn
  source_key: moh_qd_361_2014
  source_edition: Quyết định số 361/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 361/QĐ-BYT)
---

## excerpt: viem_khop_nhiem_khuan_chan_doan
- Thường xảy ra cấp tính, gồm hai bệnh cảnh viêm khớp nhiễm khuẩn không phải
- Viêm khớp nhiễm khuẩn không do lậu cầu: thường xảy ra ở một khớp đơn
- Triệu chứng tại khớp: sưng nóng đỏ đau, có thể tràn dịch khớp, co cơ, hạn chế
- Hội chứng nhiễm trùng: sốt, kèm rét run, môi khô, lưỡi bẩn, hơi thở hôi.
- Nhiễm khuẩn khớp do lậu cầu: có hai bệnh cảnh lâm sàng trong nhiễm trùng
- Hội chứng nhiễm khuẩn lậu cầu phát tán: sốt, rét run, ban đỏ và mụn mủ
- ngoài da cùng các triệu chứng viêm khớp, triệu chứng tại bộ phận sinh dục như đái buốt,
- đái rắt, đái máu- mủ… Viêm nhiều khớp nhỏ có tính chất di chuyển kèm viêm bao hoạt
