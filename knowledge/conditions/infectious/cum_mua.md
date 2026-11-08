---
schema: okf_condition_v1
condition_code: cum_mua
name_vi: Cúm mùa
name_en: Seasonal influenza
icd10_code: J11.1
disease_group: infectious
description: Chỉ đạo biên soạn Chủ biên Tham gia biên soạn CHẨN ĐOÁN VÀ ĐIỀU TRỊ CÚM MÙA (Ban hành kèm
  theo Quyết định số 1840/QĐ-BYT ngày 03/06/2025) Cúm mùa (Seasonal Influenza) là một bệnh nhiễm trùng
  hô hấp cấp tính do những chủng vi rút cúm đang lưu hành (A/H1N1; A/H3N2; B). Bệnh lây truyền qua đường
  hô hấp, chủ yếu qua giọt bắn hô hấp hoặc qua tiếp xúc với các bề mặt bị nhiễm vi rút.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: myalgia_arthralgia
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: rhinorrhea_nasal_congestion
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: tachypnea_accessory_muscle_retractions
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: dyspnea_chronic_exertional
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: avian_influenza_rapid_ards_pneumonia
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: chest_tightness_pleuritic_pain
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: nausea_vomiting_diarrhea
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: epidemiological_exposure_vector_travel
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: sore_throat_dysphagia
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: chills_rigors
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: headache_dull
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
- symptom_code: fatigue_malaise
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
excerpts:
- excerpt_key: cum_mua_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Cúm mùa
  source_key: moh_qd_1840_2025
  source_edition: Quyết định số 1840/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 1840/QĐ-BYT)
- excerpt_key: cum_mua_moh_qd_5642_2015
  title: Tiêu chuẩn chẩn đoán lâm sàng Bệnh cúm mùa (Quyết định số 5642/QĐ-BYT)
  source_key: moh_qd_5642_2015
  source_edition: Quyết định số 5642/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5642/QĐ-BYT)
---

## excerpt: cum_mua_chan_doan
- Bệnh cảnh lâm sàng:
- CHẨN ĐOÁN VÀ ĐIỀU TRỊ CÚM MÙA (Ban hành kèm theo Quyết định số 1840/QĐ-BYT ngày 03/06/2025)
- Biểu hiện lâm sàng thường gặp
- Thời gian ủ bệnh thường từ 1 đến 4 ngày.
- Khởi phát thường đột ngột với sốt, ớn lạnh, đau đầu, đau cơ, mệt mỏi.
- Ho khan, đau họng, nghẹt mũi hoặc chảy nước mũi.
- Ở trẻ em có thể gặp triệu chứng buồn nôn, nôn, hoặc tiêu chảy.
- Triệu chứng có thể không điển hình ở người lớn > 65 tuổi.
- Phần lớn các người bệnh nhiễm cúm mùa chỉ sốt trong 3 đến 5 ngày, ho có thể kéo dài hơn và tự hồi phục. Tuy nhiên một số người bệnh có thể tiến triển thành cúm nặng.
- Biểu hiện viêm phổi: Đau tức ngực khó thở tăng dần. Có thể có biểu hiện tình trạng suy hô hấp cấp tiến triển nhanh, thậm chí biểu hiện sốc và suy đa cơ quan nếu không được phát hiện và điều trị kịp thời.
- Đợt bùng phát của các bệnh lý mạn tính (như COPD, Hen, Suy tim): Những người bệnh có bệnh lý nền khi nhiễm cúm ngoài biểu hiện cúm có thể biểu hiện những đợt tiến triển nặng của bệnh nền đang có.
- Phân độ lâm sàng bệnh
- Cúm nhẹ: Người bệnh chỉ có triệu chứng của đường hô hấp trên, không có bất kỳ biểu hiện nào của cúm nặng.
- Biểu hiện suy hô hấp: Khó thở, thở nhanh, thở gắng sức hoặc cần hỗ trợ hô hấp để đảm bảo mục tiêu SpO2 > 95%.
- Biểu hiện suy các cơ quan khác: rối loạn tri giác, sốc, hoặc suy đa cơ quan khác.
- Các yếu tố nguy cơ nhiễm cúm nặng: Khai thác, đánh giá các yếu tố nguy cơ nhiễm nặng, bao gồm:
- Tuổi cao > 65 tuổi.
- Có tình trạng suy giảm miễn dịch.
- Có bệnh nền: Bệnh tim mạch mãn tính, Bệnh phổi mãn tính, Suy thận, Xơ gan, tiểu đường…
- Trẻ em < 5 tuổi (nhất là < 2 tuổi).

## excerpt: cum_mua_moh_qd_5642_2015
- Có yếu tố dịch tễ: sống hoặc đến từ khu vực có bệnh cúm lưu hành hoặc có tiếp
- Lâm sàng: có các triệu chứng như nêu trên.
- Xét nghiệm dương tính với virus cúm bằng kỹ thuật RT-PCR hoặc real time
- Cúm chưa có biến chứng (cúm nhẹ)
- Lâm sàng có biểu hiện hội chứng cúm đơn thuần.
- Cúm có biến chứng (cúm nặng)
- Là ca bệnh có biểu hiện lâm sàng như trên hoặc ca bệnh đã được chẩn đoán xác
- Có tổn thương ở phổi với biểu hiện suy hô hấp trên lâm sàng (thở nhanh, khó
- Có các biến chứng thứ phát như viêm xoang, viêm phổi do bội nhiễm vi khuẩn,
- Có các dấu hiệu nặng lên của các bệnh lý mạn tính kèm theo (bệnh phổi, bệnh
- Trẻ em: dưới 5 tuổi, suy dinh dưỡng, béo phì, hen phế quản hoặc bị suy giảm
- Người già trên 65 tuổi.
- Phụ nữ có thai.
- Người lớn mắc các bệnh mạn tính.
- Suy giảm miễn dịch (người bệnh đang điều trị thuốc chống ung thư, HIV/AIDS).
- Lâm sàng
- Sốt (thường trên 380C), đau nhức cơ toàn thân và có một trong số các biểu hiện
- về hô hấp như đau họng, hắt hơi, ngạt mũi, chảy nước mũi, ho, khó thở.
- Hình ảnh chụp XQ phổi bình thường hoặc có tổn thương thâm nhiễm lan tỏa
