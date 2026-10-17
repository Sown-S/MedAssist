# server/data — dữ liệu nạp sẵn

## drugs.csv — danh mục thuốc phòng khám (100 thuốc)

Nạp bằng `python -m scripts.seed_drugs` (chạy trong `server/`). Script đi qua `inventory_service`
(kiểm tra dữ liệu, ghi nhật ký bằng tài khoản `system`), chạy lại nhiều lần không tạo trùng.
Thêm `--no-batches` để chỉ nạp danh mục, không tạo lô (dùng khi cài máy admin).
Thêm `--deactivate-others` để ngừng dùng các thuốc đang dùng nhưng không có trong file (không xóa, có ghi nhật ký).

### Nguồn và cách chọn

- **Hoạt chất, hàm lượng, dạng bào chế:** chọn từ **Phụ lục I — Danh mục thuốc hóa dược, vắc xin, sinh phẩm
  thiết yếu, Thông tư 19/2018/TT-BYT** (Bộ Y tế, hiệu lực 15/10/2018). Cột `source` ghi số thứ tự (STT)
  trong Phụ lục I để tra lại. Chỉ lấy hàm lượng / dạng bào chế có trong phụ lục; thuốc không có trong
  phụ lục thì không đưa vào.
- **Phạm vi:** thuốc dùng ngoại trú (uống, dùng ngoài, nhỏ mắt, nhỏ mũi, xịt/hít) cho phòng khám đa khoa
  khám cả người lớn và trẻ em, theo 7 nhóm: giảm đau – hạ sốt – chống viêm; chống dị ứng – corticoid;
  kháng sinh – kháng nấm – kháng virus – giun sán; tiêu hóa; hô hấp; tim mạch – nội tiết – gút;
  vitamin – khoáng chất, ngoài da, mắt, tai mũi họng. Không có thuốc tiêm.
- **Dạng cho trẻ em:** gói bột, sirô, hỗn dịch, viên đạn — lấy theo các dạng có trong Phụ lục I.
  Chưa đối chiếu từng dòng với WHO Model List of Essential Medicines for Children.
- **Tên thương mại:** tên phổ biến trên thị trường để minh họa; thuốc không ghi tên riêng thì dùng
  tên hoạt chất + hàm lượng.

Danh mục cần **bác sĩ cố vấn xem lại** trước khi dùng cho buổi demo chính thức.

### Cột

| Cột | Ý nghĩa |
|---|---|
| generic_name, trade_name, strength, dosage_form | Định danh thuốc (4 cột này không được trùng — `uq_drug_identity`) |
| unit | Đơn vị xuất bán nhỏ nhất (viên, gói, chai, lọ, tuýp, bình) — số lượng kê đơn tính theo đơn vị này |
| sale_price, import_price | VNĐ |
| reorder_level | Ngưỡng cảnh báo tồn thấp (theo đơn vị) |
| drug_class | Nhóm tác dụng (hiển thị, lọc) |
| batch_quantity, shelf_life_days | Lô ban đầu do script tạo: số lượng, hạn dùng = ngày nạp + số ngày |
| source | Văn bản tham chiếu |

Đổi danh mục: sửa `drugs.csv` (UTF-8), mở PR; chạy lại `seed_drugs` chỉ thêm thuốc mới, không sửa thuốc đã có
(sửa giá / ngừng dùng thuốc đã có làm trên giao diện hoặc API `PATCH /drugs/{id}`).
