"""SERVICE_ORDER, SERVICE_ORDER_ITEM — phiếu chỉ định cận lâm sàng của lượt khám và kết quả từng dòng
(ERD v2.1 mục 2.10b). Hủy dòng bằng status, không xóa."""
import decimal
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, Numeric, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ServiceOrder(Base):
    __tablename__ = "service_order"
    __table_args__ = (
        ForeignKeyConstraint(["visit_id"], ["visit.visit_id"], name="service_order_visit_id_fkey"),
        ForeignKeyConstraint(["ordered_by"], ["users.user_id"], name="service_order_ordered_by_fkey"),
        ForeignKeyConstraint(["package_id"], ["service_package.package_id"], name="fk_service_order_package"),
        CheckConstraint("(package_id IS NULL) = (package_name IS NULL) AND (package_id IS NULL) = (package_price IS NULL)",
                        name="chk_service_order_package"),
        CheckConstraint("package_price IS NULL OR package_price >= 0", name="service_order_package_price_check"),
        Index("idx_service_order_visit", "visit_id", "ordered_at"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    visit_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    ordered_by: Mapped[uuid.UUID] = mapped_column(Uuid)
    ordered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    package_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    package_name: Mapped[str | None] = mapped_column(String(150))
    package_price: Mapped[decimal.Decimal | None] = mapped_column(Numeric(12, 2))
    diagnosis: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    conclusion: Mapped[str | None] = mapped_column(Text)


class ServiceOrderItem(Base):
    __tablename__ = "service_order_item"
    __table_args__ = (
        ForeignKeyConstraint(["order_id"], ["service_order.order_id"], name="service_order_item_order_id_fkey"),
        ForeignKeyConstraint(["service_id"], ["service.service_id"], name="fk_service_order_item_service"),
        ForeignKeyConstraint(["result_by"], ["users.user_id"], name="service_order_item_result_by_fkey"),
        ForeignKeyConstraint(["cancelled_by"], ["users.user_id"], name="service_order_item_cancelled_by_fkey"),
        CheckConstraint("quantity > 0", name="service_order_item_quantity_check"),
        CheckConstraint("status IN ('Ordered','Cancelled')", name="chk_service_order_item_status"),
        CheckConstraint("(service_id IS NULL) = (unit_price IS NULL) AND (service_id IS NOT NULL OR NOT in_package) "
                        "AND (unit_price IS NULL OR unit_price >= 0)", name="chk_service_order_item_price"),
        CheckConstraint("(result IS NULL) = (result_at IS NULL) AND (result IS NULL) = (result_by IS NULL)",
                        name="chk_service_order_item_result"),
        CheckConstraint("(status = 'Cancelled') = (cancelled_at IS NOT NULL) "
                        "AND (status = 'Cancelled') = (cancelled_by IS NOT NULL) "
                        "AND (status = 'Cancelled') = (cancel_reason IS NOT NULL)",
                        name="chk_service_order_item_cancel"),
        Index("idx_service_order_item_order", "order_id"),
    )

    item_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    service_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    item_name: Mapped[str] = mapped_column(String(150))
    quantity: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    unit_price: Mapped[decimal.Decimal | None] = mapped_column(Numeric(12, 2))
    in_package: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    status: Mapped[str] = mapped_column(String(12), server_default=text("'Ordered'"))
    result: Mapped[str | None] = mapped_column(Text)
    result_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    result_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
