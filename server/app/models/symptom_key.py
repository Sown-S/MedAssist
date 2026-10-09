"""SYMPTOM_KEY — định danh ổn định của mã triệu chứng (v1.8). Chỉ thêm, không sửa:
medassist_app chỉ có SELECT, INSERT. Trigger tự đăng ký mã khi INSERT symptom.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime

from sqlalchemy import CheckConstraint, DateTime, PrimaryKeyConstraint, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SymptomKey(Base):
    __tablename__ = 'symptom_key'
    __table_args__ = (
        CheckConstraint("symptom_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text", name='chk_symptom_key_format'),
        PrimaryKeyConstraint('symptom_code', name='symptom_key_pkey')
    )

    symptom_code: Mapped[str] = mapped_column(String(50), primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
