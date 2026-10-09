"""Xác thực (JWT Bearer) và phân quyền theo vai trò (RBAC) — thực thi ở server.

Dùng trong router:
    current_user: User = Depends(get_current_user)
    _: User = Depends(require_roles("Admin"))
"""
import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.request_meta import client_ip, path_template, user_agent
from app.core.security import decode_access_token
from app.models.user import ROLES, User
from app.services import audit_service as audit

_bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Chưa đăng nhập hoặc phiên đã hết hạn",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _UNAUTHORIZED
    try:
        payload = decode_access_token(creds.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        raise _UNAUTHORIZED from None

    # Đọc lại từ DB mỗi request: khóa tài khoản hoặc đổi vai trò có hiệu lực ngay,
    # không phải đợi token hết hạn.
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _UNAUTHORIZED
    return user


# Phương thức HTTP -> loại hành động khi ghi lượt bị từ chối
_METHOD_ACTION = {"GET": "VIEW", "HEAD": "VIEW", "POST": "CREATE", "PUT": "UPDATE",
                  "PATCH": "UPDATE", "DELETE": "DELETE"}


def record_denied(request: Request, user: User, entity: str,
                  entity_id: uuid.UUID | None = None) -> None:
    """Ghi lượt truy cập bị từ chối vì sai vai trò (Architecture v1.7, kịch bản bảo mật)."""
    audit.record_now(
        action=_METHOD_ACTION.get(request.method, "VIEW"),
        entity=entity,
        entity_id=entity_id,
        actor_id=user.user_id,
        new_values={"result": "denied", "status": 403, "role": user.role,
                    "method": request.method, "path": path_template(request)},
        ip_address=client_ip(request),
        user_agent=user_agent(request),
    )


def require_roles(*roles: str, audit_entity: str | None = None) -> Callable[..., User]:
    """Chặn người không thuộc `roles`. Có audit_entity thì ghi lượt bị từ chối vào AUDIT_LOG."""
    unknown = set(roles) - set(ROLES)
    if unknown or not roles:
        raise ValueError(f"Vai trò không hợp lệ: {unknown or 'rỗng'}")

    def _checker(request: Request, user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            if audit_entity:
                record_denied(request, user, audit_entity)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Bạn không có quyền thực hiện thao tác này")
        return user

    return _checker
