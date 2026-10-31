"""Phiếu chỉ định cận lâm sàng và kết quả (ERD v2.1 mục 4.4).

Bác sĩ chỉ định trong lúc khám (lượt Examining của mình), ghi kết quả khi bệnh nhân quay lại.
Hóa đơn lập lúc kết thúc khám tự lấy dòng từ các chỉ định còn hiệu lực (invoice_service).
"""
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Service, ServiceOrder, ServiceOrderItem, User, Visit
from app.schemas.service import ResultsPut, ServiceOrderCreate
from app.services import audit_service as audit
from app.services import invoice_service, queue_service, service_catalog_service

CONSULT_GROUP = "consult"


def _invalid(ids) -> AppError:
    return AppError(422, "INVALID_SERVICE", "Có dịch vụ không tồn tại hoặc đã ngừng dùng",
                    [{"service_id": str(s)} for s in ids])


def create_order(db: Session, visit_id: uuid.UUID, data: ServiceOrderCreate, actor: User) -> ServiceOrder:
    queue_service.own_examining(db, visit_id, actor)
    package = None
    package_lines: list[tuple[Service, int]] = []
    if data.package_id is not None:
        package = service_catalog_service.get_package(db, data.package_id)
        if not package.is_active:
            raise AppError(422, "INVALID_PACKAGE", "Gói khám đã ngừng dùng")
        by_id = {s.service_id: s for s in db.scalars(select(Service).where(
            Service.service_id.in_([uuid.UUID(i["service_id"]) for i in package.items])))}
        package_lines = [(by_id[uuid.UUID(i["service_id"])], i["quantity"]) for i in package.items
                         if uuid.UUID(i["service_id"]) in by_id]
    in_package = {s.service_id for s, _ in package_lines}
    wanted = list(dict.fromkeys(s for s in data.service_ids if s not in in_package))
    services = {s.service_id: s for s in db.scalars(select(Service).where(
        Service.service_id.in_(wanted), Service.is_active.is_(True)))} if wanted else {}
    if missing := [s for s in wanted if s not in services]:
        raise _invalid(missing)

    order = ServiceOrder(visit_id=visit_id, ordered_by=actor.user_id, diagnosis=data.diagnosis, note=data.note)
    if package is not None:
        order.package_id, order.package_name, order.package_price = package.package_id, package.name, package.price
    db.add(order)
    db.flush()
    for s, qty in package_lines:
        db.add(ServiceOrderItem(order_id=order.order_id, service_id=s.service_id, item_name=s.name, quantity=qty,
                                unit_price=s.price, in_package=True))
    for sid in wanted:
        s = services[sid]
        db.add(ServiceOrderItem(order_id=order.order_id, service_id=sid, item_name=s.name, unit_price=s.price))
    for name in dict.fromkeys(data.other_items):
        db.add(ServiceOrderItem(order_id=order.order_id, item_name=name))
    db.flush()
    audit.record(db, action="CREATE", entity="service_order", entity_id=order.order_id, actor_id=actor.user_id,
                 new_values={"visit_id": visit_id, "package": package.code if package else None,
                             "services": len(wanted) + len(package_lines), "other_items": len(data.other_items)})
    if data.send_out:
        queue_service.set_lab_out(db, visit_id, True, actor)
    return order


def _orders(db: Session, visit_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[dict]]:
    orders = list(db.scalars(select(ServiceOrder).where(ServiceOrder.visit_id.in_(visit_ids))
                             .order_by(ServiceOrder.ordered_at, ServiceOrder.order_id)))
    if not orders:
        return {}
    rows = db.execute(select(ServiceOrderItem, Service).outerjoin(Service, Service.service_id == ServiceOrderItem.service_id)
                      .where(ServiceOrderItem.order_id.in_([o.order_id for o in orders]))
                      .order_by(ServiceOrderItem.in_package.desc(), ServiceOrderItem.item_name,
                                ServiceOrderItem.item_id)).all()
    names = dict(db.execute(select(User.user_id, User.full_name).where(
        User.user_id.in_({o.ordered_by for o in orders}))).all())
    items: dict[uuid.UUID, list[dict]] = {}
    for it, s in rows:
        items.setdefault(it.order_id, []).append({
            **{c: getattr(it, c) for c in ("item_id", "service_id", "item_name", "quantity", "unit_price", "in_package",
                                           "status", "result", "result_at", "cancelled_at", "cancel_reason")},
            "service_code": s.code if s else None,
            **({c: getattr(s, c) for c in ("kind", "group_key", "unit", "ref_low", "ref_high", "ref_text", "sample")}
               if s else {})})
    out: dict[uuid.UUID, list[dict]] = {}
    for o in orders:
        out.setdefault(o.visit_id, []).append({
            **{c: getattr(o, c) for c in ("order_id", "visit_id", "ordered_at", "ordered_by", "package_id",
                                          "package_name", "package_price", "diagnosis", "note", "conclusion")},
            "ordered_by_name": names.get(o.ordered_by), "items": items.get(o.order_id, [])})
    return out


