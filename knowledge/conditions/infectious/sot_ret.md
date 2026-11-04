---
schema: okf_condition_v1
condition_code: sot_ret
name_vi: Sốt rét
name_en: KSTSR
icd10_code: B54
disease_group: infectious
description: 'Bệnh sốt rét là bệnh truyền nhiễm do 5 loài ký sinh trùng Plasmodium
  gây nên gồm Plasmodium falciparum, Plasmodium vivax, Plasmodium malariae, Plasmodium
  ovale và Plasmodium knowlesi. Bệnh lây truyền chủ yếu là do muỗi Anopheles. Bệnh
  thường biểu hiện bằng những cơn sốt rét điển hình với ba triệu chứng: rét run, sốt,
  vã mồ hôi. Bệnh tiến triển có chu kỳ và có hạn định nếu không bị tái nhiễm.'
relations:
- symptom_code: malaria_paroxysmal_rigor_fever_sweat
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: cerebral_malaria_coma_hemoglobinuria
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: sepsis_sirs_organ_dysfunction_hypoperfusion
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: viral_hepatitis_jaundice_dark_urine_ast_alt
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: pulmonary_crackles_rales_consolidation
  polarity: SUPPORTS
  weight: 0.92
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: encephalopathy_delirium_convulsion
  polarity: SUPPORTS
  weight: 0.91
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: cyanosis_hypoxemia_central_peripheral
  polarity: SUPPORTS
  weight: 0.91
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: petechiae_mucosal_bleeding
  polarity: SUPPORTS
  weight: 0.88
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: fever_prolonged
  polarity: SUPPORTS
  weight: 0.86
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: hepatomegaly_right_hypochondriac_tenderness
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: abdominal_distension_borborygmi_pain
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.79
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: epidemiological_exposure_vector_travel
  polarity: SUPPORTS
  weight: 0.78
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: splenomegaly_left_hypochondriac_mass
  polarity: SUPPORTS
  weight: 0.76
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: sweating_profuse
  polarity: SUPPORTS
  weight: 0.72
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.72
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.68
  is_key: false
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
excerpts:
- excerpt_key: sot_ret_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Sốt rét
  source_key: moh_qd_2699_2020
  source_edition: Quyết định số 2699/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 2699/QĐ-BYT)
---

## excerpt: sot_ret_chan_doan
- Đang ở hoặc đã đến vùng sốt rét lưu hành trong thời gian ít nhất 7 ngày hoặc có tiền sử mắc sốt rét.
- Lâm sàng: Khi xuất hiện một trong những triệu chứng dưới đây mà đã loại nguyên nhân khác:
- Trường hợp nghi ngờ sốt rét
- Là những trường hợp có sốt và có yếu tố dịch tễ.
- Người bệnh đang sốt hoặc có tiền sử sốt trong 3 ngày gần đây.
- Có triệu chứng điển hình của cơn sốt rét: rét run, sốt và vã mồ hôi.
- Hoặc có triệu chứng không điển hình của cơn sốt rét: sốt không thành cơn (người bệnh thấy ớn lạnh, gai rét) hoặc sốt cao liên tục, sốt dao động.
- Tất cả các trường hợp nghi ngờ sốt rét đều phải làm xét nghiệm để phát hiện KSTSR. Nếu lần đầu xét nghiệm soi lam âm tính, mà vẫn còn nghi ngờ người bệnh bị sốt rét, thì phải xét nghiệm lam máu thêm 2 - 3 lần cách nhau 8 giờ hoặc vào thời điểm người bệnh đang lên cơn sốt.
- Trường hợp bệnh sốt rét xác định.
- Trường hợp bệnh sốt rét xác định là trường hợp có ký sinh trùng sốt rét trong máu được xác định bằng xét nghiệm lam máu nhuộm Giemsa hoặc xét nghiệm chẩn đoán nhanh phát hiện kháng nguyên hoặc kỹ thuật sinh học phân tử.
- Các kỹ thuật xét nghiệm xác định ký sinh trùng sốt rét bao gồm:
- Kỹ thuật xét nghiệm chẩn đoán nhanh phát hiện kháng nguyên sốt rét (Rapid Diagnostic Tests - RDTs): Được áp dụng để chẩn đoán sốt rét tại các cơ sở y tế và y tế thôn bản, kết quả xét nghiệm ký sinh trùng có thể trả lời trong vòng 30 phút.
- Kỹ thuật xét nghiệm lam máu nhuộm Giemsa: là kỹ thuật phổ biến trong phát hiện ký sinh trùng sốt rét ở các cơ sở y tế, kết quả xét nghiệm ký sinh trùng có thể trả lời trong vòng 1 giờ.
- Kỹ thuật sinh học phân tử: Kỹ thuật xác định gen của ký sinh trùng sốt rét trong máu. Có thể áp dụng ở những nơi có đủ điều kiện kỹ thuật.
- Các xét nghiệm khác: Huyết học, sinh hóa, nước tiểu. Đối với bệnh nhân P. vivax nên làm thêm xét nghiệm định lượng G6PD hoặc định tính nếu cơ sở y tế đó không làm được định lượng.
- Các thể lâm sàng.
- Sốt rét thể thông thường (chưa biến chứng)
- Sốt rét chưa biến chứng là trường hợp mắc sốt rét xác định, không có dấu hiệu đe dọa tính mạng người bệnh, có thể có triệu chứng lâm sàng hoặc không.
- Triệu chứng lâm sàng.
- Cơn sốt điển hình có 3 giai đoạn: rét run - sốt - vã mồ hôi.
