"""Quản trị — phần nhật ký (US09): chỉ Admin xem và xuất. Kho, hóa đơn, báo cáo thêm sau."""
import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.audit_view import audit_view
from app.core.database import get_db
from app.core.request_meta import client_ip, user_agent
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogFilter, AuditLogOut, AuditLogPage
from app.services import audit_service as audit

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN = ("Admin",)
EXPORT_MAX_ROWS = 50_000


def _filtered(f: AuditLogFilter) -> Select:
    if f.created_from and f.created_to and f.created_from > f.created_to:
        raise HTTPException(status_code=422,
                            detail="created_from phải trước created_to")
    stmt = select(AuditLog, User.username).outerjoin(User, AuditLog.user_id == User.user_id)
    if f.user_id:
        stmt = stmt.where(AuditLog.user_id == f.user_id)
    if f.username:
        stmt = stmt.where(or_(User.username == f.username, AuditLog.attempted_username == f.username))
    if f.action_type:
        stmt = stmt.where(AuditLog.action_type == f.action_type)
    if f.target_entity:
        stmt = stmt.where(AuditLog.target_entity == f.target_entity)
    if f.entity_id:
        stmt = stmt.where(AuditLog.entity_id == f.entity_id)
    if f.created_from:
        stmt = stmt.where(AuditLog.created_at >= f.created_from)
    if f.created_to:
        stmt = stmt.where(AuditLog.created_at <= f.created_to)
    return stmt


def _to_out(row: AuditLog, username: str | None) -> AuditLogOut:
    return AuditLogOut.model_validate({**{c: getattr(row, c) for c in AuditLogOut.model_fields
                                          if c != "username"}, "username": username})


@router.get("/audit-logs", response_model=AuditLogPage)
def list_audit_logs(
    f: AuditLogFilter = Depends(),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: User = Depends(audit_view("audit_log", roles=ADMIN)),
    db: Session = Depends(get_db),
) -> AuditLogPage:
    stmt = _filtered(f)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.execute(
        stmt.order_by(AuditLog.created_at.desc(), AuditLog.log_id.desc()).limit(limit).offset(offset)
    ).all()
    return AuditLogPage(total=total or 0, limit=limit, offset=offset,
                        items=[_to_out(r, u) for r, u in rows])


_EXPORT_COLUMNS = ["created_at", "action_type", "username", "attempted_username", "target_entity",
                   "entity_id", "old_values", "new_values", "ip_address", "user_agent", "log_id"]
_VN_TZ = timezone(timedelta(hours=7))   # Việt Nam không có giờ mùa hè; không cần gói tzdata trên Windows
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _export_values(log: AuditLog, username: str | None) -> list:
    return [
        log.created_at.astimezone(_VN_TZ).replace(tzinfo=None),   # Excel không nhận múi giờ
        log.action_type, username or "", log.attempted_username or "", log.target_entity,
        str(log.entity_id) if log.entity_id else "",
        json.dumps(log.old_values, ensure_ascii=False) if log.old_values else "",
        json.dumps(log.new_values, ensure_ascii=False) if log.new_values else "",
        log.ip_address or "", log.user_agent or "", str(log.log_id),
    ]


def _csv_safe(value) -> str:
    """Chặn CSV injection: attempted_username, user_agent do người ngoài gõ vào; ô bắt đầu
    bằng = + - @ sẽ bị Excel chạy như công thức. Thêm dấu ' để Excel hiểu là chữ."""
    text = value.isoformat(sep=" ") if isinstance(value, datetime) else str(value)
    return "'" + text if text.startswith(_FORMULA_PREFIXES) else text


def _build_xlsx(rows) -> bytes:
    wb = Workbook(write_only=True)
    ws = wb.create_sheet("audit_log")
    ws.freeze_panes = "A2"
    for col, width in zip("ABCDEFGHIJK", (20, 14, 16, 18, 16, 38, 40, 60, 16, 40, 38)):
        ws.column_dimensions[col].width = width

    header = []
    for name in _EXPORT_COLUMNS:
        cell = WriteOnlyCell(ws, value=name)
        cell.font = Font(bold=True)
        header.append(cell)
    ws.append(header)

    for log, username in rows:
        out = []
        for value in _export_values(log, username):
            cell = WriteOnlyCell(ws, value=value)
            if isinstance(value, datetime):
                cell.number_format = "yyyy-mm-dd hh:mm:ss"
            elif isinstance(value, str):
                cell.data_type = "s"   # luôn là chữ: openpyxl không biến "=..." thành công thức
            out.append(cell)
        ws.append(out)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_csv(rows) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_EXPORT_COLUMNS)
    for log, username in rows:
        writer.writerow([_csv_safe(v) for v in _export_values(log, username)])
    return buf.getvalue().encode("utf-8-sig")   # có BOM cho Excel


@router.get("/audit-logs/export")
def export_audit_logs(
    request: Request,
    f: AuditLogFilter = Depends(),
    format: Literal["xlsx", "csv"] = Query("xlsx", description="xlsx để mở bằng Excel; csv cho công cụ khác"),
    user: User = Depends(audit_view("audit_log", roles=ADMIN)),
    db: Session = Depends(get_db),
) -> Response:
    rows = db.execute(
        _filtered(f).order_by(AuditLog.created_at.desc(), AuditLog.log_id.desc()).limit(EXPORT_MAX_ROWS + 1)
    ).all()
    truncated = len(rows) > EXPORT_MAX_ROWS
    rows = rows[:EXPORT_MAX_ROWS]

    # Việc xuất cũng được ghi lại (US09: xem và xuất chỉ Admin, có dấu vết)
    audit.record(db, action="EXPORT", entity="audit_log", actor_id=user.user_id,
                 new_values={"filters": f.model_dump(mode="json", exclude_none=True),
                             "format": format, "rows": len(rows), "truncated": truncated},
                 ip_address=client_ip(request), user_agent=user_agent(request))
    db.commit()

    stamp = datetime.now(_VN_TZ).strftime("%Y%m%d_%H%M%S")
    if format == "xlsx":
        content = _build_xlsx(rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        content = _build_csv(rows)
        media_type = "text/csv; charset=utf-8"
    headers = {"Content-Disposition": f'attachment; filename="audit_log_{stamp}.{format}"'}
    if truncated:
        headers["X-Export-Truncated"] = str(EXPORT_MAX_ROWS)
    return Response(content=content, media_type=media_type, headers=headers)