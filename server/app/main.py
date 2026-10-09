from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger, setup_logging
from app.core.middleware import RequestContextMiddleware
from app.exceptions import register_exception_handlers
from app.routers import admin_router, auth_router, clinic_router

setup_logging(settings.LOG_LEVEL)
logger = get_logger("main")

# 1. Khởi tạo ứng dụng. Khi chạy thật (prod) tắt /docs, /redoc, /openapi.json:
#    không công khai danh sách endpoint trong mạng LAN phòng khám.
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Hệ thống hỗ trợ quyết định lâm sàng (CDSS) cho phòng khám ngoại trú",
    docs_url=None if settings.is_prod else "/docs",
    redoc_url=None if settings.is_prod else "/redoc",
    openapi_url=None if settings.is_prod else "/openapi.json",
)

# 2. Middleware. Thứ tự thêm = ngược thứ tự chạy: RequestContext bọc ngoài cùng, nên cả
#    phản hồi CORS cũng có X-Request-ID.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,          # Bearer token, không dùng cookie
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Content-Disposition", "X-Export-Truncated"],
)
app.add_middleware(RequestContextMiddleware)

# 3. Định dạng lỗi thống nhất
register_exception_handlers(app)

# 4. Router nghiệp vụ, tiền tố /api/v1 (Architecture v1.7)
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(clinic_router.router, prefix="/api/v1")


# 5. Route trang chủ
@app.get("/")
def read_root():
    return {
        "system": "CDSS Outpatient Clinic API Engine",
        "status": "Running",
        "environment": settings.ENVIRONMENT,
        "docs_url": None if settings.is_prod else "/docs",
    }


# 6. Kiểm tra sức khỏe và kết nối PostgreSQL
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected", "provider": "PostgreSQL",
                "service": "CDSS Backend Service"}
    except Exception:
        # Chi tiết lỗi chỉ ghi ra log server, không trả cho client
        logger.exception("Health check: không kết nối được DB")
        return {"status": "unhealthy", "database": "connection_error",
                "service": "CDSS Backend Service"}
