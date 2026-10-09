"""Xác thực tài khoản (US07, FR07) — ghi LOGIN, LOGIN_FAILED, LOGOUT vào AUDIT_LOG (US09)."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.request_meta import client_ip, user_agent
from app.core.security import burn_verify_time, create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserMe
from app.services import audit_service as audit

router = APIRouter(prefix="/auth", tags=["auth"])

# Một thông báo cho mọi kiểu thất bại: không tiết lộ username có tồn tại hay không
_LOGIN_FAILED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Tên đăng nhập hoặc mật khẩu không đúng",
)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    meta = {"ip_address": client_ip(request), "user_agent": user_agent(request)}
    user = db.scalar(select(User).where(User.username == body.username))

    if user is None:
        burn_verify_time(body.password)
        ok, reason = False, "unknown_user"
    elif not verify_password(body.password, user.password_hash):
        ok, reason = False, "bad_password"
    elif not user.is_active:
        ok, reason = False, "inactive"
    else:
        ok, reason = True, None

    if not ok:
        # user_id có khi tài khoản có thật (sai mật khẩu / bị khóa); NULL khi không tồn tại
        audit.record(db, action="LOGIN_FAILED", entity="users",
                     entity_id=user.user_id if user else None,
                     actor_id=user.user_id if user else None,
                     attempted_username=body.username,
                     new_values={"reason": reason}, **meta)
        db.commit()   # dòng log phải được lưu dù đăng nhập thất bại
        raise _LOGIN_FAILED

    token, expires_in = create_access_token(user.user_id, user.role)
    audit.record(db, action="LOGIN", entity="users", entity_id=user.user_id,
                 actor_id=user.user_id, **meta)
    db.commit()
    return TokenResponse(access_token=token, expires_in=expires_in, role=user.role)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, user: User = Depends(get_current_user),
           db: Session = Depends(get_db)) -> None:
    # JWT không trạng thái: client xóa token; server ghi nhận đăng xuất (US07)
    audit.record(db, action="LOGOUT", entity="users", entity_id=user.user_id, actor_id=user.user_id,
                 ip_address=client_ip(request), user_agent=user_agent(request))
    db.commit()


@router.get("/me", response_model=UserMe)
def me(user: User = Depends(get_current_user)) -> User:
    return user