# Nhật ký bộ bổ sung trọng tâm

## 22/11/2026 · Pha A

50 ca có ID riêng, gồm 28 ca cơ xương khớp và 22 ca bệnh phổ biến. Phạm vi lấy từ phần “Phạm vi và thứ tự ưu tiên” trong `evaluation/review/expert_questions_tong_ket.md`, bổ sung cảm lạnh theo KB-2026.12.1. Mỗi bệnh cơ xương khớp là đề xuất chính đúng một lần, mỗi bệnh phổ biến hai lần. Tuổi, sinh hiệu và dữ kiện phủ định là đầu vào ca giả định. Các tổ hợp dương tính được chọn từ quan hệ SUPPORTS trong hồ sơ tương ứng, có thể lần theo source_key đến tài liệu Bộ Y tế trong knowledge/sources/. Hai hồ sơ J00 có bệnh cảnh giao nhau và được giữ trong danh sách phân biệt ở bốn ca có đề xuất chính là J00. Thứ tự giữa hai hồ sơ CHƯA XÁC MINH. Giao Huy phiếu đã trộn thứ tự ca và hướng dẫn trong README.

### Cách đọc luật

Đọc trực tiếp condition_logic của 9 rf_ và 3 pf_ tại phiên bản KB nêu trên. Với từng ca, so trạng thái triệu chứng, dấu so sánh sinh hiệu và nhóm tuổi trên từng lá. AND cần mọi lá đủ điều kiện, OR cần ít nhất một nhánh đủ. Bỏ khóa nghĩa là UNKNOWN. Ghi đủ mọi luật đã thỏa kể cả luật sàn khi có cờ đỏ. Lấy ưu tiên cao nhất của các luật đó, hoặc Routine khi không có luật thỏa. Verifier đọc lại cây YAML độc lập với ứng dụng để so với đề xuất đã ghi tay.

| Nhánh cần phân biệt | Đối chiếu trong bộ ca |
| --- | --- |
| Sốt | T17 đúng 38.5 °C và T26 ở 38.8 °C đạt pf_sot_cao. T41 và T50 từ 39 °C đạt thêm pf_severe_dehydration_high_fever. T42 ở 38.7 °C chỉ đạt sàn sốt. |
| Nhịp thở theo tuổi | T27 (11 tuổi) và T24 (12 tuổi) đều 30 lần/phút. Ngưỡng tương ứng là ≥40 và ≥30. T42 dưới 1 tuổi, nhịp thở 44 dưới ngưỡng 50 và mạch 145 dưới ngưỡng sốc >170. |
| Nhiều luật cùng thỏa | T50 có cả hai luật sàn sốt và rf_respiratory_failure do nhịp thở. T06 có SpO₂ 91%, đủ điều kiện <92% dù thiếu nhịp thở. |
| Dễ nhầm bệnh | T33 có ngứa/hắt hơi, dấu cuốn mũi và ghi nhận ABSENT với dịch nhầy mủ khe giữa. T12 có đau cột sống cơ học, co cơ cạnh sống và ABSENT với thiếu hụt cảm giác/vận động/phản xạ theo rễ. |

43 Routine, 4 HighPriority và 3 Emergency là **đề xuất của tác giả**. Routine mô tả kết quả đối chiếu luật trên các dữ kiện được cung cấp. Giá trị lâm sàng và thứ tự chẩn đoán CHƯA XÁC MINH. Hai tệp kiểm bệnh gỡ trong evaluation/results/kb_2026_11_acceptance/ chỉ dùng để lập hợp danh sách loại trừ.

### Toàn vẹn và giới hạn

So tập mã triệu chứng bỏ qua thứ tự và cả trạng thái. Do đó một ca đổi PRESENT thành ABSENT trên cùng tập mã vẫn bị coi là trùng. Đối chiếu cả clinical và extraction của từng bản v1.3/v1.4, cùng các ca mới với nhau. Các phiên bản cũ dùng lại các ID, mỗi bản có 82 CLIN và 29 EXT. Ngoại lệ revision_note trong bản cũ không áp dụng cho bộ mới.

