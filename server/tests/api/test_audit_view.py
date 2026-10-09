"""Ghi VIEW theo route, gộp polling, ghi lượt bị từ chối (US04, US09, Architecture v1.7)."""
import uuid


def test_view_patient_logged_with_entity_and_query_keys_only(client, users, login, logs):
    pid = uuid.uuid4()
    r = client.get(f"/api/v1/_test/patients/{pid}", params={"q": "Nguyễn Văn A", "phone": "0905"},
                   headers=login("bs"))
    assert r.status_code == 200

    (row,) = logs(action="VIEW", entity="patient")
    assert row.user_id == users["bs"].user_id and row.entity_id == pid
    assert row.new_values == {"path": "/api/v1/_test/patients/{patient_id}", "query_keys": ["phone", "q"]}
    # Không lưu GIÁ TRỊ tìm kiếm (thường là tên / SĐT bệnh nhân)
    assert "Nguyễn" not in str(row.new_values) and "0905" not in str(row.new_values)


def test_list_endpoint_logged_without_entity_id(client, users, login, logs):
    assert client.get("/api/v1/_test/patients", headers=login("yta")).status_code == 200
    (row,) = logs(action="VIEW", entity="patient")
    assert row.entity_id is None and row.new_values == {"path": "/api/v1/_test/patients"}


def test_invalid_id_still_logged_before_handler(client, users, login, logs):
    r = client.get("/api/v1/_test/patients/khong-phai-uuid", headers=login("bs"))
    assert r.status_code == 422
    (row,) = logs(action="VIEW", entity="patient")
    assert row.entity_id is None and row.new_values["invalid_id"] is True


def test_admin_cannot_view_patient_and_denial_is_logged(client, users, login, logs):
    pid = uuid.uuid4()
    r = client.get(f"/api/v1/_test/patients/{pid}", headers=login("admin"))
    assert r.status_code == 403

    (row,) = logs(action="VIEW", entity="patient")
    assert row.user_id == users["admin"].user_id and row.entity_id == pid
    assert row.new_values == {"result": "denied", "status": 403, "role": "Admin", "method": "GET",
                              "path": "/api/v1/_test/patients/{patient_id}"}


def test_no_token_means_401_and_no_log(client, users, logs):
    assert client.get(f"/api/v1/_test/patients/{uuid.uuid4()}").status_code == 401
    assert logs() == []


def test_polling_is_deduplicated_per_user_and_entity(client, users, login, logs):
    nurse, doctor = login("yta"), login("bs")
    for _ in range(5):
        client.get("/api/v1/_test/queue", headers=nurse)
    client.get("/api/v1/_test/queue", headers=doctor)            # người khác: dòng riêng

    rows = logs(action="VIEW", entity="visit")
    assert len(rows) == 2
    assert {r.user_id for r in rows} == {users["yta"].user_id, users["bs"].user_id}
    assert rows[0].new_values["dedupe_window_s"] == 300


def test_polling_dedup_is_per_entity_id(client, users, login, logs):
    headers = login("bs")
    v1, v2 = uuid.uuid4(), uuid.uuid4()
    for v in (v1, v1, v1, v2, v2):
        client.get(f"/api/v1/_test/visits/{v}/ai-status", headers=headers)
    assert [r.entity_id for r in logs(action="VIEW", entity="visit")] == [v1, v2]


def test_emr_views_are_never_deduplicated(client, users, login, logs):
    headers, pid = login("bs"), uuid.uuid4()
    for _ in range(3):
        client.get(f"/api/v1/_test/patients/{pid}", headers=headers)
    assert len(logs(action="VIEW", entity="patient")) == 3


def test_require_roles_logs_denied_write_with_method_action(client, users, login, logs):
    assert client.post("/api/v1/_test/drugs", headers=login("yta")).status_code == 403
    (row,) = logs(entity="drug")
    assert row.action_type == "CREATE" and row.new_values["result"] == "denied"
    assert client.post("/api/v1/_test/drugs", headers=login("admin")).status_code == 200
    assert len(logs(entity="drug")) == 1                        # thành công: không ghi ở tầng này


def test_spoofed_forwarded_for_is_ignored(client, users, login, logs):
    """Không có proxy tin cậy (TRUSTED_PROXIES rỗng): header X-Forwarded-For bị bỏ qua."""
    headers = {**login("bs"), "X-Forwarded-For": "8.8.8.8"}
    client.get("/api/v1/_test/patients", headers=headers)
    (row,) = logs(action="VIEW", entity="patient")
    assert row.ip_address != "8.8.8.8"
