from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db

# 1. Khởi tạo ứng dụng FastAPI Core
app = FastAPI(
    title="CDSS Outpatient Backend API Core",
    version="1.0.0",
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

# 3. Route trang chủ (Root Endpoint)
@app.get("/")
def read_root():
    return {
        "system": "CDSS Outpatient Clinic API Engine",
        "status": "Running",
        "docs_url": "/docs"
    }

# 4. Route kiểm tra sức khỏe và kết nối Neon DB (Health Endpoint)
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        # Chạy câu lệnh SQL đơn giản để verify kết nối tới Neon PostgreSQL thật
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "provider": "Neon Cloud PostgreSQL",
            "service": "CDSS Backend Service"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": f"connection_error: {str(e)}",
            "service": "CDSS Backend Service"
        }