def list_orders(db: Session, visit_id: uuid.UUID) -> list[dict]:
    if db.get(Visit, visit_id) is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    return _orders(db, [visit_id]).get(visit_id, [])


def put_results(db: Session, visit_id: uuid.UUID, data: ResultsPut, actor: User) -> list[dict]:
    """Bác sĩ ghi (hoặc xóa) kết quả từng dòng và kết luận của phiếu khi bệnh nhân mang kết quả về."""
    queue_service.own_examining(db, visit_id, actor)
    item_ids = [r.item_id for r in data.items]
    items = {i.item_id: i for i in db.scalars(
        select(ServiceOrderItem).join(ServiceOrder, ServiceOrder.order_id == ServiceOrderItem.order_id)
        .where(ServiceOrderItem.item_id.in_(item_ids), ServiceOrder.visit_id == visit_id).with_for_update())}
    orders = {o.order_id: o for o in db.scalars(
        select(ServiceOrder).where(ServiceOrder.order_id.in_([c.order_id for c in data.conclusions]),
                                   ServiceOrder.visit_id == visit_id).with_for_update())}
    missing = [str(i) for i in item_ids if i not in items] + \
        [str(c.order_id) for c in data.conclusions if c.order_id not in orders]
    if missing:
        raise AppError(422, "INVALID_ORDER_ITEM", "Có dòng chỉ định không thuộc lượt khám này",
                       [{"id": m} for m in missing])
    changed = 0
    for r in data.items:
        item = items[r.item_id]
        if item.status == "Cancelled":
            raise AppError(409, "ORDER_ITEM_CANCELLED", f"Chỉ định '{item.item_name}' đã hủy, không ghi kết quả được")
        value = r.result or None
        if value == item.result:
            continue
        item.result = value
        item.result_at, item.result_by = (func.now(), actor.user_id) if value else (None, None)
        changed += 1
    for c in data.conclusions:
        value = c.conclusion or None
        if value != orders[c.order_id].conclusion:
            orders[c.order_id].conclusion = value
            changed += 1
    db.flush()
    if changed:
        audit.record(db, action="UPDATE", entity="service_order", entity_id=None, actor_id=actor.user_id,
                     new_values={"visit_id": visit_id, "results": changed})
    return _orders(db, [visit_id]).get(visit_id, [])


def cancel_item(db: Session, item_id: uuid.UUID, reason: str, actor: User) -> ServiceOrderItem:
    """Bệnh nhân không làm: bác sĩ hủy khi đang khám; quầy hủy trước khi thu tiền (hóa đơn lập lại)."""
    item = db.scalar(select(ServiceOrderItem).where(ServiceOrderItem.item_id == item_id).with_for_update())
    if item is None:
        raise NotFoundError("Không tìm thấy dòng chỉ định")
    order = db.get(ServiceOrder, item.order_id)
    visit = db.scalar(select(Visit).where(Visit.visit_id == order.visit_id).with_for_update())
    if item.status == "Cancelled":
        raise AppError(409, "ORDER_ITEM_CANCELLED", "Dòng chỉ định đã hủy")
    if item.result is not None:
        raise AppError(409, "ORDER_ITEM_HAS_RESULT", "Đã có kết quả: chỉ định đã thực hiện, không hủy được")
    invoice = None
    if actor.role == "Physician":
        if visit.status != "Examining" or visit.physician_id != actor.user_id:
            raise AppError(409, "NOT_YOUR_VISIT", "Chỉ bác sĩ đang khám lượt này mới hủy được chỉ định",
                           [{"current": visit.status}])
    else:
        if visit.status != "Prescribed":
            raise AppError(409, "VISIT_NOT_AWAITING_PAYMENT", "Quầy chỉ hủy chỉ định khi lượt khám đang chờ thu tiền",
                           [{"current": visit.status}])
        invoice = invoice_service.active_invoice(db, visit.visit_id, for_update=True)
        if invoice is not None and invoice.payment_status != "Pending":
            raise AppError(409, "ALREADY_PAID", "Hóa đơn đã thu tiền, không hủy chỉ định được")
    item.status, item.cancelled_at, item.cancelled_by, item.cancel_reason = "Cancelled", func.now(), actor.user_id, reason
    db.flush()
    audit.record(db, action="UPDATE", entity="service_order_item", entity_id=item.item_id, actor_id=actor.user_id,
                 old_values={"status": "Ordered"}, new_values={"status": "Cancelled", "reason": reason})
    if invoice is not None:
        invoice_service.reissue(db, visit, invoice, f"Hủy chỉ định {item.item_name}: {reason}", actor)
    db.refresh(item)
    return item


