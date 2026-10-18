"""API quản trị tri thức (US11, FR11): Admin soạn bản nháp, Bác sĩ duyệt bản phát hành, Admin tắt khẩn cấp."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import CleanStr
from app.validation.knowledge_validators import ConditionCode, ConditionLogic

Kind = Literal["symptoms", "conditions", "relations", "excerpts", "rules"]
ItemStatus = Literal["Draft", "PendingApproval", "Active", "Retired"]


# ============================================================================ bản phát hành
class ReleaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: CleanStr = Field(min_length=1, max_length=30, description="Nhãn phiên bản, vd KB-2026.02")
    description: str | None = Field(default=None, max_length=2000)


class ReviewNote(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: CleanStr = Field(min_length=3, max_length=2000, description="Lý do từ chối (bắt buộc)")


class ReleaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    release_id: uuid.UUID
    label: str
    description: str | None
    status: str
    created_by: uuid.UUID
    created_at: datetime
    submitted_at: datetime | None
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    review_note: str | None


class ReleaseChange(BaseModel):
    kind: Kind
    key: str
    action: Literal["new", "changed"]
    version: int
    status: str
    values: dict[str, Any]
    active_values: dict[str, Any] | None = None       # bản Active hiện tại để giao diện so sánh


class ReleaseDetail(ReleaseOut):
    changes: list[ReleaseChange] = []


# ============================================================================ nội dung từng loại
class SymptomDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symptom_name: CleanStr = Field(min_length=1, max_length=150)
    category: CleanStr | None = Field(default=None, max_length=100)


class ConditionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name_vi: CleanStr = Field(min_length=1, max_length=200)
    icd10_code: CleanStr | None = Field(default=None, max_length=10)
    disease_group: CleanStr | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=4000)


class RelationDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    polarity: Literal["SUPPORTS", "CONTRADICTS"]
    weight: Decimal = Field(ge=0, le=1, max_digits=3, decimal_places=2)
    is_key: bool = False
    source_id: uuid.UUID


class ExcerptDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    condition_code: ConditionCode
    title: CleanStr = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=8000, description="Diễn đạt lại, không chép nguyên văn dài")
    source_id: uuid.UUID
    source_locator: CleanStr | None = Field(default=None, max_length=100)


class RuleDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rule_name: CleanStr = Field(min_length=1, max_length=255)
    rule_type: Literal["RED_FLAG", "PRIORITY_FLOOR"]
    reason_text: CleanStr = Field(min_length=1, max_length=500, description="Một câu ngắn hiển thị cho bác sĩ")
    condition_logic: ConditionLogic
    source_id: uuid.UUID

    @property
    def resulting_priority(self) -> str:
        return {"RED_FLAG": "Emergency", "PRIORITY_FLOOR": "HighPriority"}[self.rule_type]


DRAFT_SCHEMAS: dict[str, type[BaseModel]] = {"symptoms": SymptomDraft, "conditions": ConditionDraft,
                                             "relations": RelationDraft, "excerpts": ExcerptDraft,
                                             "rules": RuleDraft}


class ItemOut(BaseModel):
    kind: Kind
    key: str
    version: int
    status: str
    release_id: uuid.UUID
    release_label: str | None = None
    created_at: datetime
    retired_at: datetime | None = None
    retired_reason: str | None = None
    values: dict[str, Any]


# ============================================================================ tắt khẩn cấp
class Dependent(BaseModel):
    kind: Kind
    key: str


class DeactivatePreview(BaseModel):
    kind: Kind
    key: str
    dependents: list[Dependent]


class DeactivateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: CleanStr = Field(min_length=3, max_length=500)
    confirm_dependents: list[Dependent] = Field(
        default_factory=list,
        description="Gửi lại đúng danh sách mục phụ thuộc vừa xem trước; lệch (do có thay đổi giữa chừng) thì bị từ chối")


# ============================================================================ nguồn
class SourceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: CleanStr = Field(min_length=1, max_length=255)
    organization: CleanStr = Field(min_length=1, max_length=100)
    edition: CleanStr = Field(min_length=1, max_length=50, description="Khóa tự nhiên cùng organization")
    publication_date: date | None = None
    url: str | None = None
    accessed_date: date | None = None
    license_note: str | None = None


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    source_id: uuid.UUID
    title: str
    organization: str
    edition: str | None
    publication_date: date | None
    url: str | None
    accessed_date: date | None
    license_note: str | None
    is_active: bool
