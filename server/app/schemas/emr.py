"""Hồ sơ bệnh án điện tử (US04, FR04): tra cứu nhanh, lịch sử khám, xem lại một lượt khám cũ.

Mã bệnh nhân (mã BN) = "BN-" + 8 ký tự hex đầu của patient_id, viết hoa (vd BN-3F2A9C1B).
Không thêm cột vào CSDL (giữ ERD v1.8); mã này in trên phiếu khám để tra lại.
"""
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.schemas.inventory import MoneyOut
from app.schemas.patient import patient_code
from app.schemas.service import ServiceOrderOut
from app.schemas.visit import VisitOut

__all__ = ["patient_code"]


class _WithPatientCode(BaseModel):
    patient_id: uuid.UUID

    @computed_field  # type: ignore[prop-decorator]
    @property
    def patient_code(self) -> str:
        return patient_code(self.patient_id)


# ============================================================================ Tra cứu nhanh
LookupKind = Literal["patient_code", "id_number", "phone", "birth_year", "name", "name_birth_year"]


class LookupInterpretation(BaseModel):
    """Hệ thống hiểu ô tìm kiếm là gì — để giao diện hiện 'Đang tìm theo SĐT' v.v."""
    kind: LookupKind
    name: str | None = None
    birth_year: int | None = None


class PatientLookupItem(_WithPatientCode):
    model_config = ConfigDict(from_attributes=True)
    full_name: str
    date_of_birth: date
    gender: str
    phone: str | None
    id_number_last4: str | None
    visit_count: int
    last_visit_at: datetime | None


class PatientLookupResult(BaseModel):
    interpreted_as: LookupInterpretation
    total: int
    limit: int
    offset: int
    items: list[PatientLookupItem]


# ============================================================================ Lịch sử khám
class HistoryDiagnosis(BaseModel):
    diagnosis_name: str
    icd10_code: str | None
    is_primary: bool


class HistoryDrugLine(BaseModel):
    drug_label: str            # "Paracetamol 500 mg (Panadol)"
    quantity: int
    unit: str
    dosage: str
    frequency: str
    duration_days: int
    dispense_status: str


class HistoryPrescription(BaseModel):
    prescription_id: uuid.UUID
    status: str
    confirmed_at: datetime | None
    item_count: int
    items: list[HistoryDrugLine]


class VisitHistoryItem(BaseModel):
    """Một dòng lịch sử (US04): ngày, chẩn đoán đã xác nhận, tóm tắt đơn thuốc."""
    visit_id: uuid.UUID
    visit_date: datetime
    status: str
    chief_complaint: str
    triage_priority: str | None
    is_red_flag: bool
    outcome: str | None = Field(None, description="Referred: lượt kết thúc bằng chuyển tuyến")
    referral_facility: str | None = Field(None, description="Nơi chuyển đến (referral.facility_name)")
    physician_name: str | None
    diagnoses: list[HistoryDiagnosis]
    prescription: HistoryPrescription | None


class PatientHistoryHeader(_WithPatientCode):
    model_config = ConfigDict(from_attributes=True)
    full_name: str
    date_of_birth: date
    gender: str
    medical_history: dict | None
    allergy_notes: str | None


class PatientHistory(BaseModel):
    patient: PatientHistoryHeader
    total: int
    limit: int
    offset: int
    items: list[VisitHistoryItem]


# ============================================================================ Chi tiết một lượt khám
class RecordDiagnosis(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    diagnosis_id: uuid.UUID
    diagnosis_name: str
    icd10_code: str | None
    condition_code: str | None
    is_primary: bool
    confirmed_by_physician: bool          # False = đã rút lại (giao diện gạch ngang)
    clinical_notes: str | None
    confirmed_at: datetime | None


class RecordDrugLine(HistoryDrugLine):
    item_id: uuid.UUID
    instruction: str | None
    skip_reason: str | None


class RecordPrescription(BaseModel):
    prescription_id: uuid.UUID
    status: str
    confirmed_at: datetime | None
    items: list[RecordDrugLine]


class RecordInvoice(BaseModel):
    invoice_code: str
    total_amount: MoneyOut
    payment_status: str
    paid_at: datetime | None


class VisitRecord(BaseModel):
    patient: PatientHistoryHeader
    visit: VisitOut
    nurse_name: str | None
    physician_name: str | None
    diagnoses: list[RecordDiagnosis]
    prescription: RecordPrescription | None
    invoice: RecordInvoice | None
    service_orders: list[ServiceOrderOut] = []
