"""Báo cáo tổng hợp và nhật ký AI cho Admin: chỉ số liệu ẩn danh, không có bệnh nhân hay nội dung lâm sàng."""
import datetime
import uuid

from pydantic import BaseModel

from app.schemas.common import Page
from app.schemas.inventory import MoneyOut


class VisitStats(BaseModel):
    total: int
    by_status: dict[str, int]
    red_flags: int
    referred: int = 0


class RevenueDay(BaseModel):
    date: datetime.date
    total: MoneyOut


class RevenueStats(BaseModel):
    invoices_paid: int
    total: MoneyOut
    consultation: MoneyOut
    paraclinical: MoneyOut
    drug: MoneyOut
    by_day: list[RevenueDay]


class AiAssessmentStats(BaseModel):
    total: int
    full: int
    rule_only: int
    failed: int
    skipped: int
    pending: int
    avg_latency_ms: int | None


class AiDecisionStats(BaseModel):
    accepted_top: int
    chose_other: int
    no_suggestion: int
    acceptance_rate: float | None


class AiExtractionStats(BaseModel):
    total: int
    completed: int
    failed: int


class AiStats(BaseModel):
    assessments: AiAssessmentStats
    decisions: AiDecisionStats
    extractions: AiExtractionStats


class ReportSummary(BaseModel):
    date_from: datetime.date
    date_to: datetime.date
    visits: VisitStats
    revenue: RevenueStats
    ai: AiStats


class AiLogOut(BaseModel):
    assessment_id: uuid.UUID
    run_type: str
    status: str
    mode: str | None
    priority_rule: str | None
    priority_final: str | None
    suggested_codes: list[str]
    model_name: str | None
    prompt_version: str | None
    knowledge_release_label: str | None
    latency_phase1_ms: int | None
    latency_llm_ms: int | None
    latency_total_ms: int | None
    attempt_count: int
    error_detail: str | None
    physician_decision: str | None
    queued_at: datetime.datetime
    started_at: datetime.datetime | None
    completed_at: datetime.datetime | None


AiLogPage = Page[AiLogOut]
