from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger, setup_logging
from app.core.middleware import RequestContextMiddleware
from app.exceptions import register_exception_handlers
from app.routers import (admin_router, auth_router, billing_router, clinic_router, inventory_router, knowledge_router,
                         prescription_router, assessment_router, report_router, room_router,
                         service_router)
from app.services import health_service

setup_logging(settings.LOG_LEVEL)
logger = get_logger("main")

# Tắt /docs, /redoc, /openapi.json khi prod: không công khai danh sách endpoint trong LAN phòng khám.
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Hệ thống hỗ trợ quyết định lâm sàng (CDSS) cho phòng khám ngoại trú",
    docs_url=None if settings.is_prod else "/docs",
    redoc_url=None if settings.is_prod else "/redoc",
    openapi_url=None if settings.is_prod else "/openapi.json",
)

# Thứ tự thêm ngược thứ tự chạy: RequestContext bọc ngoài cùng nên phản hồi CORS cũng có X-Request-ID.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,          # Bearer token, không dùng cookie
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Content-Disposition", "X-Export-Truncated"],
)
app.add_middleware(RequestContextMiddleware)

register_exception_handlers(app)

app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(clinic_router.router, prefix="/api/v1")
app.include_router(inventory_router.router, prefix="/api/v1")
app.include_router(prescription_router.router, prefix="/api/v1")
app.include_router(billing_router.router, prefix="/api/v1")
app.include_router(knowledge_router.router, prefix="/api/v1")
app.include_router(assessment_router.router, prefix="/api/v1")
app.include_router(report_router.router, prefix="/api/v1")
app.include_router(room_router.router, prefix="/api/v1")
app.include_router(service_router.router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {
        "system": "CDSS Outpatient Clinic API Engine",
        "status": "Running",
        "environment": settings.ENVIRONMENT,
        "docs_url": None if settings.is_prod else "/docs",
    }


# Healthcheck của Docker Compose và ô Trạng thái hệ thống ở client.
# 503 chỉ khi CSDL không trả lời; AI lỗi vẫn 200 vì còn xếp hạng theo luật.
# Không trả tên hệ quản trị CSDL hay chi tiết lỗi (chỉ ghi log server).
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: không kết nối được DB")
        return JSONResponse(status_code=503, content={
            "status": "unhealthy", "database": {"ok": False, "detail": "Không kết nối được CSDL"},
            "ai": {"ok": None, "detail": "", "reason": None}, "version": settings.VERSION})
    return {"status": "healthy", "database": {"ok": True, "detail": ""}, "ai": health_service.ai_status(db),
            "version": settings.VERSION}
