# Hướng dẫn sử dụng MedAssist

Dành cho người dùng phòng khám: Lễ tân, Bác sĩ, Quản trị viên. Cài đặt máy chủ xem [`deploy/README.md`](../deploy/README.md).

> Gợi ý của AI chỉ để tham khảo. Bác sĩ chịu trách nhiệm chẩn đoán và điều trị. Hệ thống **không** kiểm tra tương tác hay liều thuốc.

## 1. Bắt đầu

1. Mở **MedAssist** trên máy. Lần đầu bấm **Máy chủ** ở màn đăng nhập, nhập địa chỉ do quản trị viên cung cấp (vd `https://192.168.1.10`).
2. Đăng nhập bằng tài khoản được cấp. Lần đầu (hoặc sau khi quản trị viên đặt lại mật khẩu) phải **đổi mật khẩu** trước khi dùng.
3. Đổi ngôn ngữ Tiếng Việt / English ở màn đăng nhập hoặc trên thanh trên cùng.

Chú ý chung:

- Sai mật khẩu 5 lần trong 15 phút thì tài khoản bị khóa tạm 5 phút; quản trị viên mở khóa được.
- Mất kết nối tới máy chủ: app hiện băng cảnh báo và **chỉ cho xem**, mọi nút ghi bị khóa; có mạng lại thì tự mở.
- Không thao tác trong một khoảng thời gian (Cài đặt › Bảo mật) thì app tự đăng xuất, vì máy dùng chung có dữ liệu bệnh nhân.

## 2. Lễ tân

| Bước | Việc làm |
|---|---|
| Đầu ngày | Xem trang chủ; nếu có thông báo **lượt chưa đóng từ hôm trước**, đóng từng lượt kèm lý do hoặc thu nốt tiền |
| Tìm bệnh nhân | **F3** (hoặc Ctrl+K): tìm theo tên, mã, số điện thoại, CCCD, năm sinh |
| Đăng ký mới | **F2**: họ tên, ngày sinh, giới tính, SĐT, địa chỉ, dị ứng, bệnh nền. Trùng họ tên + ngày sinh thì app hỏi lại trước khi tạo |
| Lời kể | Ghi lời bệnh nhân kể (văn bản tự do), bấm **Đề xuất triệu chứng từ lời kể** |
| Xác nhận triệu chứng | Đề xuất hiện thành chip: bấm ✓ để nhận, ✕ để bỏ, hoặc đổi Có / Không. **Chip chưa xác nhận không được dùng.** Tick thêm trong danh sách: Có / Không / Chưa rõ |
| Sinh hiệu | Nhiệt độ, mạch, nhịp thở, huyết áp (2 ô), SpO2, cân nặng, chiều cao. Trẻ dưới 12 tuổi bắt buộc cân nặng. Số bất thường app hỏi lại |
| Lưu | App chạy luật ngay và báo mức: **Cấp cứu** (đỏ), **Ưu tiên cao** (vàng) hoặc **Thường**. Mục **Hỏi ngay** (tô vàng) là câu cần hỏi thêm để loại trừ dấu hiệu nguy hiểm |
| Cờ đỏ | Chọn **Chuyển viện ngay** (gọi 115 nếu cần) hoặc **Lưu lên đầu hàng chờ** mức Cấp cứu; bác sĩ được báo |
| Sửa / hủy lượt | Ở Hàng chờ: **Sửa** lời kể, triệu chứng khi lượt còn *Chờ*; sau check-in chỉ đo lại sinh hiệu. **Hủy lượt** phải ghi lý do |
| Check-in | Bệnh nhân có mặt và sắp tới lượt: **Có mặt – check-in**. Bác sĩ chỉ mời được người đã check-in |
| Gọi bệnh nhân | Bác sĩ mời → bảng gọi hiện *"Mời số X vào phòng Y"* → gọi → **Đã vào phòng** hoặc **Không có mặt** (về cuối nhóm đã check-in) |
| Cấp phát | Mở **Cấp phát & thu tiền**: **Đã cấp** / **Bỏ qua** (ghi lý do) từng thuốc, hoặc **Cấp hết**; in phiếu xuất kèm số lô, hạn dùng |
| Phí dịch vụ | Thêm dòng khám, xét nghiệm, siêu âm… vào hóa đơn trước khi thu |
| Thu tiền | Tiền mặt hoặc chuyển khoản. Thu xong và cấp xong thì lượt **Hoàn tất** |
| Bỏ về chưa trả | **Hủy lượt khám** (thuốc chưa cấp được hoàn kho, hóa đơn bị hủy) |
| Kho | Cùng quản trị viên: nhập lô, xem thẻ kho, cảnh báo sắp hết hạn / dưới ngưỡng |

## 3. Bác sĩ

