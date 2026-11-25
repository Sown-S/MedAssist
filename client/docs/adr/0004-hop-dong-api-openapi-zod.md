# ADR-0004: Hợp đồng API — ảnh chụp OpenAPI, fixture thật, zod sinh tự động (chỉ cảnh báo)

**Bối cảnh.** Server (FastAPI) và client do hai người viết; đổi tên trường phía server làm màn hình hiện trống mà không ai báo.

**Quyết định.**
1. `tests/contract/openapi.json` là ảnh chụp OpenAPI; job server trong CI báo lỗi khi OpenAPI khác ảnh chụp (`export_openapi.py --check`).
2. Fixture là response thật chụp từ server đã seed (`capture_fixtures.py`); test kiểm fixture khớp schema và mapper chỉ đọc trường có trong schema.
3. `api/schemas.gen.js` sinh từ ảnh chụp (`gen_zod.mjs`); `checkShape` kiểm response lúc chạy ở bản dev/eval, **chỉ cảnh báo**
   (không chặn dữ liệu ở bản phát hành); e2e coi cảnh báo là lỗi.

**Hệ quả.** Server đổi hợp đồng thì CI đỏ ngay ở PR đó, người đổi phải cập nhật client. Dữ liệu lạ ở máy người dùng không làm app
ngừng chạy. Phải chạy lại hai script khi server cố ý đổi schema.
