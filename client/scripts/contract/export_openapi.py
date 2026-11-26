"""Xuất schema OpenAPI của server ra client/tests/contract/openapi.json (bản chụp cho test hợp đồng client).

    cd server && python ../client/scripts/contract/export_openapi.py          # ghi file
    cd server && python ../client/scripts/contract/export_openapi.py --check  # CI: báo lỗi nếu khác bản đã commit

Khi --check báo khác: server vừa đổi schema. Chạy lại không có --check, chụp lại fixture
(client/scripts/contract/capture_fixtures.py) rồi chạy test client để biết hàm chuyển đổi nào cần sửa.
"""

import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "tests" / "contract" / "openapi.json"


def main() -> int:
    sys.path.insert(0, str(Path.cwd()))
    from app.main import app  # noqa: PLC0415 — cần chạy trong thư mục server

    schema = app.openapi()
    schema.get("info", {}).pop("version", None)  # đổi số phiên bản không phải đổi hợp đồng
    text = json.dumps(schema, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if "--check" in sys.argv:
        old = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if old != text:
            print(
                "::error::Schema OpenAPI của server khác client/tests/contract/openapi.json. "
                "Chạy client/scripts/contract/export_openapi.py (không --check), chụp lại fixture và chạy test client."
            )
            return 1
        print("OpenAPI khớp bản chụp của client.")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"Đã ghi {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
