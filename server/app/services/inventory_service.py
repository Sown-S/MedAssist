"""Danh mục thuốc và kho (US05, FR05).

Nguyên tắc (ERD v1.8 mục kho):
  * Sổ cái stock_movement là nguồn sự thật: mọi thay đổi tồn = INSERT một dòng sổ cái; trigger
    trg_stock_movement_apply cộng vào lô. KHÔNG bao giờ UPDATE inventory_batch.remaining_quantity
    (trg_inventory_batch_guard chặn). Tồn âm bị CHECK chặn -> cả transaction rollback.
  * Không xóa thuốc / lô: ngừng dùng thuốc bằng is_active = false.
  * Sổ cái đã có performed_by, thời điểm, lý do -> không ghi thêm audit_log cho từng biến động;
    audit_log ghi thay đổi danh mục thuốc và việc tạo lô.
"""
import uuid
from datetime import date

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Drug, InventoryBatch, StockMovement, User
from app.schemas.inventory import AdjustmentCreate, BatchCreate, BatchTopUp, DrugCreate, DrugUpdate
from app.services import audit_service as audit

_DRUG_FIELDS = ["generic_name", "trade_name", "strength", "dosage_form", "unit", "sale_price",
                "reorder_level", "drug_class", "active_ingredient_code", "is_active"]


# ============================================================================ Thuốc
def _identity_conflict(db: Session, generic, trade, strength, form, exclude: uuid.UUID | None = None):
    stmt = select(Drug.drug_id).where(
        func.lower(Drug.generic_name) == generic.lower(), func.lower(Drug.trade_name) == trade.lower(),
        func.lower(Drug.strength) == strength.lower(), func.lower(Drug.dosage_form) == form.lower())
    if exclude:
        stmt = stmt.where(Drug.drug_id != exclude)
    existing = db.scalar(stmt)
    if existing:
        raise AppError(409, "DUPLICATE_DRUG",
                       "Đã có thuốc cùng hoạt chất, tên thương mại, hàm lượng và dạng bào chế",
                       [{"drug_id": str(existing)}])


def get_drug(db: Session, drug_id: uuid.UUID) -> Drug:
    drug = db.get(Drug, drug_id)
    if drug is None:
        raise NotFoundError("Không tìm thấy thuốc")
    return drug


def list_drugs(db: Session, *, q: str | None, active_only: bool, limit: int, offset: int):
    stmt = select(Drug)
    if active_only:
        stmt = stmt.where(Drug.is_active.is_(True))
    if q:
        like = "%" + q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        key = lambda col: func.lower(func.f_unaccent(col))  # noqa: E731
        stmt = stmt.where(key(Drug.generic_name).like(func.f_unaccent(like), escape="\\")
                          | key(Drug.trade_name).like(func.f_unaccent(like), escape="\\"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Drug.generic_name, Drug.strength).limit(limit).offset(offset)).all()
    return total or 0, list(rows)


def create_drug(db: Session, data: DrugCreate, actor: User) -> Drug:
    _identity_conflict(db, data.generic_name, data.trade_name, data.strength, data.dosage_form)
    drug = Drug(**data.model_dump())
    db.add(drug)
    db.flush()
    audit.record(db, action="CREATE", entity="drug", entity_id=drug.drug_id, actor_id=actor.user_id,
                 new_values={f: getattr(drug, f) for f in _DRUG_FIELDS})
    return drug


