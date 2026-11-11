# Testset MedAssist v1.3 — bản đóng băng hiện tại

- Freeze: testset-v1.3-frozen, revision 2.
- Thời điểm: 2026-11-07T22:45:30+07:00 (Asia/Bangkok).
- KB tham chiếu hiện tại: KB-2026.10 (khi đóng băng ban đầu: KB-2026.09).
- Đã chạy RuleOnly trên bản sao staging ngày 08/11/2026; Full với mô hình thật chưa chạy. Xem mục cập nhật bên dưới.
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

## Cập nhật ngày 08/11/2026

Các ghi chú trong mục "Trước benchmark" mô tả thời điểm đóng băng ban đầu. Hai thư mục báo cáo snapshot 81 ca đã được xóa theo yêu cầu; không còn dùng làm bằng chứng cho snapshot hiện tại.

Người phụ trách xác nhận **chưa hoàn tất rà soát chéo thực tế**. `review_basis` đã được sửa để phản ánh đúng trạng thái này. `APPROVED` trong dữ liệu đóng băng là trạng thái kỹ thuật theo ủy quyền; không chứng nhận phê duyệt lâm sàng.

- Bản sao kiểm thử: `medassist_kb202610_stage_20261108`. Nạp KB-2026.10 và retire 43 quan hệ trên bản sao: 1.787 → 1.744 quan hệ Active; 169 bệnh, 299 triệu chứng, 12 luật. Kiểm tra so sánh với kho trên đĩa không còn thay đổi hoặc mục thiếu.
- CSDL nguồn `medassist` không bị sửa, vẫn có 1.787 quan hệ Active ở lần kiểm tra này. Chưa triển khai thay đổi vào CSDL đang chạy.
- Tài khoản duyệt trên staging là tài khoản kiểm thử riêng; không đại diện Tuấn/Huy hoặc phê duyệt lâm sàng.
- RuleOnly: 82 ca, phát hiện đủ 48/48 Emergency, 0 báo động nhầm, mức ưu tiên đúng 82/82; DDx top-1 83,3%, top-3 94,4% trên **18 ca có nhãn DDx**. Không dùng kết quả này để tuyên bố đã đánh giá đầy đủ 169 bệnh.
- Full với mô hình thật chưa chạy: cấu hình tại thời điểm kiểm tra là `fake`, dịch vụ Ollama chưa truy cập được. Không có kết quả Full thật hoặc trích xuất mới.
- `benchmark_status` trong manifest vẫn giữ giá trị lịch sử `NOT_RUN_FOR_THIS_SNAPSHOT`; phạm vi sửa manifest chỉ cho phép `kb_release` và `review_basis`. Trạng thái thực nghiệm mới được ghi tại đây, không suy diễn trạng thái đó thành "chưa có kết quả RuleOnly".

Bằng chứng: [báo cáo RuleOnly](../results/kb_2026_10_acceptance/rule_only/summary.md), [đối soát staging trước/sau](../results/kb_2026_10_acceptance/staging_acceptance.json), [kết quả rà soát và phép thử riêng](../results/kb_2026_10_acceptance/kb_checks.json).

Hai tệp JSONL và mã băm đóng băng không thay đổi. Báo cáo chạy bằng backend 0.2.2; đây chưa phải bằng chứng phát hành ứng dụng v0.2.3.

## Cập nhật ngày 11/11/2026 — KB-2026.11

KB tham chiếu theo kho: KB-2026.11, 153 bệnh. Kiểm cả hai JSONL không có tham chiếu tới 16 mã bệnh gỡ; hash vẫn `4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d`. Snapshot manifest cập nhật theo KB; hash/statistics/benchmark_status giữ nguyên.

Đã nhận phiếu Huy và xác nhận Tuấn: 106 ĐỒNG Ý, 5 CẦN SỬA. Ghi nhận rà hoàn tất với vấn đề tồn đọng, không khẳng định toàn bộ ca đạt hay bác sĩ đã duyệt KB. Sửa nhãn thuộc v1.4; luật/trích xuất là việc riêng. Xem `evaluation/review/README_review.md`. RuleOnly chưa chạy tại thời điểm cập nhật; sẽ bổ sung kết quả riêng.

### Kết quả kỹ thuật bổ sung ngày 11/11/2026

RuleOnly KB-2026.11 đã chạy đúng một lần trên staging riêng, LLM_PROVIDER=none, không trích xuất: recall cờ đỏ 48/48, báo nhầm 0, mức ưu tiên 82/82, luật P/R/F1=1/1/1; DDx top-1=15/18, top-3=17/18, bằng các chỉ số đợt .10. Chỉ 18 ca DDx phủ 27/153 bệnh; không chứng minh toàn KB an toàn hoặc đủ độ phủ. Full chưa chạy. Báo cáo: `evaluation/results/kb_2026_11_acceptance/rule_only/so_sanh_voi_KB-2026.10.md`. Hash giữ nguyên, không sửa KB theo kết quả.
