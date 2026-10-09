from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.config import settings
from app.core.database import get_db
from app.routers import auth_router

# 1. Khởi tạo ứng dụng FastAPI Core
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Hệ thống hỗ trợ quyết định lâm sàng (CDSS) cho phòng khám ngoại trú"
)

# 2. Cấu hình CORS (Cho phép Electron Desktop Client truy cập API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Trong môi trường dev/thử nghiệm, mở CORS cho mọi Origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 3. Router nghiệp vụ, tiền tố /api/v1 (Architecture v1.7)
app.include_router(auth_router.router, prefix="/api/v1")

# 4. Route trang chủ (Root Endpoint)
@app.get("/")
def read_root():
    return {
        "system": "CDSS Outpatient Clinic API Engine",
        "status": "Running",
        "docs_url": "/docs"
    }

# 5. Route kiểm tra sức khỏe và kết nối Neon DB (Health Endpoint)
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        # Chạy câu lệnh SQL đơn giản để verify kết nối tới Neon PostgreSQL thật
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "provider": "PostgreSQL",
            "service": "CDSS Backend Service"
        }
    except Exception:
        # Không trả chi tiết lỗi ra ngoài (có thể lộ host, vai trò, câu SQL)
        return {
            "status": "unhealthy",
            "database": "connection_error",
            "service": "CDSS Backend Service"
        }