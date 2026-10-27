import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.schemas.common import CleanStr, NewPassword, PhoneVN

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


def _staff_code(v: str) -> str | None:
    v = v.strip().upper()
    if not v:
        return None
    if not re.fullmatch(r"[A-Z0-9_-]{1,20}", v):
        raise ValueError("Mã nhân viên tối đa 20 ký tự: chữ không dấu, số, gạch nối")
    return v


Username = Annotated[str, AfterValidator(_username)]
StaffCode = Annotated[str, AfterValidator(_staff_code)]
Email = Annotated[str, AfterValidator(_email)]


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Username
    full_name: CleanStr = Field(min_length=1, max_length=100)
    role: Role
    password: NewPassword
    email: Email | None = Field(default=None, max_length=100)
    phone: PhoneVN | None = None
    staff_code: StaffCode | None = None
    license_no: CleanStr | None = Field(default=None, max_length=30, description="Số chứng chỉ hành nghề (bác sĩ)")
    department_id: uuid.UUID | None = Field(default=None, description="Khoa được phân công (bác sĩ)")


class UserUpdate(BaseModel):
    """Không có username: tên đăng nhập không đổi sau khi tạo. Mật khẩu đổi qua endpoint riêng."""
    model_config = ConfigDict(extra="forbid")
    full_name: CleanStr | None = Field(default=None, min_length=1, max_length=100)
    role: Role | None = None
    is_active: bool | None = None
    email: Email | None = Field(default=None, max_length=100)
    phone: PhoneVN | None = None
    staff_code: StaffCode | None = None
    license_no: CleanStr | None = Field(default=None, max_length=30)
    department_id: uuid.UUID | None = None


class PasswordReset(BaseModel):
    new_password: NewPassword


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: uuid.UUID
    username: str
    full_name: str
    role: str
    email: str | None
    phone: str | None
    is_active: bool
    must_change_password: bool
    staff_code: str | None
    license_no: str | None
    department_id: uuid.UUID | None
    department_name: str | None = None
    created_at: datetime
    # Tính từ audit_log, không phải cột (ERD v1.9 mục 2.1)
    created_by: str | None = None
    last_login_at: datetime | None = None
    locked_until: datetime | None = None