def update_drug(db: Session, drug_id: uuid.UUID, data: DrugUpdate, actor: User) -> Drug:
    drug = db.scalar(select(Drug).where(Drug.drug_id == drug_id).with_for_update())
    if drug is None:
        raise NotFoundError("Không tìm thấy thuốc")
    changes = data.model_dump(exclude_unset=True)
    for required in ("generic_name", "trade_name", "strength", "dosage_form", "unit", "sale_price",
                     "reorder_level", "is_active"):
        if required in changes and changes[required] is None:
            raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                           [{"field": required, "in": "body", "message": "Không được để trống"}])
    merged = {k: changes.get(k, getattr(drug, k)) for k in ("generic_name", "trade_name", "strength", "dosage_form")}
    if any(k in changes for k in merged):
        _identity_conflict(db, merged["generic_name"], merged["trade_name"], merged["strength"],
                           merged["dosage_form"], exclude=drug_id)
    old = audit.snapshot(drug, changes.keys())
    for k, v in changes.items():
        setattr(drug, k, v)
    old_diff, new_diff = audit.diff_values(old, {k: getattr(drug, k) for k in changes})
    if new_diff:
        audit.record(db, action="UPDATE", entity="drug", entity_id=drug.drug_id, actor_id=actor.user_id,
                     old_values=old_diff, new_values=new_diff)
    return drug


# ============================================================================ Lô và sổ cái
_BATCH_STATUS_SQL = text("""
    SELECT b.batch_id, b.drug_id, b.batch_number, b.expiry_date, b.manufacturing_date,
           b.initial_quantity, b.remaining_quantity, b.import_price, b.created_at,
           v.batch_status, v.days_to_expiry
    FROM inventory_batch b JOIN v_inventory_batch_status v USING (batch_id)
""")


def _batch_rows(db: Session, where: str = "", params: dict | None = None, order: str = "b.expiry_date, b.created_at"):
    sql = f"{_BATCH_STATUS_SQL.text} {('WHERE ' + where) if where else ''} ORDER BY {order}"
    return [dict(r) for r in db.execute(text(sql), params or {}).mappings()]


def get_batch(db: Session, batch_id: uuid.UUID) -> dict:
    rows = _batch_rows(db, "b.batch_id = :id", {"id": batch_id})
    if not rows:
        raise NotFoundError("Không tìm thấy lô thuốc")
    return rows[0]


def list_batches(db: Session, *, drug_id: uuid.UUID | None, status: str | None, include_depleted: bool):
    cond, params = [], {}
    if drug_id:
        cond.append("b.drug_id = :drug_id")
        params["drug_id"] = drug_id
    if status:
        cond.append("v.batch_status = :status")
        params["status"] = status
    elif not include_depleted:
        cond.append("v.batch_status <> 'Depleted'")
    return _batch_rows(db, " AND ".join(cond), params)


def create_batch(db: Session, data: BatchCreate, actor: User) -> dict:
    drug = get_drug(db, data.drug_id)
    if not drug.is_active:
        raise AppError(409, "DRUG_INACTIVE", "Thuốc đã ngừng dùng, không nhập lô mới")
    today = db.scalar(select(func.current_date()))
    errors = []
    if data.expiry_date <= today:
        errors.append({"field": "expiry_date", "in": "body", "message": "Không nhập lô đã hết hạn"})
    if data.manufacturing_date and data.manufacturing_date > today:
        errors.append({"field": "manufacturing_date", "in": "body", "message": "Ngày sản xuất không được ở tương lai"})
    if data.manufacturing_date and data.manufacturing_date >= data.expiry_date:
        errors.append({"field": "manufacturing_date", "in": "body", "message": "Ngày sản xuất phải trước hạn dùng"})
    if errors:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", errors)
    existing = db.scalar(select(InventoryBatch.batch_id).where(
        InventoryBatch.drug_id == data.drug_id, InventoryBatch.batch_number == data.batch_number))
    if existing:
        raise AppError(409, "BATCH_EXISTS", "Số lô này đã có. Nhập thêm vào lô cũ bằng chức năng 'Nhập thêm'",
                       [{"batch_id": str(existing)}])
    batch = InventoryBatch(drug_id=data.drug_id, created_by=actor.user_id, batch_number=data.batch_number,
                           expiry_date=data.expiry_date, manufacturing_date=data.manufacturing_date,
                           initial_quantity=data.quantity, remaining_quantity=data.quantity,
                           import_price=data.import_price)
    db.add(batch)
    db.flush()
    audit.record(db, action="CREATE", entity="inventory_batch", entity_id=batch.batch_id, actor_id=actor.user_id,
                 new_values={"drug_id": str(batch.drug_id), "batch_number": batch.batch_number,
                             "expiry_date": batch.expiry_date, "quantity": batch.initial_quantity,
                             "import_price": batch.import_price})
    return get_batch(db, batch.batch_id)


