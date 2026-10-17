"""Danh mục thuốc và kho (US05): Admin và Nurse quản lý; Physician xem danh mục và tồn để kê đơn."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import require_roles
from app.core.database import get_db
from app.models import User
from app.schemas.common import Page
from app.schemas.inventory import (AdjustmentCreate, BatchCreate, BatchOut, BatchStatus, BatchTopUp,
                                   DrugCreate, DrugOut, DrugStockOut, DrugUpdate, InventoryAlerts,
                                   MovementOut)
from app.services import inventory_service as inv

router = APIRouter(tags=["inventory"])

_read = require_roles("Admin", "Nurse", "Physician", audit_entity="drug")
_write_drug = require_roles("Admin", "Nurse", audit_entity="drug")
_write_batch = require_roles("Admin", "Nurse", audit_entity="inventory_batch")


# ============================================================================ Thuốc
@router.get("/drugs", response_model=Page[DrugOut])
def list_drugs(q: str | None = Query(None, min_length=1, max_length=100, description="Tên hoạt chất hoặc thương mại, không dấu được"),
               active_only: bool = True, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
               _: User = Depends(_read), db: Session = Depends(get_db)):
    total, rows = inv.list_drugs(db, q=q, active_only=active_only, limit=limit, offset=offset)
    return Page[DrugOut](total=total, limit=limit, offset=offset, items=rows)


@router.post("/drugs", response_model=DrugOut, status_code=201)
def create_drug(body: DrugCreate, actor: User = Depends(_write_drug), db: Session = Depends(get_db)):
    drug = inv.create_drug(db, body, actor)
    db.commit()
    return drug


@router.get("/drugs/{drug_id}", response_model=DrugOut)
def get_drug(drug_id: uuid.UUID, _: User = Depends(_read), db: Session = Depends(get_db)):
    return inv.get_drug(db, drug_id)


@router.patch("/drugs/{drug_id}", response_model=DrugOut)
def update_drug(drug_id: uuid.UUID, body: DrugUpdate, actor: User = Depends(_write_drug),
                db: Session = Depends(get_db)):
    drug = inv.update_drug(db, drug_id, body, actor)
    db.commit()
    return drug


# ============================================================================ Tồn kho
@router.get("/inventory/stock", response_model=list[DrugStockOut])
def stock(q: str | None = Query(None, max_length=100), low_only: bool = False,
          _: User = Depends(_read), db: Session = Depends(get_db)):
    """Tồn theo thuốc (chỉ thuốc đang dùng). usable = còn hạn; tồn thấp không tính hàng hết hạn."""
    return inv.stock(db, q=q, low_only=low_only)


@router.get("/inventory/alerts", response_model=InventoryAlerts)
def alerts(_: User = Depends(require_roles("Admin", "Nurse", audit_entity="inventory_batch")),
           db: Session = Depends(get_db)):
    """Cảnh báo US05: tồn thấp, lô sắp hết hạn (inventory.near_expiry_days), lô hết hạn còn hàng."""
    return inv.alerts(db)


@router.get("/inventory/reconciliation")
def reconciliation(_: User = Depends(require_roles("Admin", audit_entity="inventory_batch")),
                   db: Session = Depends(get_db)) -> list[dict]:
    """Lô lệch sổ cái — luôn phải là danh sách rỗng."""
    return inv.reconciliation(db)


# ============================================================================ Lô
@router.get("/inventory/batches", response_model=list[BatchOut])
def list_batches(drug_id: uuid.UUID | None = None, status: BatchStatus | None = None,
                 include_depleted: bool = False, _: User = Depends(_read), db: Session = Depends(get_db)):
    return inv.list_batches(db, drug_id=drug_id, status=status, include_depleted=include_depleted)


@router.post("/inventory/batches", response_model=BatchOut, status_code=201)
def create_batch(body: BatchCreate, actor: User = Depends(_write_batch), db: Session = Depends(get_db)):
    batch = inv.create_batch(db, body, actor)
    db.commit()
    return batch


@router.get("/inventory/batches/{batch_id}", response_model=BatchOut)
def get_batch(batch_id: uuid.UUID, _: User = Depends(_read), db: Session = Depends(get_db)):
    return inv.get_batch(db, batch_id)


@router.post("/inventory/batches/{batch_id}/top-up", response_model=BatchOut)
def top_up(batch_id: uuid.UUID, body: BatchTopUp, actor: User = Depends(_write_batch),
           db: Session = Depends(get_db)):
    batch = inv.top_up(db, batch_id, body, actor)
    db.commit()
    return batch


@router.post("/inventory/batches/{batch_id}/adjustments", response_model=BatchOut)
def adjust(batch_id: uuid.UUID, body: AdjustmentCreate, actor: User = Depends(_write_batch),
           db: Session = Depends(get_db)):
    batch = inv.adjust(db, batch_id, body, actor)
    db.commit()
    return batch


@router.get("/inventory/batches/{batch_id}/movements", response_model=list[MovementOut])
def movements(batch_id: uuid.UUID, _: User = Depends(_read), db: Session = Depends(get_db)):
    return inv.movements(db, batch_id)
