# Rà chéo bộ ca v1.3 — bản đồng bộ cuối ngày 11/11/2026

Người rà: **Tuấn và Huy**. Theo xác nhận bằng văn bản trong hội thoại, người giao việc đã rà, chốt phần của mình và yêu cầu ghi **Tuấn — ĐỒNG Ý**. Đây là ghi nhận xác nhận của người thật, không phải AI ký thay. Ngày rà phần Tuấn: 11/11/2026.

## Tệp cuối cùng

- `review_sheet_clinical_v1.3.csv`: 82 ca; Huy 45, Tuấn 37; 81 ĐỒNG Ý, 1 CẦN SỬA.
- `review_sheet_extraction_v1.3.csv`: 29 ca; Huy 21, Tuấn 8; 25 ĐỒNG Ý, 4 CẦN SỬA.

Phản hồi Huy được giữ nguyên nội dung, chỉ chuẩn hóa chữ hoa của verdict. Các cột ca và nhãn khớp phiếu ban đầu; không trùng, thiếu hoặc thừa ID. Phần Tuấn ghi ĐỒNG Ý với các nhận xét đối chiếu, đồng thời giữ rõ vấn đề cần xử lý. Hoàn tất ghi nhận rà chéo không có nghĩa toàn bộ ca đạt, mọi vấn đề an toàn đã được giải quyết hoặc nhãn đã sửa.

Năm ca Huy yêu cầu sửa vẫn là CLIN-019, EXT-010, EXT-014, EXT-024, EXT-026. Hai JSONL v1.3 được giữ nguyên; mọi sửa nhãn thuộc công việc bộ mới v1.4. Chưa thay đổi trạng thái Active của ứng viên KB-2026.11 hoặc chạy benchmark RuleOnly.

Các bản `_huy`, phiếu hỗ trợ AI, JSON xác nhận và báo cáo trung gian trong thư mục này được gộp rồi xóa theo yêu cầu người giao việc. Hai bản Huy cung cấp tại `D:/DownLoad/` không bị xóa. Dấu vết kiểm tệp nguồn được giữ bên dưới.

## Băm các phiếu Huy đã nhận

- clinical: `88c25e4e5d79009eafa32aac5719fd80e42714f8c42f525ed6d8768251d9cc9f`; các cột ngoài phản hồi không đổi, ID duy nhất.
- extraction: `eb4bc5abedbd36f4b6085bf59732c7408219a7f36a20e095830615dfbc873ab1`; các cột ngoài phản hồi không đổi, ID duy nhất.

## Năm mục Huy đánh dấu cần sửa

| Ca | Nhận định đối chiếu | Hướng xử lý |
|---|---|---|
| CLIN-019 | Chỉ có ngứa và mụn nước: dữ kiện rộng, chưa đủ phân biệt ghẻ/viêm da cơ địa. Lý do bệnh rớt Top-5 là kết quả thuật toán, không chứng minh nhãn sai. | Không tự thêm mã ghẻ để cải thiện thứ hạng. Người rà xác minh dữ kiện ca độc lập; nếu cần làm ca rõ hơn, thiết kế ca v1.4 với căn cứ trước khi đánh giá. |
| EXT-010 | Nhãn ABSENT đau kiểu cơ học từ câu “nằm nghỉ không giảm” phụ thuộc chính sách suy luận và mã gộp. | Cần thống nhất mức suy luận cho extraction; không coi bỏ nhãn là kết luận bắt buộc đã được xác nhận. |
| EXT-014 | Không nhắc sốt nhưng gán `fever_high=ABSENT`. | Có căn cứ rõ để đề xuất bỏ ABSENT trong v1.4, hoặc bổ sung phủ định nếu có dữ kiện thật. |
| EXT-024 | Tả đường hầm ghẻ/ngứa đêm ở kẽ ngón, nhưng thiếu mã đặc trưng; đồng thời gán không sốt khi câu không nói. | Rà bổ sung mã đặc trưng và bỏ ABSENT không có căn cứ trong bộ mới. |
| EXT-026 | Không nhắc sốt nhưng gán ABSENT sốt. | Đề xuất bỏ ABSENT trong bộ mới; nếu yêu cầu nhãn đầy đủ, rà thêm `gonorrhea_purulent_urethritis_dysuria`. |

