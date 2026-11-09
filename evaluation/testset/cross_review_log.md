# Biên bản đóng băng testset v1.3

Thời điểm: 2026-11-07T22:45:30+07:00. Revision 2, freeze_version testset-v1.3-frozen, KB-2026.09.

## Căn cứ phê duyệt

**Đính chính hiện hành — 08/11/2026:** Người phụ trách xác nhận chưa hoàn tất rà soát chéo thực tế giữa Tuấn và Huy. Mọi ghi chú APPROVED bên dưới chỉ phản ánh ủy quyền đóng băng kỹ thuật tại thời điểm lập biên bản. Manifest đã được sửa `review_basis` cho đúng; không bổ sung chữ ký, ngày duyệt lâm sàng hoặc xác nhận chuyên môn chưa xảy ra. KB tham chiếu hiện tại là KB-2026.10; nhãn KB-2026.09 ở đầu biên bản là lịch sử đóng băng.

Theo ủy quyền chính thức trong cuộc trao đổi ngày 07/11/2026: cho phép AI soạn, phân công Tuan/Huy theo nhóm bệnh và đặt review_status APPROVED để chốt dữ liệu; nhóm lâm sàng rà soát hậu kỳ.
APPROVED thể hiện quy trình được nhóm ủy quyền, không phải chữ ký cá nhân được tự tạo.

| Chuyên khoa | Người được giao soạn | Người được giao duyệt |
|---|---|---|
| Hô hấp, TMH, Mắt | Huy | Tuan |
| Truyền nhiễm, Cơ xương khớp, Da liễu | Tuan | Huy |

- Ký xác nhận hậu kiểm của Tuan: chưa có bằng chứng chữ ký cá nhân.
- Ký xác nhận hậu kiểm của Huy: chưa có bằng chứng chữ ký cá nhân.

## Lần chốt hiện tại, trước benchmark

- Khi bắt đầu đã có 81 ca lâm sàng, 47 Emergency và 29 ca trích xuất; không quay lại bản 20 ca hoặc tạo trùng ID.
- Kiểm tra hai ca số 003 và toàn bộ JSONL: không còn khóa triệu chứng lỗi thời; không suy diễn thêm triệu chứng thay thế.
- Hiệu chỉnh CLIN-047 theo ca giả lập được yêu cầu: người lớn, chỉ mã hội chứng xâm nhập PRESENT, SpO2 98%, nhịp thở 18, các mã khác ABSENT; nhãn Emergency/rf_out_of_scope.
- Thêm CLIN-084 cho mã vỡ xương đá; giữ các ca bỏng mắt hóa chất và xuất huyết tiền phòng chấn thương.
- Bổ sung age_months cho ca nhi; làm rõ một số mô tả đau ngực lan tay/vã mồ hôi, Glasgow 12, liệt tiến triển, co giật kéo dài và sốc theo yêu cầu mới.
- Giữ nhãn DDx rỗng ở mọi ca Emergency. Kiểm tra tất cả author/cross_reviewer khác nhau, review_status APPROVED.
- Tổng 82 ca lâm sàng, 48 Emergency, 29 ca trích xuất; phủ 9/9 luật cờ đỏ.
- Không sửa luật, trọng số hoặc các trường hợp dựa vào lỗi benchmark; lần này chỉ điều chỉnh theo chỉ thị mới của người dùng và kiểm tra cấu trúc trước khi đánh giá.

## Mã băm

| Nội dung | SHA-256 |
|---|---|
| Extraction | 92e62bf63fa63a78f9595c41b8a4fdb26ca8c4517006e828031a19b390949b34 |
| Clinical | 10fc9b2b5c21cd5d28ec79717780e60979a9d409c87b4664e46246936b968412 |
| Combined: SHA256(sha_ext:sha_clin) | 4e7b58cffc3cd950e1411a131919e36976ea94f209c426821886b03708cd368d |

Chuẩn hóa CRLF thành LF. Tag đề xuất testset-v1.3-frozen; chưa tạo tag Git.

## Lịch sử và hiệu lực báo cáo

Snapshot trước mang hash 1d829d954930ba62c310944f2f34af9ac8ee0647bdf50c5042e0aeafe7b7ba0f, có 81 ca lâm sàng/47 Emergency. Các báo cáo RuleOnly và Full giả lập đã có trong evaluation/results chỉ phản ánh snapshot đó.
Snapshot hiện tại mang hash mới nêu trên và CHƯA ĐƯỢC BENCHMARK. Các báo cáo cũ được giữ nguyên, không dùng làm bằng chứng nghiệm thu cho lần chốt này.
Quy ước phân công/ủy quyền phê duyệt không thay đổi. Rà soát lâm sàng hậu kỳ và chữ ký cá nhân vẫn chưa được xác nhận hoàn tất.

## Bảng phân công từng ca

