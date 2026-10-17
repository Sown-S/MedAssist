import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import CleanStr
from app.validation.knowledge_validators import ConditionCode


class DiagnosisCreate(BaseModel):
    """Chọn mã bệnh từ danh sách Active (tên, ICD-10 lấy theo danh mục nếu bỏ trống) hoặc nhập tự do."""
    model_config = ConfigDict(extra="forbid")
    condition_code: ConditionCode | None = None
    diagnosis_name: CleanStr | None = Field(default=None, min_length=1, max_length=255)
    icd10_code: CleanStr | None = Field(default=None, max_length=10)
    is_primary: bool = True
    clinical_notes: str | None = Field(default=None, max_length=4000)


class DiagnosisUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    diagnosis_name: CleanStr | None = Field(default=None, min_length=1, max_length=255)
    icd10_code: CleanStr | None = Field(default=None, max_length=10)
    is_primary: bool | None = None
    clinical_notes: str | None = Field(default=None, max_length=4000)


class DiagnosisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    diagnosis_id: uuid.UUID
    visit_id: uuid.UUID
    physician_id: uuid.UUID
    condition_code: str | None
    icd10_code: str | None
    diagnosis_name: str
    is_primary: bool
    confirmed_by_physician: bool
    matches_top_suggestion: bool | None
    clinical_notes: str | None
    created_at: datetime
    confirmed_at: datetime | None
