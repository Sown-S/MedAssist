import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.core.security import MIN_PASSWORD_LENGTH
from app.schemas.common import CleanStr, PhoneVN

Role = Literal["Physician", "Nurse", "Admin"]


def _username(v: str) -> str:
    v = v.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9._]{2,49}", v):
        raise ValueError("Tên đăng nhập 3-50 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới")
    if v == "system":
        raise ValueError("Tên 'system' dành cho tài khoản hệ thống")
    return v


def _email(v: str) -> str:
    v = v.strip()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
        raise ValueError("Email không hợp lệ")
    return v.lower()


Username = Annotated[str, AfterValidator(_username)]
Email = Annotated[str, AfterValidator(_email)]


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Username
    full_name: CleanStr = Field(min_length=1, max_length=100)
    role: Role
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=128)
    email: Email | None = Field(default=None, max_length=100)
    phone: PhoneVN | None = None


class UserUpdate(BaseModel):
    """Không có username: tên đăng nhập không đổi sau khi tạo. Mật khẩu đổi qua endpoint riêng."""
    model_config = ConfigDict(extra="forbid")
    full_name: CleanStr | None = Field(default=None, min_length=1, max_length=100)
    role: Role | None = None
    is_active: bool | None = None
    email: Email | None = Field(default=None, max_length=100)
    phone: PhoneVN | None = None


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: uuid.UUID
    username: str
    full_name: str
    role: str
    email: str | None
    phone: str | None
    is_active: bool
    created_at: datetime
