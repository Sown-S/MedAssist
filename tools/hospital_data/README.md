# tools/hospital_data — danh mục cơ sở nhận chuyển tuyến

Công cụ chạy **trên máy dev** để tạo `server/data/hospitals.csv` (bảng `referral_facility`, ERD v2.0 mục 2.10a).
Không thuộc server, không vào image Docker, không import gì từ `server/app`. Người phụ trách: Sơn.

## Nguồn

Chưa có nguồn quốc gia tải được: trang tra cứu cơ sở KCB của BHXH Việt Nam có mã xác nhận và vẫn theo 63 tỉnh cũ;
Hệ thống thông tin quản lý hoạt động khám bệnh, chữa bệnh theo Thông tư 38/2024/TT-BYT chưa vận hành. Vì vậy danh mục
ghép từ **văn bản công bố của Bộ Y tế và Sở Y tế** (đã theo 34 tỉnh/thành sau 01/7/2025), mỗi nguồn khai ở
`sources.toml` (cơ quan, văn bản, đường dẫn), file gốc lưu ở `sources/<id>/`, SHA-256 ghi ở `sources/manifest.json`.

| id | Cơ quan | Văn bản |
|---|---|---|
| `byt_xep_cap_2025` | Cục Quản lý KCB – Bộ Y tế | Kết quả xếp cấp chuyên môn kỹ thuật 48 đơn vị trực thuộc Bộ (01/01/2025) |
| `hanoi_ksk_2026` | Sở Y tế Hà Nội | Cơ sở đủ điều kiện khám sức khỏe (07/10/2026) |
| `hcm_ksk_2026` | Sở Y tế TP. Hồ Chí Minh | Danh sách cơ sở công bố đủ điều kiện khám sức khỏe (18/5/2026) |
| `danang_tb6539_2026` | Sở Y tế Đà Nẵng | Thông báo 6539/TB-SYT ngày 29/5/2026 (gồm Quảng Nam cũ) |
| `gialai_cv6710_2026` | Sở Y tế Gia Lai | Công văn 6710/SYT-NVY ngày 25/8/2026 (gồm Bình Định cũ) |
| `hue_truc_thuoc`, `hue_du_dieu_kien` | Sở Y tế Huế | Đơn vị trực thuộc Sở; cơ sở y tế đủ điều kiện |
| `quangngai_tu_nhan`, `quangngai_emr_2025`, `quangngai_gphd_cong_lap` | Sở Y tế Quảng Ngãi | Cơ sở KCB tư nhân; cơ sở triển khai bệnh án điện tử; giấy phép hoạt động khối nhà nước (2022, chỉ bổ sung địa chỉ) |
| `hanoi_truc_thuoc` | Sở Y tế Hà Nội | Đơn vị trực thuộc Sở (bảng bệnh viện) |
| `hcm_qd10_2025` | Sở Y tế TP. Hồ Chí Minh | Danh sách cơ sở y tế kèm QĐ 10/2025/QĐ-UBND (chỉ hai mục bệnh viện) |
| `danang_truc_thuoc` | Sở Y tế Đà Nẵng | Đơn vị trực thuộc Sở (gồm Quảng Nam cũ) |

Bệnh viện trực thuộc Bộ không ghi địa chỉ trong văn bản xếp cấp; tỉnh của chúng lấy theo `byt_tinh.csv` (cần người duyệt
xác nhận). Khi hai nguồn ghi hai tên của cùng một cơ sở (đổi tên sau sắp xếp 2025), `duyet.csv` giữ tên ở văn bản mới hơn.

Chỉ giữ **Bệnh viện, Viện có giường bệnh, Trung tâm Y tế**; bỏ phòng khám, trạm y tế, CDC, trung tâm kiểm nghiệm,
viện pháp y. Tên viết tắt (`BVĐK`, `TTYT`...) được viết đầy đủ; phần "thuộc Công ty..." bị bỏ.

## Cài đặt (một lần, trong `tools/`)

```powershell
cd tools
.venv\Scripts\activate                      # venv chung với drug_data
pip install -r hospital_data/requirements.txt
python -m pytest hospital_data              # không cần DB, không truy cập mạng
```

## Quy trình

```powershell
# 1. Thêm/cập nhật nguồn: tải tay bằng trình duyệt, chép vào sources/<id>/, khai ở sources.toml
# 2. Đọc nguồn -> output/hospital_candidates.csv (báo nếu file nguồn khác lần trước)
python -m hospital_data.build
# 3. Duyệt: dòng có cột can_xem (tên có thể trùng, bỏ phần 'thuộc', tách từ ô gộp, nguồn cũ, chưa rõ tỉnh)
#    chưa được chọn. Ghi quyết định vào duyet.csv (giu/bo, ten_moi, dia_chi '-' để xóa, so_huu, ly_do) rồi chạy
#    lại bước 2; build áp duyet.csv nên chạy lại hay thêm nguồn không mất công duyệt.
# 4. Xuất cho server
python -m hospital_data.build export        # -> server/data/hospitals.csv
# 5. Nạp vào CSDL (trong server/)
python -m scripts.seed_referral_facilities
```

`export` từ chối khi dòng đã chọn thiếu tỉnh hoặc hai dòng cùng tỉnh và cùng tên không dấu (CSDL chặn bằng
`uq_referral_facility_identity`). Không sửa tay `output/hospital_candidates.csv` (bị ghi đè mỗi lần `build`);
mọi quyết định duyệt nằm ở `duyet.csv`.
