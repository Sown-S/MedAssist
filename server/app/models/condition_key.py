"""CONDITION_KEY — định danh ổn định của mã bệnh (v1.8). Chỉ thêm, không sửa.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime

from sqlalchemy import CheckConstraint, DateTime, PrimaryKeyConstraint, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ConditionKey(Base):
    __tablename__ = 'condition_key'
    __table_args__ = (
        CheckConstraint("condition_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text", name='chk_condition_key_format'),
        PrimaryKeyConstraint('condition_code', name='condition_key_pkey')
    )

    condition_code: Mapped[str] = mapped_column(String(80), primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
