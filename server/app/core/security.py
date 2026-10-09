"""Băm mật khẩu (Argon2id) và JWT access token ngắn hạn."""
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

_hasher = PasswordHasher()   # tham số mặc định của argon2-cffi (Argon2id, RFC 9106 low-memory)

# Băm sẵn một mật khẩu giả: khi username không tồn tại vẫn tốn đúng một lần verify,
# để thời gian phản hồi không tiết lộ username nào có thật.
_DUMMY_HASH = _hasher.hash("medassist-dummy-password")

MIN_PASSWORD_LENGTH = 8


def hash_password(password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Mật khẩu phải có ít nhất {MIN_PASSWORD_LENGTH} ký tự")
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """False khi sai mật khẩu, hoặc hash không hợp lệ (vd tài khoản 'system' cố ý vô hiệu)."""
    try:
        return _hasher.verify(password_hash, password)
    except InvalidHashError:
        burn_verify_time(password)   # hash hỏng/vô hiệu vẫn tốn thời gian như bình thường
        return False
    except (VerifyMismatchError, VerificationError):
        return False


def burn_verify_time(password: str) -> None:
    """Gọi khi username không tồn tại: tốn thời gian như một lần verify thật."""
    try:
        _hasher.verify(_DUMMY_HASH, password)
    except VerificationError:
        pass


def _create_token(user_id: uuid.UUID, role: str, token_type: str, lifetime: timedelta) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,            # chỉ để client hiển thị; server luôn đọc role từ DB
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: uuid.UUID, role: str) -> tuple[str, int]:
    """Trả (token, số giây hiệu lực). Access token ngắn hạn (mặc định 15 phút)."""
    lifetime = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return _create_token(user_id, role, "access", lifetime), int(lifetime.total_seconds())


def create_refresh_token(user_id: uuid.UUID, role: str) -> tuple[str, int]:
    """Refresh token cho một ca làm việc (mặc định 8 giờ). Không lưu DB: mỗi lần làm mới,
    server kiểm tra lại tài khoản còn hoạt động và đọc lại vai trò. Thu hồi = khóa tài khoản."""
    lifetime = timedelta(hours=settings.REFRESH_TOKEN_EXPIRE_HOURS)
    return _create_token(user_id, role, "refresh", lifetime), int(lifetime.total_seconds())


def decode_token(token: str, expected_type: str) -> dict:
    """Ném jwt.PyJWTError nếu token sai chữ ký, hết hạn, sai loại hoặc thiếu trường."""
    payload = jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        options={"require": ["sub", "exp", "iat", "type"]},
    )
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Sai loại token")
    return payload


def decode_access_token(token: str) -> dict:
    return decode_token(token, "access")
