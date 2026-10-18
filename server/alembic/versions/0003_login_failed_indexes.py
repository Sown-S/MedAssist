"""Chỉ mục đếm đăng nhập sai (giới hạn đăng nhập — ERD v1.8 điểm mở #1)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-10
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

_WHERE = sa.text("action_type = 'LOGIN_FAILED'")


def upgrade() -> None:
    op.create_index("idx_audit_login_failed_user", "audit_log", ["attempted_username", "created_at"],
                    postgresql_where=_WHERE)
    op.create_index("idx_audit_login_failed_ip", "audit_log", ["ip_address", "created_at"],
                    postgresql_where=_WHERE)


def downgrade() -> None:
    op.drop_index("idx_audit_login_failed_ip", table_name="audit_log")
    op.drop_index("idx_audit_login_failed_user", table_name="audit_log")
