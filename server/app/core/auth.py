"""Xác thực (JWT Bearer) và phân quyền theo vai trò (RBAC) — thực thi ở server.

Dùng trong router:
    current_user: User = Depends(get_current_user)
    _: User = Depends(require_roles("Admin"))
"""
import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import ROLES, User

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


def require_roles(*roles: str) -> Callable[..., User]:
    unknown = set(roles) - set(ROLES)
    if unknown:
        raise ValueError(f"Vai trò không tồn tại: {unknown}")

    def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Bạn không có quyền thực hiện thao tác này")
        return user

    return _checker