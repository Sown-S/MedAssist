---
schema: okf_condition_v1
condition_code: soi
name_vi: Sởi
name_en: Sởi
icd10_code: B05
disease_group: infectious
description: Bệnh sởi là bệnh truyền nhiễm gây dịch lây qua đường hô hấp do vi rút
  sởi gây nên. Bệnh chủ yếu gặp ở trẻ em dưới 5 tuổi, hay xảy ra vào mùa đông xuân,
  có thể xuất hiện ở người lớn do chưa được tiêm phòng hoặc đã tiêm phòng nhưng chưa
  được tiêm đầy đủ.
relations:
- symptom_code: fever_high
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
- symptom_code: fever_low_grade
  polarity: SUPPORTS
  weight: 0.75
  is_key: false
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
- symptom_code: lymphadenopathy_splenomegaly
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
- symptom_code: koplik_spots
  polarity: SUPPORTS
  weight: 0.98
  is_key: true
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
- symptom_code: maculopapular_rash
  polarity: SUPPORTS
  weight: 0.94
  is_key: true
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
- symptom_code: conjunctivitis_uveitis_red_eye
  polarity: SUPPORTS
  weight: 0.8
  is_key: false
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.85
  is_key: true
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
- symptom_code: rhinorrhea_nasal_congestion
  polarity: SUPPORTS
  weight: 0.8
  is_key: true
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
excerpts:
- excerpt_key: soi_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Sởi
  source_key: moh_qd_1327_2014
  source_edition: Quyết định số 1327/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 1327/QĐ-BYT)
---

## excerpt: soi_chan_doan
- Giai đoạn ủ bệnh: 7-21 ngày (trung bình 10 ngày).
- Giai đoạn khởi phát (giai đoạn viêm long): 2-4 ngày. Người bệnh sốt cao, viêm long đường hô hấp trên và viêm kết mạc, đôi khi có viêm thanh quản cấp, có thể thấy hạt Koplik là các hạt nhỏ có kích thước 0,5-1 mm màu trắng/xám có quầng ban đỏ nổi gồ lên trên bề mặt niêm mạc má (phía trong miệng, ngang răng hàm trên).
- Giai đoạn toàn phát: Kéo dài 2-5 ngày. Thường sau khi sốt cao 3-4 ngày người bệnh bắt đầu phát ban, ban hồng dát sẩn, khi căng da thì ban biến mất, xuất hiện từ sau tai, sau gáy, trán, mặt, cổ dần lan đến thân mình và tứ chi, cả ở lòng bàn tay và gan bàn chân. Khi ban mọc hết toàn thân thì thân nhiệt giảm dần.
- Giai đoạn hồi phục: Ban nhạt màu dần rồi sang màu xám, bong vảy phấn sẫm màu, để lại vết thâm vằn da hổ và biến mất theo thứ tự như khi xuất hiện. Nếu không xuất hiện biến chứng thì bệnh tự khỏi. Có thể có ho kéo dài 1-2 tuần sau khi hết ban.
- Biểu hiện lâm sàng có thể sốt nhẹ thoáng qua, viêm long nhẹ và phát ban ít, toàn trạng tốt. Thể này dễ bị bỏ qua, dẫn đến lây lan bệnh mà không biết.
- Người bệnh cũng có thể sốt cao liên tục, phát ban không điển hình, phù nề tứ chi, đau mỏi toàn thân, thường có viêm phổi nặng kèm theo.
- Công thức máu thường thấy giảm bạch cầu, giảm bạch cầu lympho và có thể giảm tiểu cầu.
- Xquang phổi có thể thấy viêm phổi kẽ. Có thể tổn thương nhu mô phổi khi có bội nhiễm.