Hash từng tệp chuẩn hóa CRLF thành LF theo v1.4. Hash gộp là SHA-256 của chuỗi các hash hex theo combined_order nối bằng dấu hai chấm. Bộ này có một JSONL nên đầu vào hash gộp chỉ là một hash hex. Hai CSV được kiểm riêng. Hash tham chiếu bao phủ toàn bộ 12 tệp nguồn trong hai thư mục đóng băng và đã đối chiếu với Git HEAD lúc tạo bộ.

Chưa nhận huy_labels.csv. Chưa gộp nhãn, chưa tính đồng thuận, chưa có quyết định bác sĩ hoặc yêu cầu Sơn xử lý. Không chạy benchmark hay pipeline.

## 23/11/2026 · Pha B

Đã nhận bản gốc huy_labels.csv, SHA-256 `f7aeaee529ef3f17dbd76bd344132591e5cc3a2c8598fe0527ae14d176cf07c3`. Kiểm đủ 50 ID, trùng khớp cả năm cột đầu vào. Có 26 dòng ghi chú. Mẫu số cho cả bốn phép so là 50. Ưu tiên khớp 50/50 (100%), tập luật khớp 50/50 (100%), danh sách bệnh có thứ tự khớp 40/50 (80%), cả ba trường khớp 40/50 (80%). Hai phiếu đều có 43 Routine, 4 HighPriority và 3 Emergency.

40 ca đồng thuận mang trạng thái CROSS_REVIEW_AGREED. 10 ca còn lại giữ PENDING_CROSS_REVIEW và cả ba nhãn cuối trống. Hai cột dưới ghi nguyên thứ tự mã bệnh. Ưu tiên và luật của từng ca có trong cả hai phiếu. Xem ghi_chu trong huy_labels.csv để đọc nguyên văn phản hồi, kể cả ở các ca đồng thuận.

### CẦN BÁC SĨ QUYẾT

| Ca | Tuấn đề xuất | Huy đề xuất |
| --- | --- | --- |
| CLIN-T06 | `["phoi_tac_nghen_man_tinh"]` | `[]` |
| CLIN-T12 | `["hoi_chung_dau_that_lung"]` | `["hoi_chung_dau_that_lung", "benh_thoai_hoa_cot_song_that_lung"]` |
| CLIN-T18 | `["viem_hong_cap_tinh"]` | `["viem_hong_cap_tinh", "viem_amidan_cap_va_man_tinh"]` |
| CLIN-T22 | `["viem_mui_xoang_cap_tinh"]` | `["viem_mui_xoang_man_tinh", "viem_mui_xoang_cap_tinh"]` |
| CLIN-T23 | `["benh_thoai_hoa_cot_song_co"]` | `["benh_thoai_hoa_cot_song_co", "hoi_chung_co_vai_canh_tay"]` |
| CLIN-T24 | `["hen_phe_quan"]` | `[]` |
| CLIN-T31 | `["viem_mui_xoang_cap_tinh"]` | `["viem_mui_xoang_man_tinh", "viem_mui_xoang_cap_tinh"]` |
| CLIN-T46 | `["hoi_chung_co_vai_canh_tay"]` | `["hoi_chung_co_vai_canh_tay", "benh_thoai_hoa_cot_song_co"]` |
| CLIN-T49 | `["viem_thanh_quan_cap_tinh"]` | `["viem_thanh_quan_cap_tinh", "viem_thanh_quan_man_tinh"]` |
| CLIN-T50 | `["cum_mua"]` | `[]` |

Cả 48 ca Emergency của v1.4 đều có danh sách bệnh trống. Ba ca Emergency mới khác nhau giữa hai phiếu ở quy ước ghi bệnh nền. Chưa áp dụng quyết định hồi tố cho đề xuất của Tuấn. Hai ca xoang khác bệnh đứng đầu. Năm ca khác trùng bệnh đứng đầu nhưng Huy bổ sung một bệnh phân biệt. Bộ vẫn mở để bác sĩ xử lý các bất đồng.
