"""Import toàn bộ model tại đây để Alembic autogenerate nhìn thấy.

Model phải khớp lược đồ do revision 0001 (medassist_schema_v1_8.sql) tạo.
Kiểm tra: `alembic check` phải báo "No new upgrade operations detected".
"""
from app.core.database import Base  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.user import User  # noqa: F401