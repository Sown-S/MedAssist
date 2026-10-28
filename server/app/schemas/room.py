import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import CleanStr

RoomCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10,
                                            pattern=r"^[A-Za-z0-9_-]+$")]
RoomType = Literal["Exam", "Lab"]


class RoomCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: RoomCode
    name: CleanStr = Field(min_length=1, max_length=100)
    room_type: RoomType = "Exam"


class RoomUpdate(BaseModel):
    """Không đổi mã và loại phòng; bác sĩ gắn với phòng qua room_id."""
    model_config = ConfigDict(extra="forbid")
    name: CleanStr | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None


class RoomPhysician(BaseModel):
    user_id: uuid.UUID
    full_name: str


class RoomOut(BaseModel):
    room_id: uuid.UUID
    code: str
    name: str
    room_type: str
    is_active: bool
    physician: RoomPhysician | None
    updated_at: datetime