### Bổ sung kiểm nghiệm kỹ thuật ngày 08/11/2026

Đã chạy RuleOnly trên bản sao staging sau khi retire đúng 43 quan hệ. Chi tiết và đường dẫn bằng chứng ở [README](README.md#cập-nhật-ngày-08112026). Những câu "chưa benchmark" và "báo cáo cũ được giữ nguyên" trong mục lịch sử phía trên không còn mô tả trạng thái hiện hành. CSDL nguồn chưa được cập nhật.

Đã thử 14 đầu vào tổng hợp, mỗi đầu vào chỉ có một mã triệu chứng đặc hiệu PRESENT, phủ 43 cặp quan hệ đã bị loại. Sau dọn, cả 14 phép thử đều có bệnh thuộc nhóm chủ sở hữu đã duyệt đứng đầu và không còn bệnh từng bị gắn nhầm trong danh sách ứng viên. Đây là kiểm hồi quy kỹ thuật, không phải ca lâm sàng và không thuộc testset v1.3. Kết quả trước/sau nằm trong `staging_acceptance.json`.

Phép rà tên bệnh từ metadata, ngoài danh sách tiền tố cố định, đã xuất **434 quan hệ cần xem xét** trong `kb_checks.json`. Đây là ứng viên từ so khớp chuỗi, có thể có dương tính giả và bỏ sót; không được gọi là 434 lỗi hay tự động xóa. Danh sách 30 bệnh không có key cũng nằm trong báo cáo để chuyên môn xem xét; không tự thêm key cho đủ số.

**Bàn giao Sơn/Huy:** triển khai bộ hồi quy trong khu vực backend/AI được phân công và đưa vào CI qua PR được duyệt; tái sử dụng 14 phép thử và 43 cặp trong báo cáo staging. Kiểm tra phải phát hiện việc thêm lại liên kết sai, kiểm hash từ nội dung thực tế, công bố số ca DDx được tính và dừng benchmark khi snapshot CSDL thay đổi. Tự động phát hiện tên bệnh chỉ lập danh sách cho người duyệt, không quyết định quan hệ sai. Các script/test và thay đổi CI thử tạo trong phiên này đã được thu hồi vì vượt phạm vi nhánh tri thức; chưa có kiểm tự động mới được cài vào repo.

**Bàn giao phát hành:** chưa cập nhật CSDL nguồn hoặc tạo tag. Cần hoàn tất rà soát thực tế, có người phụ trách CSDL xác nhận tài khoản duyệt và kế hoạch triển khai; Sơn/nhóm phát hành xử lý phiên bản backend, client và tag theo CONTRIBUTING.md. Không dùng tài khoản staging để duyệt trên CSDL nguồn.

### Phân công tại thời điểm đóng băng

| Ca | Người được giao soạn | Người được giao duyệt | Trạng thái theo ủy quyền |
|---|---|---|---|
| CLIN-001 | Tuan | Huy | APPROVED |
| CLIN-002 | Tuan | Huy | APPROVED |
| CLIN-003 | Tuan | Huy | APPROVED |
| CLIN-004 | Tuan | Huy | APPROVED |
| CLIN-005 | Huy | Tuan | APPROVED |
| CLIN-006 | Huy | Tuan | APPROVED |
| CLIN-007 | Huy | Tuan | APPROVED |
| CLIN-008 | Tuan | Huy | APPROVED |
| CLIN-009 | Tuan | Huy | APPROVED |
| CLIN-010 | Tuan | Huy | APPROVED |
| CLIN-011 | Tuan | Huy | APPROVED |
| CLIN-013 | Tuan | Huy | APPROVED |
| CLIN-014 | Tuan | Huy | APPROVED |
| CLIN-015 | Tuan | Huy | APPROVED |
| CLIN-017 | Huy | Tuan | APPROVED |
| CLIN-018 | Huy | Tuan | APPROVED |
| CLIN-019 | Tuan | Huy | APPROVED |
| CLIN-020 | Tuan | Huy | APPROVED |
| CLIN-021 | Huy | Tuan | APPROVED |
| CLIN-022 | Huy | Tuan | APPROVED |
| CLIN-023 | Huy | Tuan | APPROVED |
| CLIN-024 | Huy | Tuan | APPROVED |
| CLIN-025 | Huy | Tuan | APPROVED |
| CLIN-026 | Huy | Tuan | APPROVED |
| CLIN-027 | Tuan | Huy | APPROVED |
| CLIN-028 | Tuan | Huy | APPROVED |
| CLIN-029 | Tuan | Huy | APPROVED |
| CLIN-030 | Tuan | Huy | APPROVED |
| CLIN-031 | Tuan | Huy | APPROVED |
| CLIN-032 | Tuan | Huy | APPROVED |
| CLIN-033 | Tuan | Huy | APPROVED |
| CLIN-034 | Tuan | Huy | APPROVED |
| CLIN-035 | Tuan | Huy | APPROVED |
| CLIN-036 | Tuan | Huy | APPROVED |
| CLIN-037 | Tuan | Huy | APPROVED |
| CLIN-038 | Tuan | Huy | APPROVED |
| CLIN-039 | Tuan | Huy | APPROVED |
| CLIN-040 | Tuan | Huy | APPROVED |
| CLIN-041 | Tuan | Huy | APPROVED |
| CLIN-042 | Tuan | Huy | APPROVED |
| CLIN-043 | Tuan | Huy | APPROVED |
| CLIN-044 | Tuan | Huy | APPROVED |
| CLIN-045 | Tuan | Huy | APPROVED |
| CLIN-046 | Tuan | Huy | APPROVED |
| CLIN-047 | Huy | Tuan | APPROVED |
| CLIN-048 | Huy | Tuan | APPROVED |
| CLIN-049 | Huy | Tuan | APPROVED |
| CLIN-050 | Huy | Tuan | APPROVED |
| CLIN-051 | Huy | Tuan | APPROVED |
| CLIN-052 | Huy | Tuan | APPROVED |
| CLIN-053 | Huy | Tuan | APPROVED |
| CLIN-054 | Huy | Tuan | APPROVED |
| CLIN-055 | Tuan | Huy | APPROVED |
| CLIN-056 | Tuan | Huy | APPROVED |
| CLIN-057 | Tuan | Huy | APPROVED |
| CLIN-058 | Tuan | Huy | APPROVED |
| CLIN-059 | Huy | Tuan | APPROVED |
| CLIN-060 | Huy | Tuan | APPROVED |
| CLIN-061 | Tuan | Huy | APPROVED |
| CLIN-062 | Tuan | Huy | APPROVED |
| CLIN-063 | Tuan | Huy | APPROVED |
| CLIN-064 | Huy | Tuan | APPROVED |
| CLIN-065 | Tuan | Huy | APPROVED |
| CLIN-066 | Huy | Tuan | APPROVED |
| CLIN-067 | Huy | Tuan | APPROVED |
| CLIN-068 | Huy | Tuan | APPROVED |
| CLIN-069 | Huy | Tuan | APPROVED |
| CLIN-070 | Huy | Tuan | APPROVED |
| CLIN-071 | Huy | Tuan | APPROVED |
| CLIN-072 | Huy | Tuan | APPROVED |
| CLIN-073 | Huy | Tuan | APPROVED |
| CLIN-074 | Tuan | Huy | APPROVED |
| CLIN-075 | Tuan | Huy | APPROVED |
| CLIN-076 | Tuan | Huy | APPROVED |
| CLIN-077 | Tuan | Huy | APPROVED |
| CLIN-078 | Huy | Tuan | APPROVED |
| CLIN-079 | Huy | Tuan | APPROVED |
| CLIN-080 | Huy | Tuan | APPROVED |
| CLIN-081 | Huy | Tuan | APPROVED |
| CLIN-082 | Huy | Tuan | APPROVED |
| CLIN-083 | Huy | Tuan | APPROVED |
| CLIN-084 | Huy | Tuan | APPROVED |
| EXT-001 | Tuan | Huy | APPROVED |
| EXT-002 | Tuan | Huy | APPROVED |
| EXT-003 | Tuan | Huy | APPROVED |
| EXT-004 | Tuan | Huy | APPROVED |
| EXT-005 | Huy | Tuan | APPROVED |
| EXT-006 | Huy | Tuan | APPROVED |
| EXT-007 | Tuan | Huy | APPROVED |
| EXT-008 | Tuan | Huy | APPROVED |
| EXT-009 | Tuan | Huy | APPROVED |
| EXT-010 | Tuan | Huy | APPROVED |
| EXT-011 | Tuan | Huy | APPROVED |
| EXT-012 | Tuan | Huy | APPROVED |
| EXT-013 | Tuan | Huy | APPROVED |
| EXT-014 | Tuan | Huy | APPROVED |
| EXT-016 | Tuan | Huy | APPROVED |
| EXT-017 | Huy | Tuan | APPROVED |
| EXT-018 | Tuan | Huy | APPROVED |
| EXT-019 | Tuan | Huy | APPROVED |
| EXT-020 | Tuan | Huy | APPROVED |
| EXT-021 | Huy | Tuan | APPROVED |
| EXT-022 | Huy | Tuan | APPROVED |
| EXT-023 | Huy | Tuan | APPROVED |
| EXT-024 | Tuan | Huy | APPROVED |
| EXT-025 | Tuan | Huy | APPROVED |
| EXT-026 | Tuan | Huy | APPROVED |
| EXT-027 | Huy | Tuan | APPROVED |
| EXT-028 | Huy | Tuan | APPROVED |
| EXT-029 | Tuan | Huy | APPROVED |
| EXT-030 | Tuan | Huy | APPROVED |
