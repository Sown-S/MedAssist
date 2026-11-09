---
schema: okf_condition_v1
condition_code: lao_thanh_quan
name_vi: Lao thanh quản
name_en: Laryngeal tuberculosis
icd10_code: A15.5
disease_group: ent
description: Lao thanh quản là bệnh viêm thanh quản đặc hiệu do vi trùng lao (Mycobacterium tuberculosis).
  Lao thanh quản (LTQ) là một thể lao ngoài phổi thứ phát sau lao sơ nhiễm, bệnh tích khu trú ở thanh
  quản. Tỷ lệ mắc LTQ đứng hàng thứ 4-5 trong nhóm bệnh lý lao ngoài phổi, nguy cơ lây nhiễm cao, di chứng
  lao thanh quản để lại là ảnh hưởng đến giọng nói, nuốt và thở.
relations:
- symptom_code: hoarseness_dysphonia_stridor
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: laryngeal_tuberculosis_monochorditis
  polarity: SUPPORTS
  weight: 0.9
  is_key: true
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: cough_dry
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: voice_pitch_timbre_alteration
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: laryngeal_paresthesia_throat_clearing
  polarity: SUPPORTS
  weight: 0.6
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: anemia_pallor_jaundice
  polarity: SUPPORTS
  weight: 0.3
  is_key: false
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
- symptom_code: weight_loss_anorexia
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
- excerpt_key: lao_thanh_quan_chan_doan
  title: Tiêu chuẩn chẩn đoán lâm sàng Lao thanh quản
  source_key: moh_qd_5643_2015
  source_edition: Quyết định số 5643/QĐ-BYT
  source_locator: Mục Chẩn đoán lâm sàng (Quyết định số 5643/QĐ-BYT)
---

## excerpt: lao_thanh_quan_chan_doan
- Triệu chứng lâm sàng: ho, khàn tiếng, khó thở, nuốt đau.
- Soi thanh quản: phát hiện hình thái tổn thương thanh quản: sùi, loét, phù nề.
- Những triệu chứng toàn thân: sốt về chiều, gầy sút thường phụ thuộc vào thương
- tổn ở phổi, LTQ thể đơn thuần ít có các triệu chứng toàn thân.
- Khởi đầu của LTQ dễ nhầm với viêm thanh quản xuất tiết thông thường. Những
- triệu chứng cơ năng hay gặp là:
- Khàn tiếng: xuất hiện sớm, lúc đầu khàn nhẹ âm sắc mờ sau đó mất âm sắc
- uối cùng thì tiếng nói mất hẳn. Đây là triệu chứng thường gặp nhất trong LTQ.
- Nuốt vướng, đau: phụ thuộc vào vị trí tổn thương. Tổn thương vùng sụn phễu
- và mép sau gây nên nuốt đau. Đau tăng lên khi ăn, uống rượu, khi ho hoặc nói.
- Khó thở: xuất hiện muộn, bệnh nhân thường chỉ khó thở nặng ở giai đoạn
- Ho: thường do bệnh tích ở phổi. Tuy nhiên, ho có những đặc điểm sau đây thì
- phải nghĩ đến bệnh lý ở thanh quản: bệnh nhân đằng hắng nhiều, ho khan, ho từng cơn,
- ó khi ho rũ như ho gà.
- optic 700 hay soi bằng ống mềm hoặc qua soi thanh quản trực tiếp. Các triệu chứng thấy
- Giai đoạn đầu: thường không đặc hiệu, niêm mạc thanh quản đỏ hồng, hai
- ây thanh sung huyết giống viêm thanh quản thông thường. Khoảng vài ngày sau, một
- ên thanh quản đã trở lại gần như bình thường còn dây thanh đối diện vẫn viêm. Một
- nửa thanh quản còn sung huyết nhẹ và bệnh nhân vẫn khàn tiếng. Sự thoái triển không
- ân đối bệnh tích thanh quản có ý nghĩa lớn, đó là triệu chứng khởi phát LTQ.
