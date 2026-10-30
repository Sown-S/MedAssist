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
    """Waiting: sửa mọi trường. CheckedIn: chỉ sửa vital_signs."""
    model_config = ConfigDict(extra="forbid")
    chief_complaint: CleanStr | None = Field(default=None, min_length=1, max_length=2000)
    vital_signs: VitalSigns | None = None
    free_text_description: str | None = Field(default=None, max_length=4000)


class CancelRequest(BaseModel):
    reason: CleanStr = Field(min_length=3, max_length=500, description="Lý do hủy (bắt buộc)")


class BulkCancelRequest(CancelRequest):
    visit_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


Transport = Literal["Ambulance", "Family", "Self", "Other"]


class ReferralIn(BaseModel):
    """Thông tin giấy chuyển tuyến. facility_name bắt buộc; facility_id khi chọn từ danh mục."""
    model_config = ConfigDict(extra="forbid")
    facility_id: uuid.UUID | None = None
    facility_name: CleanStr = Field(min_length=2, max_length=255)
    reason: CleanStr = Field(min_length=3, max_length=500)
    diagnosis: CleanStr | None = Field(default=None, max_length=500)
    summary: CleanStr | None = Field(default=None, max_length=4000)
    treatment: CleanStr | None = Field(default=None, max_length=2000)
    condition: CleanStr | None = Field(default=None, max_length=500)
    transport: Transport | None = None
    signs: CleanStr | None = Field(default=None, max_length=2000, description="Dấu hiệu nguy hiểm ghi ở quầy")


class ReferralUpdate(BaseModel):
    """Bác sĩ bổ sung giấy chuyển tuyến sau khi lễ tân đã chuyển bệnh nhân đi."""
    model_config = ConfigDict(extra="forbid")
    facility_id: uuid.UUID | None = None
    facility_name: CleanStr | None = Field(default=None, min_length=2, max_length=255)
    reason: CleanStr | None = Field(default=None, min_length=3, max_length=500)
    diagnosis: CleanStr | None = Field(default=None, max_length=500)
    summary: CleanStr | None = Field(default=None, max_length=4000)
    treatment: CleanStr | None = Field(default=None, max_length=2000)
    condition: CleanStr | None = Field(default=None, max_length=500)
    transport: Transport | None = None


class EmergencyReferralCreate(BaseModel):
    """Cấp cứu ở quầy: tạo lượt khám và chuyển tuyến ngay, bệnh nhân không vào hàng đợi."""
    model_config = ConfigDict(extra="forbid")
    patient_id: uuid.UUID
    chief_complaint: CleanStr = Field(min_length=1, max_length=2000)
    vital_signs: VitalSigns | None = None
    referral: ReferralIn


class ReferralFacilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    facility_id: uuid.UUID
    kcb_code: str | None
    name: str
    province: str
    address: str | None
    facility_type: Literal["Hospital", "HealthCenter"]
    ownership: Literal["Public", "Ministry", "Private"] | None
    tech_level: str | None


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
    outcome: Literal["Referred"] | None = None
    referral: dict[str, Any] | None = None
    lab_out_at: datetime | None = None
    called_at: datetime | None = None
    called_by: uuid.UUID | None = None
    updated_at: datetime


class VisitWithWarnings(VisitOut):
    warnings: list[dict[str, Any]] = []


class QueueItem(BaseModel):
    """Một dòng hàng đợi (US10): đủ để hiển thị, không gồm sinh hiệu chi tiết."""
    visit_id: uuid.UUID
    queue_date: date
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
    physician_id: uuid.UUID | None
    physician_name: str | None
    exam_started_at: datetime | None
    room: str | None = Field(default=None, description="Mã phòng khám của bác sĩ đang khám")
    room_name: str | None = None
    lab_out_at: datetime | None = Field(default=None, description="Đang đi xét nghiệm từ lúc này")
    called_at: datetime | None = Field(default=None, description="Lần mời vào phòng gần nhất")
    called_by: uuid.UUID | None = None
    called_by_name: str | None = None
    called_room: str | None = Field(default=None, description="Mã phòng của bác sĩ đã mời")
    called_room_name: str | None = None
