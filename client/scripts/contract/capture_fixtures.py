"""Chụp response thật của server làm fixture cho test hợp đồng client (client/tests/contract/fixtures).

Chạy khi server đổi schema hoặc khi thêm màn hình đọc endpoint mới:
    1. Bật server với dữ liệu kiểm thử (deploy/docker-compose.eval.yml hoặc server/scripts/seed_eval.py).
    2. python client/scripts/contract/capture_fixtures.py --base http://127.0.0.1:8000 --password Kiemthu@2026
Mỗi fixture ghi: method, path mẫu theo OpenAPI, status và body. Test client kiểm body khớp schema OpenAPI
(client/tests/contract/openapi.json) và các hàm chuyển đổi đọc đúng trường.
Chỉ dùng dữ liệu giả của môi trường kiểm thử, không chạy với máy chủ phòng khám thật.
"""

import argparse
import datetime
import json
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parents[2] / "tests" / "contract" / "fixtures"
V1 = "/api/v1"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--password", default="Kiemthu@2026")
    args = ap.parse_args()
    s = requests.Session()

    def token(user: str) -> dict:
        r = s.post(args.base + V1 + "/auth/login", json={"username": user, "password": args.password}, timeout=10)
        r.raise_for_status()
        return {"Authorization": "Bearer " + r.json()["access_token"]}

    hdr = {"nurse": token("letan01"), "physician": token("bs01"), "admin": token("admin")}
    saved: list[str] = []

    def get(name: str, role: str, template: str, path: str | None = None, *, limit_list: int = 3) -> object:
        r = s.get(args.base + V1 + (path or template), headers=hdr[role], timeout=20)
        body = r.json() if r.content else None
        # Rút gọn danh sách dài cho fixture nhỏ gọn (vẫn giữ đúng dạng phần tử).
        if isinstance(body, list):
            body = body[:limit_list]
        elif isinstance(body, dict) and isinstance(body.get("items"), list):
            body = {**body, "items": body["items"][:limit_list]}
        (OUT / f"{name}.json").write_text(
            json.dumps(
                {"method": "get", "path": V1 + template, "status": r.status_code, "role": role, "body": body},
                ensure_ascii=False,
                indent=1,
            )
            + "\n",
            encoding="utf-8",
        )
        saved.append(f"{name} ({r.status_code})")
        return r.json() if r.content else None

    OUT.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    week = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()

    get("auth_me", "nurse", "/auth/me")
    get("client_config", "nurse", "/auth/client-config")
    patients = get("patients_list", "nurse", "/patients", "/patients?limit=5")
    pid = patients["items"][0]["patient_id"]
    get("patient", "nurse", "/patients/{patient_id}", f"/patients/{pid}")
    get("patient_lookup", "nurse", "/patients/lookup", "/patients/lookup?term=Nguy&limit=5")
    queue = get("queue", "nurse", "/queue", "/queue?include_closed=true")
    get("visits_stale", "nurse", "/visits/stale")
    get("billing_awaiting", "nurse", "/billing/awaiting")
    get("billing_invoices", "nurse", "/billing/invoices", "/billing/invoices?include_cancelled=true")
    rx = get("prescriptions", "physician", "/prescriptions", f"/prescriptions?from={week}&to={today}&limit=5")
    get("symptoms", "nurse", "/symptoms")
    get("rooms", "nurse", "/rooms")
    get("drugs", "admin", "/drugs", "/drugs?active_only=false&limit=5")
    get("inventory_stock", "admin", "/inventory/stock")
    get("inventory_batches", "admin", "/inventory/batches", "/inventory/batches?include_depleted=true")
    get("services", "nurse", "/services")
    get("service_packages", "nurse", "/service-packages")
    get("referral_facilities", "physician", "/referral-facilities", "/referral-facilities?q=B%E1%BB%87nh&limit=3")
    get("admin_users", "admin", "/admin/users", "/admin/users?limit=5")
    get("admin_settings", "admin", "/admin/settings")
    get(
        "knowledge_conditions",
        "admin",
        "/admin/knowledge/{kind}",
        "/admin/knowledge/conditions?status=Active&limit=3",
    )
    get("knowledge_releases", "admin", "/admin/knowledge/releases")
    get("ai_logs", "admin", "/admin/ai-logs", "/admin/ai-logs?limit=3")

    # Một lượt có đơn thuốc và hoá đơn (lượt cũ của dữ liệu kiểm thử) và một lượt trong hàng chờ hôm nay.
    items = rx["items"] if isinstance(rx, dict) else rx
    done = items[0]["visit_id"] if items else queue[0]["visit_id"]
    done_pid = s.get(args.base + V1 + f"/visits/{done}", headers=hdr["physician"], timeout=20).json()["patient_id"]
    get("patient_visits", "physician", "/patients/{patient_id}/visits", f"/patients/{done_pid}/visits?limit=3")
    get(
        "patient_history",
        "physician",
        "/patients/{patient_id}/history",
        f"/patients/{done_pid}/history?limit=3&offset=0&include_cancelled=false",
    )
    for name, template in [
        ("visit", "/visits/{visit_id}"),
        ("visit_symptoms", "/visits/{visit_id}/symptoms"),
        ("visit_diagnoses", "/visits/{visit_id}/diagnoses"),
        ("visit_assessment", "/visits/{visit_id}/assessment"),
        ("visit_prescription", "/visits/{visit_id}/prescription"),
        ("visit_invoice", "/visits/{visit_id}/invoice"),
        ("visit_record", "/visits/{visit_id}/record"),
        ("visit_service_orders", "/visits/{visit_id}/service-orders"),
    ]:
        get(name, "physician", template, template.replace("{visit_id}", done))
    print("Đã lưu:", ", ".join(saved))


if __name__ == "__main__":
    main()
