"""Dependency ghi VIEW cho mọi GET dữ liệu bệnh nhân (US04, US09) — phần "Audit Middleware"
của Architecture v1.7, gắn theo route.

Dùng trong router:
    @router.get("/patients/{patient_id}")
    def get_patient(patient_id: uuid.UUID,
                    user: User = Depends(audit_view("patient", roles=CLINICAL_ROLES,
                                                    id_param="patient_id"))):
        ...

    # Endpoint polling (hàng đợi, trạng thái AI): gộp 1 dòng / người / đối tượng / 5 phút
    Depends(audit_view("visit", roles=CLINICAL_ROLES, dedupe_seconds=300))

Dòng VIEW được ghi TRƯỚC khi handler chạy, bằng session riêng và commit ngay, nên có cả
lượt xem không thành công (404). Sai vai trò: ghi lượt bị từ chối rồi trả 403.
"""
import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status

from app.core.auth import get_current_user, record_denied
from app.core.request_meta import client_ip, path_template, user_agent
from app.models.user import ROLES, User
from app.services import audit_service as audit

# Vai trò được xem dữ liệu bệnh nhân. Admin không thuộc nhóm này (chỉ xem nhật ký, kho, báo cáo).
CLINICAL_ROLES: tuple[str, ...] = ("Physician", "Nurse")

DEFAULT_POLL_WINDOW = 300   # giây


def audit_view(
    entity: str,
    *,
    roles: tuple[str, ...],
    id_param: str | None = None,
    dedupe_seconds: int = 0,
) -> Callable[..., User]:
    unknown = set(roles) - set(ROLES)
    if unknown or not roles:
        raise ValueError(f"Vai trò không hợp lệ: {unknown or 'rỗng'}")

    def _dependency(request: Request, user: User = Depends(get_current_user)) -> User:
        entity_id: uuid.UUID | None = None
        raw_id = request.path_params.get(id_param) if id_param else None
        if raw_id is not None:
            try:
                entity_id = uuid.UUID(str(raw_id))
            except ValueError:
                entity_id = None     # route sẽ tự trả 422; vẫn ghi lại lượt thử

        if user.role not in roles:
            record_denied(request, user, entity, entity_id)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Bạn không có quyền thực hiện thao tác này")

        path = path_template(request)
        if dedupe_seconds > 0:
            key = (user.user_id, entity, entity_id or path)
            if not audit.view_deduper.should_log(key, dedupe_seconds):
                return user

        details: dict = {"path": path}
        if raw_id is not None and entity_id is None:
            details["invalid_id"] = True
        if request.query_params:
            # Chỉ ghi TÊN tham số lọc, không ghi giá trị (thường là tên / SĐT bệnh nhân)
            details["query_keys"] = sorted(request.query_params.keys())
        if dedupe_seconds > 0:
            details["dedupe_window_s"] = dedupe_seconds

        audit.record_now(
            action="VIEW",
            entity=entity,
            entity_id=entity_id,
            actor_id=user.user_id,
            new_values=details,
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return user

    return _dependency