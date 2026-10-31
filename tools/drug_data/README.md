# tools/drug_data — thu thập danh mục thuốc và giá tham khảo

Công cụ chạy **trên máy dev** để tạo `server/data/drugs.csv`. Không thuộc server, không vào image Docker,
không import gì từ `server/app`. Người phụ trách: Sơn.

Kết quả hiện tại: `drugs.csv` có 386 thuốc (100 chọn tay, 286 thêm tự động), mọi dòng đã có giá
(286 giá ước tính). Chỉ cần chạy lại công cụ khi đổi danh mục; nạp vào CSDL thì xem `server/data/README.md`.

## Cài đặt (một lần, trong `tools/`)

```powershell
cd tools
python -m venv .venv
.venv\Scripts\activate
pip install -r drug_data/requirements.txt
python -m pytest            # test không cần DB, không truy cập mạng; CI cũng chạy bộ test này
```

Đường dẫn nguồn để ở **`config.toml`** (trang văn bản, trang tải về trên vbpl.vn). Email cá nhân dùng khi tra giá
để ở **`config.local.toml`** (không commit):

```toml
[gia]
email_lien_he = "ten@dtu.edu.vn"
```

vbpl.vn chặn công cụ tự động, nên cách chắc chắn: mở `trang_tai_ve` trong config.toml, bấm tải file **.doc/.docx**
(và **.pdf** nếu muốn lưu kèm), chép vào **`inbox/`**. Script đọc thẳng .docx/.html; .doc Word 97-2003 tự chuyển
bằng Microsoft Word; .pdf chỉ lưu làm minh chứng. Nếu lấy được đường dẫn file trực tiếp (chuột phải nút tải ->
Sao chép địa chỉ liên kết) thì điền vào `tai_truc_tiep`, script sẽ thử tự tải khi inbox/ trống.

## Quy trình

```powershell
# 1+2. Minh chứng nguồn, trích Phụ lục I, đối chiếu, tự thêm thuốc — MỘT lệnh (file nguồn ở inbox/)
python -m drug_data.tt19_catalog run            # = fetch, extract, check (dừng nếu FAIL), candidates, merge --auto
#    muốn tự chọn thuốc: 'run --no-merge', ghi x ở cột chon trong output/drug_candidates.csv, rồi 'merge'

# 3. Giá: thuốc chưa có giá -> ước tính (tra giá web tự động KHÔNG dùng được, xem "Giá tham khảo" bên dưới)
#    quy tắc: cùng hoạt chất -> trung vị nhóm -> trung vị đơn vị; làm tròn 100 đ
python -m drug_data.estimate_prices --dry-run      # xem trước
python -m drug_data.estimate_prices --with-batch   # ghi giá + giá nhập + lô ban đầu (để demo cấp phát được)
#    cột price_source = 'uoc-tinh:...'; giá tra được sau (fetch_prices apply) sẽ ghi đè

# 4. Nạp vào DB (trong server/) — thuốc chưa có giá bị bỏ qua và in ra danh sách
cd ..\server
python -m scripts.seed_drugs
```

### Thêm thuốc tự động (`merge --auto`)

Từ Phụ lục I chỉ lấy thuốc dùng ngoại trú (uống, dùng ngoài, nhỏ mắt/mũi/tai, xịt, hít, đặt trực tràng),
bỏ nhóm không dùng ở phòng khám (tiêm, gây mê, ung thư, vắc xin, chế phẩm máu, lao/phong/sốt rét/HIV,
tránh thai, giảm đau loại opi, thuốc cổ truyền — sửa `EXCLUDED_GROUPS` / `EXCLUDED_SUBGROUPS` nếu cần).
Tự thêm khi đoán được đơn vị bán và hàm lượng là một giá trị cụ thể (không phải khoảng); tên thương mại
mặc định = hoạt chất + hàm lượng; giá để trống; không tạo lô ban đầu (nhập lô qua giao diện kho).

### Giá tham khảo từ nhà thuốc bán lẻ

**Trạng thái (18/10/2026, đã thử trên trang thật): tìm kiếm tự động không dùng được.**
Long Châu: `robots.txt` không cho công cụ tự động vào trang tìm kiếm — script dừng đúng quy định.
Pharmacity: trang tìm kiếm chỉ là khung Next.js, kết quả do JavaScript tải sau khi mở trang nên HTML không có
sản phẩm. Nhóm quyết định không gọi API nội bộ và không dùng trình duyệt tự động.

Cách làm hiện tại:
- Thuốc chưa có giá: `python -m drug_data.estimate_prices --with-batch` (cột `price_source` = `uoc-tinh:...`).
- Cần giá thật cho một số thuốc quan trọng: mở trang sản phẩm trên trình duyệt, thêm dòng vào
  `output/price_review.csv` (generic_name, trade_name, strength giống drugs.csv + `product_url`), chạy
  `python -m drug_data.fetch_prices refresh`, kiểm tra, ghi `x` ở cột `duyet`, rồi `apply`. Script vẫn đọc
  `robots.txt` trước khi tải trang sản phẩm; giá thật ghi đè giá ước tính, trang được lưu ở `sources/prices/approved/`.

## Thư mục

| Đường dẫn | Nội dung | Commit |
|---|---|---|
| `config.toml` | Đường dẫn nguồn (vbpl.vn) | Có |
| `config.local.toml` | Email cá nhân (ghi đè config.toml) | Không |
| `inbox/` | File tải tay bằng trình duyệt (được chép sang sources/ khi fetch) | Không (trừ README.txt) |
| `sources/tt19_2018/` | File nguồn đã lưu (`tt19_2018_goc_N.*`, kể cả .pdf), `manifest.json` (trang, cách lấy, thời điểm, SHA-256) | Có (minh chứng) |
| `sources/prices/approved/` | Trang sản phẩm của các giá đã ghi vào drugs.csv | Có (minh chứng) |
| `sources/prices/cache/` | Mọi trang đã tải | Không |
| `output/tt19_2018_phu_luc_1.csv` | Toàn bộ Phụ lục I trích tự động | Có |
| `output/drug_candidates.csv`, `price_review.csv`, `tt19_check_report.csv` | File trung gian để xem/duyệt | Không |

Nguồn: Thông tư 19/2018/TT-BYT ngày 30/08/2018 của Bộ Y tế, Phụ lục I — Cơ sở dữ liệu quốc gia về văn bản
pháp luật (Bộ Tư pháp). Văn bản quy phạm pháp luật không thuộc đối tượng bảo hộ quyền tác giả
(Luật Sở hữu trí tuệ, Điều 15).
