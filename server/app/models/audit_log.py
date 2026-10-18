"""AUDIT_LOG — ERD v1.8 mục 2.21. Chỉ-thêm: trigger chặn UPDATE/DELETE/TRUNCATE,
medassist_app không có quyền UPDATE/DELETE. Ứng dụng CHỈ được INSERT.
"""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

ACTION_TYPES = (
    "LOGIN", "LOGIN_FAILED", "LOGOUT", "VIEW", "CREATE", "UPDATE", "DELETE", "EXPORT",
    "APPROVE", "REJECT", "RETIRE", "AI_ASSESSMENT",
)


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        CheckConstraint(
            "action_type IN ('LOGIN','LOGIN_FAILED','LOGOUT','VIEW','CREATE','UPDATE','DELETE',"
            "'EXPORT','APPROVE','REJECT','RETIRE','AI_ASSESSMENT')",
            name="audit_log_action_type_check",
        ),
        # v1.8: có người thực hiện, trừ LOGIN_FAILED (khi đó phải có tên đã nhập)
        CheckConstraint(
            "user_id IS NOT NULL OR (action_type = 'LOGIN_FAILED' AND attempted_username IS NOT NULL)",
            name="chk_audit_log_actor",
        ),
        Index("idx_audit_log_user", "user_id"),
        Index("idx_audit_log_entity", "target_entity", "entity_id"),
        Index("idx_audit_log_created", text("created_at DESC")),
        # 0003: đếm LOGIN_FAILED theo tên đăng nhập / IP trong cửa sổ thời gian
        Index("idx_audit_login_failed_user", "attempted_username", "created_at",
              postgresql_where=text("action_type = 'LOGIN_FAILED'")),
        Index("idx_audit_login_failed_ip", "ip_address", "created_at",
              postgresql_where=text("action_type = 'LOGIN_FAILED'")),
    )

    log_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.user_id"))
    attempted_username: Mapped[str | None] = mapped_column(String(50))
    action_type: Mapped[str] = mapped_column(String(20))
    target_entity: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[uuid.UUID | None]
    old_values: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    new_values: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))