Quy tắc hiện hành trong `server/app/ai/llm/prompts/extraction_v2.txt`: phủ định mới gán ABSENT; triệu chứng không nhắc tới phải bỏ. Không tự chèn “không sốt” chỉ để hợp thức hóa nhãn hiện tại.

## Phần được phân công Tuấn: các điểm cần xem trước khi xác nhận

Nhận xét đối chiếu cho 37 ca lâm sàng và 8 ca extraction phần Tuấn đã được gộp vào cột `nhận xét` của hai phiếu cuối; Tuấn đã xác nhận đồng ý và yêu cầu ghi tên Tuấn trong hội thoại. Không chạy lại chấm DDx, benchmark RuleOnly, Full hay trích xuất để tạo nhận xét này; không xác nhận các số điểm/thứ hạng trong phiếu Huy.

| Ca | Vấn đề cần quyết định |
|---|---|
| **CLIN-021** | Nhãn Routine trong tổ hợp tăng nhãn áp, đau mắt, giảm thị lực, đau đầu, buồn nôn. Mã gộp không xác định cấp/mạn; cần bác sĩ mắt rà trước khi chấp nhận mức ưu tiên. |
| **CLIN-022** | Nhãn Routine với tổn thương loét giác mạc/mủ tiền phòng, đau và giảm thị lực cần bác sĩ mắt rà mức khẩn. Khớp luật không đồng nghĩa an toàn lâm sàng. |
| **EXT-027** | Văn bản nêu đột ngột đau mắt dữ dội, quầng xanh đỏ, giác mạc phù, đồng tử giãn méo, nhãn áp rất cao; cần rà thiếu mã đóng góc cấp. Không suy rằng tất cả thành phần tiền phòng/góc của mã gộp đều đã được mô tả. |
| EXT-022, EXT-023 | `fever_high=ABSENT` thiếu phủ định trong văn bản. |
| EXT-021 | Có căn cứ văn bản cho mã mủ tai thối/cholesteatoma và thủng sát khung; nhãn hiện chỉ có mã chung. |
| EXT-023 | Hạt xơ hai dây thanh, nói nhiều, hụt hơi có thể hỗ trợ thêm mã tổn thương dây thanh/lạm dụng giọng/mỏi giọng. |
| EXT-006 | Có khó thở cơn ban đêm nhưng nhãn khó thở mạn/gắng sức chưa rõ căn cứ; có nặng ngực chưa được ghi bằng mã tương ứng. |
| EXT-017 | Đã có mã hội chứng suy hô hấp/ý thức; cân nhắc mã co kéo và tím tái nếu chính sách yêu cầu đủ các mã cụ thể. |
| EXT-028 | Cần bác sĩ mắt rà ca vừa có chấn thương lá lúa, vừa tả loét hình cành cây/mủ tiền phòng; không suy căn nguyên hoặc bổ sung mã gộp chỉ từ một thành phần. |
| CLIN-017 | Mã tai/màng nhĩ đang gộp nhiều tổn thương, chưa đủ khẳng định thể cholesteatoma. Không thêm dấu hiệu vì thứ hạng mô hình. |

