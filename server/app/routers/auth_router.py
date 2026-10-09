"""Xác thực tài khoản (US07, FR07) — ghi LOGIN, LOGIN_FAILED, LOGOUT vào AUDIT_LOG (US09)."""
import uuid

import jwt
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.request_meta import client_ip, user_agent
from app.core.security import (burn_verify_time, create_access_token, create_refresh_token,
                               decode_token, hash_password, verify_password)
from app.exceptions import AppError
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, RefreshRequest, TokenResponse, UserMe
from app.services import audit_service as audit
from app.services.login_guard import check_login_allowed

router = APIRouter(prefix="/auth", tags=["auth"])

# Một thông báo cho mọi kiểu thất bại: không tiết lộ username có tồn tại hay không
_LOGIN_FAILED = AppError(401, "UNAUTHORIZED", "Tên đăng nhập hoặc mật khẩu không đúng")
_REFRESH_FAILED = AppError(401, "UNAUTHORIZED", "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại")


def _tokens(user: User) -> TokenResponse:
    access, access_s = create_access_token(user.user_id, user.role)
    refresh, refresh_s = create_refresh_token(user.user_id, user.role)
    return TokenResponse(access_token=access, expires_in=access_s, refresh_token=refresh,
                         refresh_expires_in=refresh_s, role=user.role)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    meta = {"ip_address": client_ip(request), "user_agent": user_agent(request)}

    wait = check_login_allowed(db, body.username, meta["ip_address"])
    if wait:
        audit.record(db, action="LOGIN_FAILED", entity="users", attempted_username=body.username,
                     new_values={"reason": "locked", "retry_after_s": wait}, **meta)
        db.commit()
        raise AppError(429, "RATE_LIMITED",
                       f"Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau {wait} giây.",
                       [{"retry_after_seconds": wait}])

    user = db.scalar(select(User).where(User.username == body.username))
    if user is None:
        burn_verify_time(body.password)
        reason = "unknown_user"
    elif not verify_password(body.password, user.password_hash):
        reason = "bad_password"
    elif not user.is_active:
        reason = "inactive"
    else:
        reason = None

    if reason:
        # user_id có khi tài khoản có thật (sai mật khẩu / bị khóa); NULL khi không tồn tại
        audit.record(db, action="LOGIN_FAILED", entity="users",
                     entity_id=user.user_id if user else None,
                     actor_id=user.user_id if user else None,
                     attempted_username=body.username, new_values={"reason": reason}, **meta)
        db.commit()   # dòng log phải được lưu dù đăng nhập thất bại
        raise _LOGIN_FAILED

    audit.record(db, action="LOGIN", entity="users", entity_id=user.user_id, actor_id=user.user_id, **meta)
    db.commit()
    return _tokens(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Đổi refresh token lấy cặp token mới. Kiểm tra lại tài khoản và vai trò trong DB."""
    try:
        payload = decode_token(body.refresh_token, "refresh")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        raise _REFRESH_FAILED from None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _REFRESH_FAILED
    return _tokens(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, user: User = Depends(get_current_user),
           db: Session = Depends(get_db)) -> None:
    # JWT không trạng thái: client xóa cả hai token; server ghi nhận đăng xuất (US07)
    audit.record(db, action="LOGOUT", entity="users", entity_id=user.user_id, actor_id=user.user_id,
                 ip_address=client_ip(request), user_agent=user_agent(request))
    db.commit()


@router.get("/me", response_model=UserMe)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordRequest, request: Request,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    if not verify_password(body.old_password, user.password_hash):
        raise AppError(422, "WRONG_PASSWORD", "Mật khẩu hiện tại không đúng",
                       [{"field": "old_password", "in": "body", "message": "Không đúng"}])
    if body.new_password == body.old_password:
        raise AppError(422, "VALIDATION_ERROR", "Mật khẩu mới phải khác mật khẩu cũ",
                       [{"field": "new_password", "in": "body", "message": "Phải khác mật khẩu cũ"}])
    user.password_hash = hash_password(body.new_password)
    audit.record(db, action="UPDATE", entity="users", entity_id=user.user_id, actor_id=user.user_id,
                 new_values={"password_changed": True},
                 ip_address=client_ip(request), user_agent=user_agent(request))
    db.commit()
