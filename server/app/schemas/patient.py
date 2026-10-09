import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field

from app.schemas.common import CleanStr, PhoneVN, _empty_to_none

Gender = Literal["Male", "Female", "Other"]
MAX_AGE_YEARS = 130


def _dob(v: date) -> date:
    today = date.today()
    if v > today:
        raise ValueError("Ngày sinh không được ở tương lai")
    if v.year < today.year - MAX_AGE_YEARS:
        raise ValueError(f"Ngày sinh quá xa (trên {MAX_AGE_YEARS} tuổi)")
    return v


def _id_number(v: str) -> str:
    v = re.sub(r"\s", "", v)
    if not re.fullmatch(r"\d{12}|\d{9}", v):
        raise ValueError("Số CCCD phải có 12 chữ số (hoặc CMND cũ 9 chữ số)")
    return v


DateOfBirth = Annotated[date, AfterValidator(_dob)]
IdNumber = Annotated[str, BeforeValidator(_empty_to_none), AfterValidator(_id_number)]


class MedicalHistory(BaseModel):
    """patient.medical_history (JSONB). Bệnh nền dùng cho phần nhắc khi kê đơn (US03, chỉ đọc)."""
    model_config = ConfigDict(extra="forbid")
    chronic_conditions: list[Annotated[CleanStr, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=30, description="Bệnh nền, vd 'Tăng huyết áp'")
    notes: str | None = Field(default=None, max_length=2000)


class _PatientFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_number: IdNumber | None = None
    phone: PhoneVN | None = None
    address: CleanStr | None = Field(default=None, max_length=255)
    medical_history: MedicalHistory | None = None
    allergy_notes: str | None = Field(default=None, max_length=2000)


class PatientCreate(_PatientFields):
    full_name: CleanStr = Field(min_length=1, max_length=100)
    date_of_birth: DateOfBirth
    gender: Gender
    confirm_duplicate: bool = Field(
        default=False, description="Gửi lại với true sau khi đã kiểm tra danh sách có thể trùng (409)")


class PatientUpdate(_PatientFields):
    full_name: CleanStr | None = Field(default=None, min_length=1, max_length=100)
    date_of_birth: DateOfBirth | None = None
    gender: Gender | None = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    patient_id: uuid.UUID
    full_name: str
    date_of_birth: date
    gender: str
    id_number: str | None
    phone: str | None
    address: str | None
    medical_history: dict | None
    allergy_notes: str | None
    created_at: datetime
    updated_at: datetime


class PatientSummary(BaseModel):
    """Dòng trong kết quả tìm kiếm / danh sách có thể trùng."""
    model_config = ConfigDict(from_attributes=True)
    patient_id: uuid.UUID
    full_name: str
    date_of_birth: date
    gender: str
    phone: str | None
