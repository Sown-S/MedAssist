"""Dữ liệu bắt buộc: tài khoản 'system' — thực thi server/db/03_bootstrap.sql

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-06
"""
from pathlib import Path

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

BOOTSTRAP_FILE = Path(__file__).resolve().parents[2] / "db" / "03_bootstrap.sql"


def _exec_sql_script(sql: str) -> None:
    """Giống 0001: gửi nguyên văn qua cursor psycopg (migration phải tự đứng được, không import chéo)."""
    raw = op.get_bind().connection.driver_connection
    with raw.cursor() as cur:
        cur.execute(sql)


def upgrade() -> None:
    _exec_sql_script(BOOTSTRAP_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    # Không xóa được: audit_log (bất biến) đã có dòng trỏ tới tài khoản này.
    # Hạ về 0001 chỉ lùi số phiên bản; muốn xóa sạch thì downgrade tới base (0001 xóa toàn bộ lược đồ).
    pass