| Bước | Việc làm |
|---|---|
| Phòng khám | Mỗi bác sĩ gắn với một phòng cố định; đăng nhập là khám ở phòng đó. Chưa có phòng thì app cảnh báo: nhờ quản trị viên gắn phòng |
| Cờ đỏ | Thông báo đỏ: chọn **Chuyển tuyến** (mở giấy chuyển tuyến) hoặc **Khám tại phòng khám** |
| Mời bệnh nhân | **Mời bệnh nhân tiếp theo** (**Alt+N**): người đã check-in đứng đầu theo thứ tự Cấp cứu → Ưu tiên → số thứ tự |
| Khám | Xem chip triệu chứng lễ tân đã xác nhận, sinh hiệu, dị ứng, bệnh nền; ghi bệnh sử, khám; xem **hồ sơ khám cũ** ở tab Lịch sử |
| Gợi ý tham khảo | Thẻ AI: *Đang phân tích* → *Đầy đủ* (có lý do) hoặc *Chỉ theo luật* (AI lỗi / quá giờ). Ca cờ đỏ không có gợi ý. Mỗi gợi ý có triệu chứng ủng hộ, phản bác, còn thiếu |
| Chẩn đoán | Chọn ICD-10; có thể chọn từ gợi ý hoặc chẩn đoán khác (app ghi nhận lựa chọn để đo hiệu quả AI) |
| Xét nghiệm | **Chỉ định xét nghiệm** (**Alt+L**), in phiếu; bệnh nhân đi làm, lễ tân báo về thì **Khám tiếp** |
| Kê đơn | Tìm thuốc (**Alt+T**), liều Sáng/Trưa/Chiều/Tối × số ngày → tự tính số lượng. Khung nhắc dị ứng / bệnh nền / mang thai chỉ để đọc |
| Chốt đơn | **Ctrl+Enter**: kho bị trừ ngay. Thiếu thuốc thì app liệt kê từng thuốc và lý do (hết, sắp hết hạn, ngừng dùng), đổi thuốc rồi chốt lại. Không kê đơn thì **Hoàn tất khám** |
| Mở lại đơn | Khi chưa thu tiền và chưa cấp thuốc: mở lại, sửa, chốt lại |
| Rời phòng | **Trả về hàng chờ** (bác sĩ khác mời lại được) hoặc **Bệnh nhân bỏ về** (ghi lý do) |
| Tra cứu | Tab **Hồ sơ bệnh nhân**: tìm bệnh nhân, xem các lần khám trước, in giấy tờ |
| Duyệt tri thức | Tab **Duyệt tri thức**: xem thay đổi của bản phát hành do quản trị viên soạn, **Duyệt** hoặc **Từ chối**. Không duyệt được bản mình soạn |

## 4. Quản trị viên

Quản trị viên **không xem được dữ liệu bệnh nhân** (hồ sơ hiện ẩn danh).

| Mảng | Việc làm |
|---|---|
| Tài khoản nhân viên | Tạo tài khoản (người dùng tự đổi mật khẩu ở lần đầu); **gắn phòng khám ngay khi tạo tài khoản bác sĩ** (chưa có phòng thì lễ tân không mời bệnh nhân vào được); khóa / mở khóa, đặt lại mật khẩu |
| Phòng khám | Thêm phòng, đổi tên, ngừng dùng (không xóa) |
| Kho | Danh mục thuốc; **nhập lô** (số lô, hạn dùng, số lượng, giá nhập); thẻ kho; cảnh báo sắp hết hạn / dưới ngưỡng |
| Cài đặt | Phí khám, khoảng an toàn hạn dùng, khổ giấy in, các tham số hệ thống |
| Cấu hình AI / tri thức | Xem các bản phát hành tri thức; soạn nháp, gửi bác sĩ duyệt; **tắt khẩn cấp** một bệnh / triệu chứng / luật (có hiệu lực ngay, bật lại phải qua duyệt); xem nhật ký chạy AI |
| Báo cáo | Lượt khám, doanh thu đã thu, hiệu quả AI theo khoảng ngày |
| Lịch sử hoạt động | Nhật ký mọi thao tác (chỉ ghi thêm), lọc, xuất Excel / CSV |
| Theo dõi hệ thống | Trang chủ hiện trạng thái CSDL và AI của máy chủ |

## 5. Câu hỏi thường gặp

| Hỏi | Đáp |
|---|---|
| Thẻ gợi ý đứng mãi ở "Đang phân tích" | Máy chủ đang xử lý ca trước (mỗi ca 10–40 giây). Quá lâu thì báo quản trị viên kiểm tra máy chủ |
| Thẻ gợi ý ghi "Chỉ theo luật" | AI tạm không dùng được; danh sách vẫn xếp theo luật, có thể dùng bình thường |
| Không mời được bệnh nhân | Bệnh nhân chưa được lễ tân check-in, hoặc bác sĩ khác đã nhận |
| Chốt đơn báo thiếu thuốc | Kho không đủ thuốc còn hạn qua hết đợt dùng; đổi thuốc hoặc nhờ nhập thêm lô |
| Không sửa được lời kể | Lượt đã check-in; chỉ còn đo lại sinh hiệu được |
| Báo lỗi có "mã yêu cầu" | Ghi lại mã đó gửi quản trị viên để tra nhật ký máy chủ |
