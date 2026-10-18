"""Toàn bộ 25 model theo ERD v1.8 — import ở đây để Alembic autogenerate thấy đủ bảng.

Model phải khớp lược đồ do revision 0001 (medassist_schema_v1_8.sql) tạo.
Kiểm tra: `alembic check` -> "No new upgrade operations detected"; test_db_guards.py.
Bảng do Alembic tạo: KHÔNG gọi Base.metadata.create_all().
"""
from app.core.database import Base  # noqa: F401

# Người dùng, cấu hình, nhật ký
from app.models.user import User  # noqa: F401
from app.models.system_setting import SystemSetting  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401

# Tri thức (OKF)
from app.models.knowledge_source import KnowledgeSource  # noqa: F401
from app.models.knowledge_release import KnowledgeRelease  # noqa: F401
from app.models.knowledge_epoch import KnowledgeEpoch  # noqa: F401
from app.models.symptom_key import SymptomKey  # noqa: F401
from app.models.condition_key import ConditionKey  # noqa: F401
from app.models.symptom import Symptom  # noqa: F401
from app.models.condition import Condition  # noqa: F401
from app.models.condition_symptom import ConditionSymptom  # noqa: F401
from app.models.guideline_excerpt import GuidelineExcerpt  # noqa: F401
from app.models.triage_rule import TriageRule  # noqa: F401

# Lâm sàng
from app.models.patient import Patient  # noqa: F401
from app.models.visit import Visit  # noqa: F401
from app.models.visit_symptom import VisitSymptom  # noqa: F401
from app.models.ai_assessment_log import AiAssessmentLog  # noqa: F401
from app.models.diagnosis import Diagnosis  # noqa: F401

# Thuốc, kho, hóa đơn
from app.models.drug import Drug  # noqa: F401
from app.models.prescription import Prescription  # noqa: F401
from app.models.prescription_item import PrescriptionItem  # noqa: F401
from app.models.inventory_batch import InventoryBatch  # noqa: F401
from app.models.stock_movement import StockMovement  # noqa: F401
from app.models.invoice import Invoice  # noqa: F401
from app.models.invoice_item import InvoiceItem  # noqa: F401
