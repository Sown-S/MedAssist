"""Danh mục dịch vụ, gói khám (Admin sửa, mọi vai trò đọc) và phiếu chỉ định cận lâm sàng (ERD v2.1).

Chỉ định và ghi kết quả: bác sĩ đang khám lượt đó. Hủy dòng chỉ định: bác sĩ khi đang khám, lễ tân khi
lượt đang chờ thu tiền (hóa đơn lập lại). Xem phiếu: bác sĩ, lễ tân (ghi VIEW).
"""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.audit_view import CLINICAL_ROLES, audit_view
from app.core.auth import require_roles
from app.core.database import get_db
from app.models import User
from app.schemas.service import (CancelItemRequest, PackageCreate, PackageOut, PackageUpdate, PriceChange,
                                 ResultsPut, ServiceCreate, ServiceOrderCreate, ServiceOrderItemOut, ServiceOrderOut,
                                 ServiceOut, ServiceUpdate)
from app.services import service_catalog_service as catalog
from app.services import service_order_service as orders

router = APIRouter(tags=["services"])

_read = require_roles("Admin", "Nurse", "Physician")
_admin_service = require_roles("Admin", audit_entity="service")
_admin_package = require_roles("Admin", audit_entity="service_package")
_physician_order = require_roles("Physician", audit_entity="service_order")
_cancel_item = require_roles("Physician", "Nurse", audit_entity="service_order_item")


# ============================================================================ danh mục dịch vụ
@router.get("/services", response_model=list[ServiceOut])
def list_services(kind: Literal["Service", "Lab"] | None = None, q: str | None = Query(None, max_length=100),
                  include_inactive: bool = False, _: User = Depends(_read), db: Session = Depends(get_db)):
    return catalog.list_services(db, kind, q, include_inactive)


@router.post("/admin/services", response_model=ServiceOut, status_code=201)
def create_service(body: ServiceCreate, actor: User = Depends(_admin_service), db: Session = Depends(get_db)):
    service = catalog.create_service(db, body, actor)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/admin/services/{service_id}", response_model=ServiceOut)
def update_service(service_id: uuid.UUID, body: ServiceUpdate, actor: User = Depends(_admin_service),
                   db: Session = Depends(get_db)):
    service = catalog.update_service(db, service_id, body, actor)
    db.commit()
    return service


@router.get("/admin/services/{service_id}/price-history", response_model=list[PriceChange])
def price_history(service_id: uuid.UUID, _: User = Depends(_admin_service), db: Session = Depends(get_db)):
    return catalog.price_history(db, service_id)


# ============================================================================ gói khám
@router.get("/service-packages", response_model=list[PackageOut])
def list_packages(include_inactive: bool = False, _: User = Depends(_read), db: Session = Depends(get_db)):
    return catalog.list_packages(db, include_inactive)


@router.post("/admin/service-packages", response_model=PackageOut, status_code=201)
def create_package(body: PackageCreate, actor: User = Depends(_admin_package), db: Session = Depends(get_db)):
    package = catalog.create_package(db, body, actor)
    db.commit()
    return catalog.package_out(db, [package])[0]


@router.patch("/admin/service-packages/{package_id}", response_model=PackageOut)
def update_package(package_id: uuid.UUID, body: PackageUpdate, actor: User = Depends(_admin_package),
                   db: Session = Depends(get_db)):
    package = catalog.update_package(db, package_id, body, actor)
    db.commit()
    return catalog.package_out(db, [package])[0]


# ============================================================================ phiếu chỉ định
@router.post("/visits/{visit_id}/service-orders", response_model=ServiceOrderOut, status_code=201)
def create_order(visit_id: uuid.UUID, body: ServiceOrderCreate, actor: User = Depends(_physician_order),
                 db: Session = Depends(get_db)):
    """Lập phiếu chỉ định; mặc định đánh dấu luôn bệnh nhân đi xét nghiệm (như PATCH lab-out)."""
    order = orders.create_order(db, visit_id, body, actor)
    db.commit()
    return next(o for o in orders.list_orders(db, visit_id) if o["order_id"] == order.order_id)


@router.get("/visits/{visit_id}/service-orders", response_model=list[ServiceOrderOut])
def list_orders(visit_id: uuid.UUID,
                _: User = Depends(audit_view("visit", roles=CLINICAL_ROLES, id_param="visit_id")),
                db: Session = Depends(get_db)):
    return orders.list_orders(db, visit_id)


@router.put("/visits/{visit_id}/service-orders/results", response_model=list[ServiceOrderOut])
def put_results(visit_id: uuid.UUID, body: ResultsPut, actor: User = Depends(_physician_order),
                db: Session = Depends(get_db)):
    """Ghi kết quả từng dòng và kết luận của phiếu; gửi chuỗi rỗng để xóa."""
    result = orders.put_results(db, visit_id, body, actor)
    db.commit()
    return result


@router.post("/service-order-items/{item_id}/cancel", response_model=ServiceOrderItemOut)
def cancel_item(item_id: uuid.UUID, body: CancelItemRequest, actor: User = Depends(_cancel_item),
                db: Session = Depends(get_db)):
    item = orders.cancel_item(db, item_id, body.reason, actor)
    db.commit()
    return item
