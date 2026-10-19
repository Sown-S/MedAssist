"""Triệu chứng đã xác nhận của một lượt khám (HITL, bảng visit_symptom) — đầu vào bắt buộc của AI."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.validation.knowledge_validators import SymptomCode

SymptomState = Literal["PRESENT", "ABSENT", "UNKNOWN"]
SymptomSource = Literal["Form", "Extracted", "Prompt"]


class SymptomConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symptom_code: SymptomCode
    state: SymptomState
    source: SymptomSource = Field(default="Form",
                                  description="Form: chọn trên form; Extracted: gợi ý trích xuất đã được xác nhận; "
                                              "Prompt: bổ sung theo nhắc 'cần bổ sung ngay'")


class SymptomsPut(BaseModel):
    """Thay TOÀN BỘ danh sách đã xác nhận. Mã có trước đó mà không còn trong danh sách được đặt về
    UNKNOWN (CSDL không xóa dòng, giữ vết người xác nhận)."""
    model_config = ConfigDict(extra="forbid")
    symptoms: list[SymptomConfirm] = Field(max_length=200)

    @field_validator("symptoms")
    @classmethod
    def _unique(cls, v: list[SymptomConfirm]) -> list[SymptomConfirm]:
        codes = [s.symptom_code for s in v]
        dup = sorted({c for c in codes if codes.count(c) > 1})
        if dup:
            raise ValueError(f"Mã triệu chứng bị lặp: {', '.join(dup)}")
        return v


class VisitSymptomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    symptom_code: str
    symptom_name: str | None = None
    state: str
    source: str
    confirmed_at: datetime
