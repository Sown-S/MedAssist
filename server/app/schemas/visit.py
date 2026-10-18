import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import CleanStr
from app.validation.schema_validators import VitalSigns

VisitStatus = Literal["Waiting", "CheckedIn", "Examining", "Prescribed", "Finished", "Cancelled"]


class VisitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient_id: uuid.UUID
    chief_complaint: CleanStr = Field(min_length=1, max_length=2000, description="Lý do khám")
    vital_signs: VitalSigns | None = None
    free_text_description: str | None = Field(default=None, max_length=4000)


class VisitUpdate(BaseModel):
    """Chỉ sửa được khi lượt khám còn Waiting."""
    model_config = ConfigDict(extra="forbid")
    chief_complaint: CleanStr | None = Field(default=None, min_length=1, max_length=2000)
    vital_signs: VitalSigns | None = None
    free_text_description: str | None = Field(default=None, max_length=4000)


class CancelRequest(BaseModel):
    reason: CleanStr = Field(min_length=3, max_length=500, description="Lý do hủy (bắt buộc)")


class BulkCancelRequest(CancelRequest):
    visit_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    visit_id: uuid.UUID
    patient_id: uuid.UUID
    nurse_id: uuid.UUID
    physician_id: uuid.UUID | None
    status: str
    queue_date: date
    queue_number: int | None
    visit_date: datetime
    checked_in_at: datetime | None
    exam_started_at: datetime | None
    finished_at: datetime | None
    chief_complaint: str
    vital_signs: dict[str, Any] | None
    free_text_description: str | None
    triage_priority: str | None
    triage_priority_rule: str | None
    priority_raised_by_ai: bool
    is_red_flag: bool
    red_flag_reason: str | None
    ai_status: str
    updated_at: datetime


class VisitWithWarnings(VisitOut):
    warnings: list[dict[str, Any]] = []


class QueueItem(BaseModel):
    """Một dòng hàng đợi (US10): đủ để hiển thị, không gồm sinh hiệu chi tiết."""
    visit_id: uuid.UUID
    queue_number: int | None
    status: str
    patient_id: uuid.UUID
    patient_name: str
    date_of_birth: date
    gender: str
    chief_complaint: str
    triage_priority: str | None
    is_red_flag: bool
    red_flag_reason: str | None
    priority_raised_by_ai: bool
    ai_status: str
    visit_date: datetime
    checked_in_at: datetime | None
