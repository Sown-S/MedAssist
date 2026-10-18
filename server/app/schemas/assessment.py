"""Schema phản hồi công khai cho đánh giá AI của một lượt khám."""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AiStatus = Literal["Pending", "Preliminary", "Ready", "Degraded", "Failed", "Skipped"]
AssessmentMode = Literal["Full", "RuleOnly"]
PriorityLevel = Literal["Routine", "HighPriority", "Emergency"]
RuleType = Literal["RED_FLAG", "PRIORITY_FLOOR"]


class PriorityOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule: PriorityLevel
    final: PriorityLevel
    raised_by_ai: bool


class AlertOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule_key: str
    rule_type: RuleType
    reason_text: str


class MissingInformationOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symptom_code: str
    symptom_name: str


class EvidenceOut(MissingInformationOut):
    weight: float = Field(gt=0, le=1, allow_inf_nan=False)
    is_key: bool


class CandidateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rank: int = Field(ge=1, le=3)
    condition_code: str
    name_vi: str
    icd10_code: str | None
    score: float = Field(ge=0, le=1, allow_inf_nan=False)
    supporting: list[EvidenceOut]
    contradicting: list[EvidenceOut]
    missing: list[MissingInformationOut]
    explanation: str | None
    label: Literal["Reference Suggestion"]


class AssessmentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assessment_id: uuid.UUID
    ai_status: AiStatus
    mode: AssessmentMode | None
    knowledge_release: str | None
    model_version: str | None
    prompt_version: str | None
    priority: PriorityOut
    alerts: list[AlertOut]
    complete_now: list[MissingInformationOut]
    candidates: list[CandidateOut] = Field(max_length=3)