def _lock_batch(db: Session, batch_id: uuid.UUID) -> InventoryBatch:
    batch = db.scalar(select(InventoryBatch).where(InventoryBatch.batch_id == batch_id).with_for_update())
    if batch is None:
        raise NotFoundError("Không tìm thấy lô thuốc")
    return batch


def top_up(db: Session, batch_id: uuid.UUID, data: BatchTopUp, actor: User) -> dict:
    batch = _lock_batch(db, batch_id)
    note = "Nhập thêm cùng lô" + (f": {data.note}" if data.note else "")
    db.add(StockMovement(batch_id=batch.batch_id, performed_by=actor.user_id, movement_type="Adjustment",
                         quantity_change=data.quantity, reason_code="Other", note=note))
    db.flush()
    return get_batch(db, batch_id)


def adjust(db: Session, batch_id: uuid.UUID, data: AdjustmentCreate, actor: User) -> dict:
    if data.quantity_change == 0:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": "quantity_change", "in": "body", "message": "Phải khác 0"}])
    if data.reason_code == "Other" and not data.note:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": "note", "in": "body", "message": "Lý do 'Khác' phải có ghi chú"}])
    batch = _lock_batch(db, batch_id)
    if batch.remaining_quantity + data.quantity_change < 0:
        raise AppError(409, "INSUFFICIENT_STOCK",
                       f"Lô chỉ còn {batch.remaining_quantity}, không giảm được {-data.quantity_change}",
                       [{"remaining_quantity": batch.remaining_quantity}])
    db.add(StockMovement(batch_id=batch.batch_id, performed_by=actor.user_id, movement_type="Adjustment",
                         quantity_change=data.quantity_change, reason_code=data.reason_code, note=data.note))
    db.flush()
    return get_batch(db, batch_id)


def movements(db: Session, batch_id: uuid.UUID) -> list[StockMovement]:
    get_batch(db, batch_id)
    return list(db.scalars(select(StockMovement).where(StockMovement.batch_id == batch_id)
                           .order_by(StockMovement.created_at, StockMovement.movement_id)))


# ============================================================================ Tồn kho và cảnh báo
def stock(db: Session, *, q: str | None, low_only: bool) -> list[dict]:
    cond, params = [], {}
    if q:
        cond.append("lower(f_unaccent(generic_name)) LIKE '%' || lower(f_unaccent(:q)) || '%'")
        params["q"] = q
    if low_only:
        cond.append("is_low_stock")
    sql = "SELECT * FROM v_drug_stock" + (" WHERE " + " AND ".join(cond) if cond else "") + " ORDER BY generic_name, strength"
    return [dict(r) for r in db.execute(text(sql), params).mappings()]


def alerts(db: Session) -> dict:
    return {
        "low_stock": stock(db, q=None, low_only=True),
        "near_expiry": _batch_rows(db, "v.batch_status = 'NearExpiry'"),
        "expired_with_stock": _batch_rows(db, "v.batch_status = 'Expired' AND b.remaining_quantity > 0"),
    }


def reconciliation(db: Session) -> list[dict]:
    """Lô lệch sổ cái. Luôn phải rỗng; khác rỗng = lỗi nghiêm trọng, báo Sơn."""
    return [dict(r) for r in db.execute(text("SELECT * FROM v_inventory_reconciliation")).mappings()]


def today(db: Session) -> date:
    return db.scalar(select(func.current_date()))
