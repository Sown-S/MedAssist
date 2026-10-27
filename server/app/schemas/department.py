import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import CleanStr

DepartmentCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20,
                                                  pattern=r"^[A-Za-z0-9_-]+$")]


class DepartmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: DepartmentCode
    name: CleanStr = Field(min_length=1, max_length=100)
    room: CleanStr | None = Field(default=None, max_length=30)


class DepartmentUpdate(BaseModel):
    """Không đổi mã khoa (lượt khám, ca trực cũ tham chiếu theo khoa)."""
    model_config = ConfigDict(extra="forbid")
    name: CleanStr | None = Field(default=None, min_length=1, max_length=100)
    room: CleanStr | None = Field(default=None, max_length=30)
    is_active: bool | None = None


class DepartmentDoctor(BaseModel):
    user_id: uuid.UUID
    full_name: str


class DepartmentOut(BaseModel):
    department_id: uuid.UUID
    code: str
    name: str
    room: str | None
    is_active: bool
    doctors: list[DepartmentDoctor]
    updated_at: datetime


class DutyStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    department_id: uuid.UUID | None = Field(default=None, description="Bỏ trống = khoa được phân công")


class DutyBreak(BaseModel):
    model_config = ConfigDict(extra="forbid")
    on: bool


class DutyOut(BaseModel):
    duty_id: uuid.UUID
    physician_id: uuid.UUID
    physician_name: str
    department_id: uuid.UUID
    department_code: str
    department_name: str
    room: str | None
    duty_date: date
    started_at: datetime
    break_since: datetime | None
    status: Literal["on", "break", "examining"]
    examining_visit_id: uuid.UUID | None
