import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.security import MIN_PASSWORD_LENGTH


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
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=128)


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    username: str
    full_name: str
    role: str
