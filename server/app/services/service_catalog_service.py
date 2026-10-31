"""Danh mục dịch vụ, xét nghiệm và gói khám (ERD v2.1). Admin sửa; mọi vai trò đọc để chỉ định và thu tiền."""
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import AuditLog, Service, ServicePackage, User
from app.schemas.service import PackageCreate, PackageUpdate, ServiceCreate, ServiceUpdate
from app.services import audit_service as audit

_FIELDS = ("code", "name", "kind", "group_key", "unit", "price", "ref_low", "ref_high", "ref_text", "sample")
_REQUIRED = ("name", "group_key", "price", "is_active")


def list_services(db: Session, kind: str | None, q: str | None, include_inactive: bool) -> list[Service]:
    stmt = select(Service)
    if kind:
        stmt = stmt.where(Service.kind == kind)
    if not include_inactive:
        stmt = stmt.where(Service.is_active.is_(True))
    if q and q.strip():
        k = f"%{q.strip()}%"
        stmt = stmt.where(or_(func.f_unaccent(Service.name).ilike(func.f_unaccent(k)), Service.code.ilike(k)))
    return list(db.scalars(stmt.order_by(Service.kind.desc(), Service.code)))


def _get(db: Session, service_id: uuid.UUID, *, lock: bool = False) -> Service:
    stmt = select(Service).where(Service.service_id == service_id)
    service = db.scalar(stmt.with_for_update() if lock else stmt)
    if service is None:
        raise NotFoundError("Không tìm thấy dịch vụ")
    return service


def _check_range(low, high) -> None:
    if low is not None and high is not None and low > high:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": "ref_low", "in": "body", "message": "Giá trị dưới phải nhỏ hơn hoặc bằng giá trị trên"}])


def create_service(db: Session, data: ServiceCreate, actor: User) -> Service:
    if db.scalar(select(Service.service_id).where(func.upper(Service.code) == data.code.upper())):
        raise AppError(409, "SERVICE_CODE_TAKEN", f"Mã {data.code} đã có trong danh mục")
    service = Service(**data.model_dump())
    db.add(service)
    db.flush()
    audit.record(db, action="CREATE", entity="service", entity_id=service.service_id, actor_id=actor.user_id,
                 new_values={f: getattr(service, f) for f in _FIELDS})
    return service


def update_service(db: Session, service_id: uuid.UUID, data: ServiceUpdate, actor: User) -> Service:
    service = _get(db, service_id, lock=True)
    changes = data.model_dump(exclude_unset=True)
    for f in _REQUIRED:
        if f in changes and changes[f] is None:
            raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                           [{"field": f, "in": "body", "message": "Không được để trống"}])
    _check_range(changes.get("ref_low", service.ref_low), changes.get("ref_high", service.ref_high))
    old = audit.snapshot(service, changes.keys())
    for k, v in changes.items():
        setattr(service, k, v)
    old_diff, new_diff = audit.diff_values(old, {k: getattr(service, k) for k in changes})
    if new_diff:
        service.updated_at = func.now()
        audit.record(db, action="UPDATE", entity="service", entity_id=service.service_id, actor_id=actor.user_id,
                     old_values=old_diff, new_values=new_diff)
    db.flush()
    db.refresh(service)
    return service


def price_history(db: Session, service_id: uuid.UUID) -> list[dict]:
    """Lịch sử giá suy từ audit_log (CREATE và các UPDATE có đổi giá), mới nhất trước."""
    _get(db, service_id)
    rows = db.execute(
        select(AuditLog, User.full_name).outerjoin(User, User.user_id == AuditLog.user_id)
        .where(AuditLog.target_entity == "service", AuditLog.entity_id == service_id,
               AuditLog.action_type.in_(("CREATE", "UPDATE")), AuditLog.new_values.has_key("price"))
        .order_by(AuditLog.created_at.desc(), AuditLog.log_id)).all()
    return [{"price": log.new_values["price"], "old_price": (log.old_values or {}).get("price"),
             "changed_at": log.created_at, "changed_by_name": name} for log, name in rows]


