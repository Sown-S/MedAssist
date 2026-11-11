# Bộ phát triển extraction AI-23

`extraction_retrieval_dev_v1.jsonl` gồm 26 ca tổng hợp do Huy/agent chuẩn bị ngày
09/11/2026 để phát triển truy xuất v0.2.4. Không lấy ca từ bộ 29 ca đóng băng.
Tên/mã tham chiếu catalog KB-2026.10; nhãn là giả định phát triển, chưa được rà lâm sàng.

Các trường tương thích đầu vào extraction của `scripts.run_eval`:

- `id`: mã ca phát triển.
- `clinical_note`: lời kể giả lập, không phải dữ liệu bệnh nhân.
- `expected_symptoms`: mã -> PRESENT/ABSENT/UNKNOWN.

Các trường bổ sung dành cho probe truy xuất:

- `expected_mentions`: đoạn nguyên văn và mã kỳ vọng, dùng tính recall theo vị trí.
  Một mã có thể được nhắc nhiều lần; số mention khác số mã duy nhất.
- `tags`: phân nhóm phủ định, không dấu, mã dùng trong luật, lỗi gõ, v.v.

Probe kiểm tất cả mention, kể cả đoạn mà splitter không trả ra; không loại ca lỗi
khỏi mẫu số. Ca `dev-r20` cố ý giữ cách nói thường chưa khớp tên kho để bộc lộ
khoảng trống truy xuất. Hai ca không có triệu chứng dùng cho bước Gemma chọn/bỏ
ứng viên sau này; danh sách truy xuất không phải nhãn dự đoán cuối.

Thông tin ở `dev-r17` là định danh giả phục vụ kiểm che PII. Không dùng bộ này làm
holdout, không sửa bộ frozen theo kết quả phát triển. Khi đổi nhãn/nội dung cần
ghi phiên bản/hash mới trong báo cáo để các lần đo có thể đối chiếu.

`extraction_selection_extra_v1.jsonl` thêm 10 ca tổng hợp cho bước chọn mã một lượt:
mã da liễu/tai mũi họng, mô tả ghép, phủ định, không dấu, UNKNOWN, đoạn hành chính,
chỉ dẫn giả trong lời kể và triệu chứng cuối câu dài. Không lấy từ frozen và không
có `expected_mentions`; chạy cùng 26 ca trên bằng `manual_phrase_selection_probe
--extended`. Nhãn vẫn là giả định phát triển cần rà lâm sàng. Giữ nguyên cả ca
không đạt; không dùng 36 ca đã chỉnh prompt này làm đánh giá độc lập.

`extraction_coordination_dev_v1.jsonl` gồm 10 ca mới ghi trước lượt đo tiếp theo
ngày 09/11: đảo thứ tự triệu chứng, không dấu, ba vế phủ định, vế có khẳng định/
phủ định/không chắc riêng, dấu phẩy, chấm phẩy và tương phản. Dùng để đối chứng
ghép nhóm phạm vi phủ định với không ghép; nhãn tổng hợp chưa rà lâm sàng, không
phải frozen/holdout. Chạy `manual_phrase_selection_probe --cases-file <path>`;
launcher local nhận `-CasesFile server/tests/unit/ai/data/extraction_coordination_dev_v1.jsonl`.
Giữ nguyên nhãn dù kết quả không đạt.