Cơ sở để ưu tiên rà mắt: [National Eye Institute](https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/glaucoma/types-glaucoma?gh_jid=4958715003) coi đóng góc cấp có đau mắt dữ dội, nhìn mờ và buồn nôn là cấp cứu; [American Academy of Ophthalmology](https://www.aao.org/eye-health/diseases/corneal-ulcer) mô tả loét giác mạc là tình trạng nghiêm trọng có đau và nhìn mờ. Đây là căn cứ yêu cầu rà lâm sàng; không tự đổi ưu tiên của ca mã hóa thiếu dữ kiện.

Các ca kiểm ngưỡng hô hấp 051–054, 059–060 và 068–073 được đối chiếu với điều kiện trong `rf_respiratory_failure.md`: SpO2 <92%, nhịp thở ≥50 dưới 1 tuổi, ≥40 từ 1 đến dưới 12 tuổi, ≥30 từ 12 tuổi. Nhãn trong phiếu phù hợp các ngưỡng này. Nhận xét này chỉ xác nhận đối chiếu đặc tả, không xác nhận mức khẩn lâm sàng toàn bộ ca.

## Các điểm nên trả lại Huy để xem thêm

- EXT-019 được đánh dấu đồng ý dù `myalgia_arthralgia` không có triệu chứng đau cơ/khớp trực tiếp trong câu. Chính Huy cũng ghi chú điểm này; không nên coi bệnh nền tự động chứng minh triệu chứng.
- EXT-018: câu có chùm đuôi ngựa và liệt tiến triển, nhưng mã `sciatica_lasegue_positive` cần rà căn cứ; thoát vị đĩa đệm không tự chứng minh đau thần kinh tọa/dấu Lasègue.
- Không dùng các nhận xét “thêm mã để lên #1/Top-5” làm căn cứ chỉnh KB hoặc ca đánh giá. Mọi sửa ca phải dựa trên dữ kiện và tiêu chí nhãn độc lập với điểm mô hình.


## Bằng chứng xác nhận của Tuấn

Người giao việc trả lời “tôi xác nhận cả 2” khi được hỏi rõ về đồng ý nhận xét và đã rà, chốt từng ca; sau đó yêu cầu “ghi người ghi là tuấn, xác nhận đồng ý”. Áp dụng cho toàn bộ 37 ca lâm sàng và 8 ca trích xuất được phân công Tuấn. Không đổi phản hồi của Huy thành đồng ý.

## Kết luận bổ sung Huy và công việc riêng

Đã nhận thống nhất mới qua người giao việc: EXT-026 dùng `gonorrhea_purulent_urethritis_dysuria`, bỏ ABSENT sốt trong v1.4; CLIN-022 giữ DDx Herpes, không bỏ theo thứ hạng; EXT-011 giữ ABSENT cứng khớp trên 1 giờ vì câu nêu 15 phút, xét riêng EXT-010. Giữ nguyên verdict gốc trong phiếu và nhãn v1.3. Mọi sửa luật cần việc riêng và rà chuyên môn trước triển khai.

Bổ sung bao phủ tắc động mạch trung tâm võng mạc: cả `central_retinal_artery_cherry_red_spot` và `acute_visual_loss` có trong `rf_out_of_scope`. Huy nhận định ca mất thị lực đột ngột được bảo vệ nếu gán đúng mã nguyên tử; chỉ gán `visual_acuity_decreased_blur` làm mất tính cấp và có thể bỏ sót. Việc trích xuất riêng cần bảo đảm giữ thông tin khởi phát cấp/đột ngột; không đồng nhất nhìn mờ mạn với mất thị lực cấp. Nhận định về bệnh nhân điển hình là phản hồi Huy; các phép chấm/thứ hạng và nguyên nhân điểm chưa được tái chạy để điều chỉnh KB.

Danh sách công việc v1.4: ABSENT sốt EXT-014/022/023/024/026; PRESENT đau cơ/khớp EXT-019; chính sách suy luận EXT-010; nhãn cụ thể EXT-021/023/024/026/027; dữ kiện CLIN-019/021/022 và EXT-028. Cần kiểm dữ kiện của mã gộp, không thêm triệu chứng để nâng thứ hạng. Danh sách luật/trích xuất riêng: điếc đột ngột, thanh thiệt, SSSS, khớp nhiễm khuẩn, DRESS, viêm xương tủy/áp xe cơ và mắt cấp với mã chung. Chưa sửa bất kỳ luật hoặc JSONL nào.
