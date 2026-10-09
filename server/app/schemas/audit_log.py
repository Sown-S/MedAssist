import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.audit_log import ACTION_TYPES

ActionType = Literal[ACTION_TYPES]  # type: ignore[valid-type]


class AuditLogFilter(BaseModel):
    """Bộ lọc dùng chung cho xem và xuất nhật ký."""
    user_id: uuid.UUID | None = None
    username: str | None = Field(default=None, max_length=50, description="Khớp chính xác; gồm cả tên đã thử khi LOGIN_FAILED")
    action_type: ActionType | None = None
    target_entity: str | None = Field(default=None, max_length=50)
    entity_id: uuid.UUID | None = None
    created_from: datetime | None = Field(default=None, description="ISO 8601, có múi giờ, vd 2026-10-10T00:00:00+07:00")
    created_to: datetime | None = None


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: uuid.UUID
    created_at: datetime
    action_type: str
    user_id: uuid.UUID | None
    username: str | None          # tên tài khoản thực hiện (join users)
    attempted_username: str | None
    target_entity: str
    entity_id: uuid.UUID | None
    old_values: dict[str, Any] | None
    new_values: dict[str, Any] | None
    ip_address: str | None
    user_agent: str | None


class AuditLogPage(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[AuditLogOut]