# ---------------------------------------------------------------------------- gói khám
def _package_items(db: Session, items: list) -> list[dict]:
    """Gộp dòng trùng, kiểm dịch vụ còn dùng; lưu dạng JSONB [{service_id, quantity}]."""
    merged: dict[uuid.UUID, int] = {}
    for it in items:
        merged[it.service_id] = merged.get(it.service_id, 0) + it.quantity
    found = set(db.scalars(select(Service.service_id).where(Service.service_id.in_(merged),
                                                            Service.is_active.is_(True))))
    missing = [str(s) for s in merged if s not in found]
    if missing:
        raise AppError(422, "INVALID_SERVICE", "Có dịch vụ không tồn tại hoặc đã ngừng dùng",
                       [{"service_id": s} for s in missing])
    return [{"service_id": str(s), "quantity": q} for s, q in merged.items()]


def package_out(db: Session, packages: list[ServicePackage]) -> list[dict]:
    ids = {uuid.UUID(i["service_id"]) for p in packages for i in p.items}
    services = {s.service_id: s for s in db.scalars(select(Service).where(Service.service_id.in_(ids)))} if ids else {}
    out = []
    for p in packages:
        items = []
        for i in p.items:
            s = services.get(uuid.UUID(i["service_id"]))
            if s is not None:
                items.append({"service_id": s.service_id, "code": s.code, "name": s.name, "kind": s.kind,
                              "quantity": i["quantity"], "is_active": s.is_active})
        out.append({"package_id": p.package_id, "code": p.code, "name": p.name, "price": p.price,
                    "is_active": p.is_active, "items": items, "updated_at": p.updated_at})
    return out


def list_packages(db: Session, include_inactive: bool) -> list[dict]:
    stmt = select(ServicePackage)
    if not include_inactive:
        stmt = stmt.where(ServicePackage.is_active.is_(True))
    return package_out(db, list(db.scalars(stmt.order_by(ServicePackage.code))))


def get_package(db: Session, package_id: uuid.UUID, *, lock: bool = False) -> ServicePackage:
    stmt = select(ServicePackage).where(ServicePackage.package_id == package_id)
    package = db.scalar(stmt.with_for_update() if lock else stmt)
    if package is None:
        raise NotFoundError("Không tìm thấy gói khám")
    return package


def create_package(db: Session, data: PackageCreate, actor: User) -> ServicePackage:
    if db.scalar(select(ServicePackage.package_id).where(func.upper(ServicePackage.code) == data.code.upper())):
        raise AppError(409, "PACKAGE_CODE_TAKEN", f"Mã {data.code} đã có trong danh mục gói khám")
    package = ServicePackage(code=data.code, name=data.name, price=data.price, items=_package_items(db, data.items))
    db.add(package)
    db.flush()
    audit.record(db, action="CREATE", entity="service_package", entity_id=package.package_id,
                 actor_id=actor.user_id, new_values={"code": package.code, "name": package.name,
                                                     "price": package.price, "items": package.items})
    db.refresh(package)
    return package


def update_package(db: Session, package_id: uuid.UUID, data: PackageUpdate, actor: User) -> ServicePackage:
    package = get_package(db, package_id, lock=True)
    changes = data.model_dump(exclude_unset=True)
    for f in ("name", "price", "items", "is_active"):
        if f in changes and changes[f] is None:
            raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                           [{"field": f, "in": "body", "message": "Không được để trống"}])
    if "items" in changes:
        changes["items"] = _package_items(db, data.items)
    old = audit.snapshot(package, changes.keys())
    for k, v in changes.items():
        setattr(package, k, v)
    old_diff, new_diff = audit.diff_values(old, {k: getattr(package, k) for k in changes})
    if new_diff:
        package.updated_at = func.now()
        audit.record(db, action="UPDATE", entity="service_package", entity_id=package.package_id,
                     actor_id=actor.user_id, old_values=old_diff, new_values=new_diff)
    db.flush()
    db.refresh(package)
    return package
