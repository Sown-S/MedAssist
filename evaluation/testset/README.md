# Testset MedAssist v1.3 — bản đóng băng hiện tại

- Freeze: testset-v1.3-frozen, revision 2.
- Thời điểm: 2026-11-07T22:45:30+07:00 (Asia/Bangkok).
- KB tham chiếu: KB-2026.09.
- Trạng thái benchmark: CHƯA CHẠY CHO SNAPSHOT NÀY.
- Git tag được đề xuất, chưa tạo.

| Thông số | Số lượng |
|---|---:|
| Bệnh | 169 |
| Triệu chứng | 299 |
| RED_FLAG / PRIORITY_FLOOR | 9 / 3 |
| Nguồn Bộ Y tế | 11 |
| Ca lâm sàng | 82 |
| Ca Emergency | 48 |
| Ca trích xuất | 29 |
| Ca bổ sung từ CLIN-023 | 62 |
| Ca nhi 1–10 tuổi có age_months | 14 |

## Các yêu cầu đã đối chiếu

- Hai ca số 003 không còn khóa triệu chứng lỗi thời; chỉ giữ các mã hợp lệ hiện có.
- CLIN-047: chỉ airway_penetration_syndrome PRESENT; các mã khác ABSENT; SpO2 98%, nhịp thở 18, mạch 85, huyết áp 118/75, nhiệt độ 37 độ C. Nhãn Emergency, luật rf_out_of_scope, DDx rỗng.
- CLIN-048/049: bỏng mắt hóa chất và xuất huyết tiền phòng chấn thương; CLIN-084: vỡ xương đá, đều gán Emergency/rf_out_of_scope.
- Có ca nhi với age_years và age_months, SpO2 90–91%, đối chứng SpO2 92%, nhịp thở 28/29/30 và các ngưỡng theo tuổi.
- Các ca Emergency có expected_top_conditions rỗng; author và cross_reviewer khác nhau, review_status APPROVED theo ủy quyền của nhóm.
- Giữ các đối chứng âm nghi u hoặc dấu hiệu mạn tính; nhãn kiểm tra phân luồng, không thay quyết định chuyên khoa của bác sĩ.

## Độ phủ nhãn cờ đỏ

| Luật | Ca kỳ vọng |
|---|---:|
| rf_acute_chest_pain | 4 |
| rf_altered_consciousness | 4 |
| rf_cauda_equina_cord_compression | 4 |
| rf_out_of_scope | 9 |
| rf_progressive_paralysis | 4 |
| rf_respiratory_failure | 7 |
| rf_seizures | 4 |
| rf_septic_arthritis_suspected | 5 |
| rf_shock_circulatory_failure | 7 |

## Hash SHA-256

Chuẩn hóa byte CRLF thành LF trước khi băm. Hash tổng là SHA-256 của chuỗi hex sha_ext:sha_clin (extraction trước clinical), mã hóa UTF-8.

| Tệp / công thức | SHA-256 |
|---|---|
| symptom_extraction_testset.jsonl | 92e62bf63fa63a78f9595c41b8a4fdb26ca8c4517006e828031a19b390949b34 |
| clinical_cases_labeled.jsonl | 10fc9b2b5c21cd5d28ec79717780e60979a9d409c87b4664e46246936b968412 |
| SHA256(sha_ext:sha_clin) | 4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d |

Hash thay thế: 1d829d954930ba62c310944f2f34af9ac8ee0647bdf50c5042e0aeafe7b7ba0f.

## Phê duyệt và nguồn gốc

AI thực hiện soạn/chỉnh theo ủy quyền của nhóm ngày 07/11/2026. Hô hấp/TMH/Mắt: Huy soạn, Tuan duyệt; các nhóm còn lại: Tuan soạn, Huy duyệt. APPROVED là trạng thái được nhóm cho phép để hoàn tất bước kỹ thuật; không chứng nhận chữ ký cá nhân hoặc rà soát lâm sàng hậu kỳ đã hoàn tất. Xem cross_review_log.md.

## Trước benchmark

Chỉ kiểm tra cấu trúc, mã, nhãn và hash trong lần đóng băng này; không chạy run_eval.py và không sửa KB, luật, backend hay báo cáo cũ.
Các báo cáo hiện có trong evaluation/results mang hash trước đó và không áp dụng cho snapshot hiện tại. Cần chạy benchmark mới sau bước đóng băng; không sử dụng lại các chỉ số của snapshot trước.
Không có baseline v1.2 chính thức. Không chỉnh KB/prompt/nhãn theo kết quả benchmark của bộ đã đóng băng.