# ---------------------------------------------------------------------------- dùng cho hóa đơn
def billable(db: Session, visit_id: uuid.UUID) -> tuple[list[dict], str | None]:
    """Dòng cận lâm sàng tự động và tên gói đã gồm phí khám (nếu có).

    Gói tính một dòng theo giá gói khi còn ít nhất một dòng trong gói chưa hủy; dòng trong gói không tính riêng.
    Dòng ngoài danh mục (không giá) không tính, quầy thêm tay.
    """
    orders = list(db.scalars(select(ServiceOrder).where(ServiceOrder.visit_id == visit_id)
                             .order_by(ServiceOrder.ordered_at, ServiceOrder.order_id)))
    if not orders:
        return [], None
    rows = db.execute(select(ServiceOrderItem, Service.group_key)
                      .outerjoin(Service, Service.service_id == ServiceOrderItem.service_id)
                      .where(ServiceOrderItem.order_id.in_([o.order_id for o in orders]),
                             ServiceOrderItem.status == "Ordered")
                      .order_by(ServiceOrderItem.item_name, ServiceOrderItem.item_id)).all()
    by_order: dict[uuid.UUID, list] = {}
    for it, group in rows:
        by_order.setdefault(it.order_id, []).append((it, group))
    lines, consult_in = [], None
    for o in orders:
        items = by_order.get(o.order_id, [])
        packaged = [(it, g) for it, g in items if it.in_package]
        if o.package_id is not None and packaged:
            lines.append(dict(item_type="Paraclinical", item_name=f"Gói: {o.package_name}"[:150], quantity=1,
                              unit_price=Decimal(o.package_price), prescription_item_id=None,
                              service_order_id=o.order_id))
            if consult_in is None and any(g == CONSULT_GROUP for _, g in packaged):
                consult_in = o.package_name
        for it, _ in items:
            if not it.in_package and it.unit_price is not None:
                lines.append(dict(item_type="Paraclinical", item_name=it.item_name, quantity=it.quantity,
                                  unit_price=Decimal(it.unit_price), prescription_item_id=None,
                                  service_order_id=o.order_id))
    return lines, consult_in


def _name_key(name: str) -> str:
    return " ".join(name.casefold().split())


def unbilled(db: Session, visit_id: uuid.UUID, manual_names: list[str]) -> list[dict]:
    """Chỉ định ngoài danh mục chưa có dòng nhập tay cùng tên trên hóa đơn (mỗi dòng tay khớp một chỉ định)."""
    remaining: dict[str, int] = {}
    for name in manual_names:
        remaining[_name_key(name)] = remaining.get(_name_key(name), 0) + 1
    out = []
    for it in db.scalars(select(ServiceOrderItem)
                         .join(ServiceOrder, ServiceOrder.order_id == ServiceOrderItem.order_id)
                         .where(ServiceOrder.visit_id == visit_id, ServiceOrderItem.status == "Ordered",
                                ServiceOrderItem.unit_price.is_(None))
                         .order_by(ServiceOrder.ordered_at, ServiceOrderItem.item_name)):
        key = _name_key(it.item_name)
        if remaining.get(key):
            remaining[key] -= 1
            continue
        out.append({"item_id": it.item_id, "order_id": it.order_id, "item_name": it.item_name,
                    "quantity": it.quantity})
    return out


def orders_for_visits(db: Session, visit_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[dict]]:
    return _orders(db, visit_ids)

