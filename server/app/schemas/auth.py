import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import NewPassword


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=2048)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int              # giây
    refresh_token: str
    refresh_expires_in: int      # giây
    role: str


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: NewPassword


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    username: str
    full_name: str
    role: str
    must_change_password: bool
    staff_code: str | None
    license_no: str | None
    department_id: uuid.UUID | None


class PasswordPolicy(BaseModel):
    """Chính sách mật khẩu và khóa đăng nhập server đang áp dụng (client hiển thị chỉ đọc)."""
    min_length: int
    require_letters_and_digits: bool
    max_failed_attempts: int
    failed_window_minutes: int
    lock_minutes: int
