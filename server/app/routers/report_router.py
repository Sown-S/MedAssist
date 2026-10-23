"""Báo cáo tổng hợp và nhật ký AI (US09): chỉ Admin, số liệu ẩn danh."""
import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.audit_view import DEFAULT_POLL_WINDOW, audit_view
from app.core.database import get_db
from app.models import User
from app.schemas.report import AiLogPage, ReportSummary
from app.services import report_service

router = APIRouter(tags=["reports"])

ADMIN = ("Admin",)


@router.get("/reports/summary", response_model=ReportSummary)
def report_summary(date_from: datetime.date | None = None, date_to: datetime.date | None = None,
                   _: User = Depends(audit_view("report", roles=ADMIN, dedupe_seconds=DEFAULT_POLL_WINDOW)),
                   db: Session = Depends(get_db)):
    """Lượt khám, doanh thu đã thu, hiệu quả AI trong [date_from, date_to]. Mặc định hôm nay."""
    return report_service.summary(db, date_from, date_to)


@router.get("/admin/ai-logs", response_model=AiLogPage)
def list_ai_logs(date_from: datetime.date | None = None, date_to: datetime.date | None = None,
                 run_type: Literal["Assessment", "Extraction"] | None = None,
                 status: Literal["Queued", "Running", "Completed", "Degraded", "Failed", "Skipped"] | None = None,
                 mode: Literal["Full", "RuleOnly"] | None = None,
                 limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                 _: User = Depends(audit_view("ai_assessment_log", roles=ADMIN, dedupe_seconds=DEFAULT_POLL_WINDOW)),
                 db: Session = Depends(get_db)):
    """Nhật ký chạy AI, mới nhất trước. Không có bệnh nhân, triệu chứng hay đầu ra thô của LLM."""
    return report_service.ai_logs(db, date_from, date_to, run_type=run_type, status=status, mode=mode,
                                  limit=limit, offset=offset)
