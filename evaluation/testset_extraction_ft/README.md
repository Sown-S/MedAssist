# Tập đánh giá trích xuất triệu chứng

Tập kín của Tuấn cho KB-2026.12.1 gồm 30 lời kể giả lập, theo mục 4 bản 3 ngày 20/11/2026. Chỉ dùng để đo đánh giá. Không đưa vào dữ liệu huấn luyện, validation, dev hoặc few-shot. Không chỉnh prompt, luật hay alias dựa trên nội dung ca. Không gửi lời kể hoặc nhãn cho Huy. Tuấn xác nhận đã tự rà đủ 30 ca ngày 22/11/2026. Trường cross_reviewer ghi tác giả tự rà và review_status là SELF_REVIEWED. Bộ ca chưa được rà độc lập.

| Thống kê | Toàn tập | test-1 | test-2 |
|---|---:|---:|---:|
| Cơ xương khớp | 18 | 9 | 9 |
| Tai mũi họng | 6 | 3 | 3 |
| Hô hấp | 4 | 2 | 2 |
| Cúm (nhóm truyền nhiễm) | 2 | 1 | 1 |
| Ca có 1 / 2 / 3 mã | 4 / 24 / 2 | 2 / 12 / 1 | 2 / 12 / 1 |
| Ca có phủ định | 26 | 13 | 13 |
| Lượt phủ định / tổng lượt | 28 / 58 | 14 / 29 | 14 / 29 |
| Giọng Bắc / Trung / Nam | 4 / 5 / 5 | 2 / 3 / 2 | 2 / 2 / 3 |
| Phụ huynh kể | 10 | 5 | 5 |
| Câu dài có chi tiết thừa | 13 | 6 | 7 |
| Ca ngắn (tối đa 15 từ) | 5 | 2 | 3 |
| Lỗi gõ hoặc thiếu dấu | 3 | 1 | 2 |

39 hồ sơ đóng góp 114 mã có alias và có detection khác exam. Tập dùng 35 mã. Dùng `--list-codes` để in danh sách cho lần kiểm hiện tại. Verifier đối chiếu từng mã với quan hệ thuộc nhóm của ca. Khi lời kể thiếu dữ kiện, bỏ mã. Chỉ ghi phủ định khi lời kể nói rõ.

Tác giả kiểm thủ công phạm vi phủ định, ngữ nghĩa mã gộp, giọng vùng miền, vai người kể và chi tiết thừa. Verifier đếm đặc điểm văn phong theo ID tác giả ghi nhận và kiểm thêm độ dài tối thiểu 30 từ cho ca dài. Thống kê cách diễn đạt tính một lượt cho mỗi cặp ca–mã. Với mỗi mã, bộ kiểm dò tên và từng alias nguyên cụm ở bất kỳ đâu trong lời kể sau chuẩn hóa. Cách đếm bảo thủ này ghi nhận 3/58 lượt khớp trực tiếp (5,2%) và 55/58 lượt diễn đạt khác (94,8%). Hai nửa được cân bằng theo nhóm, số mã, phủ định và kiểu kể.

### Kiểm chống trùng

Đọc cả 29 + 29 dòng đóng băng và 26 + 10 + 10 + 30 dòng dev. So từng ca mới với tất cả dòng nguồn và các cặp trong tập mới. Chuẩn hóa chữ thường, bỏ dấu, đổi đ thành d và tách từ theo chữ và số. Loại nếu trùng toàn văn sau chuẩn hóa, Jaccard tập trigram từ ≥ 0,32, hoặc có ít nhất 4 trigram chung phủ ≥ 65% tập trigram nhỏ hơn. Khi chữ ký mã–trạng thái giống hệt, loại thêm nếu SequenceMatcher trên chuỗi từ đạt ≥ 0,60. 134 dòng tham chiếu cho 103 lời kể phân biệt sau chuẩn hóa.

### Niêm phong và sử dụng

Manifest ràng buộc SHA-256 của JSONL, catalog và hai nửa. Hash toàn tệp giữ LF cuối và đổi CRLF thành LF trước khi tính. Hash mỗi nửa nối các dòng được chọn theo thứ tự JSONL bằng một LF giữa hai dòng, không có LF cuối. Danh sách chia nửa chỉ chứa ID. Hai nửa nằm chung trong JSONL nên việc hạn chế người đọc do Tuấn quản lý. Nửa test-2 chỉ mở cho đánh giá cuối. Sau khi chốt cả ba nhánh A/B/C, chỉ thực hiện một lượt đánh giá chung. Bộ 29 ca cũ dùng làm đối chứng tham khảo.

Tuấn đã đóng băng tập ngày 22/11/2026. Sơn đã đối chiếu hash JSONL, catalog và hai nửa, kiểm 35 mã có trong catalog và không có mã exam. Nhãn ở trạng thái SELF_REVIEWED.

Commit công khai trước model gồm manifest, danh sách ID hai nửa, README, CHANGES và verifier. Tuấn giữ JSONL đã niêm phong ở máy; Sơn giữ một bản ngoài repo. Verifier cần JSONL và catalog khớp manifest để kiểm đầy đủ.

Sau khi Huy commit khóa ba nhánh A/B/C (hash model, hash few-shot và phiên bản prompt), Tuấn công khai đúng JSONL đã niêm phong và kiểm từ gốc repo:

```powershell
.\venv\Scripts\python.exe -B evaluation/testset_extraction_ft/verify_extraction_ft.py
```

Khi verifier báo PASS, Huy đánh giá cả ba nhánh trong một lượt trên đủ 30 ca. Thống kê theo từng nửa chỉ dùng để tham khảo.
