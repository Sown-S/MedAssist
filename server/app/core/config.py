"""
Cấu hình tập trung
Nguồn: biến môi trường hệ điều hành > file server/.env > giá trị mặc định.
"""
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

SERVER_DIR = Path(__file__).resolve().parents[2]   # .../server


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=SERVER_DIR / ".env",
        env_file_encoding="utf-8-sig",   # chịu được BOM do Notepad/PowerShell thêm vào
        extra="ignore",
    )

    PROJECT_NAME: str = "MedAssist API"
    VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["dev", "prod"] = "dev"

    # API, worker, script nạp OKF — vai trò medassist_app (ERD v1.8 mục 6.2)
    DATABASE_URL: str
    # CHỈ Alembic dùng — vai trò medassist_owner. API không cần nên để trống được.
    MIGRATION_DATABASE_URL: str | None = None

    # JWT (token ngắn hạn — Kế hoạch v7, Sprint 2). Khóa bí mật >= 32 ký tự, chỉ nằm trong .env
    JWT_SECRET_KEY: str = Field(min_length=32)
    JWT_ALGORITHM: Literal["HS256"] = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15, ge=1, le=60)
    REFRESH_TOKEN_EXPIRE_HOURS: int = Field(default=8, ge=1, le=24)     # một ca làm việc

    # Giới hạn đăng nhập sai (ERD v1.8 điểm mở #1), đếm từ các dòng LOGIN_FAILED của audit_log
    LOGIN_WINDOW_MINUTES: int = Field(default=15, ge=1)
    LOGIN_LOCK_MINUTES: int = Field(default=5, ge=1)
    LOGIN_MAX_FAILURES_PER_USER: int = Field(default=5, ge=1)
    LOGIN_MAX_FAILURES_PER_IP: int = Field(default=20, ge=1)

    # Proxy được tin header X-Forwarded-For (máy admin: mạng Docker của Caddy). Dev: để trống.
    TRUSTED_PROXIES: list[str] = []

    # Nguồn (Origin) được gọi API từ trình duyệt/Electron. JSON trong .env, vd
    # CORS_ORIGINS=["http://localhost:5173"]. API dùng Bearer token, không cookie -> không bật credentials.
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    @property
    def is_prod(self) -> bool:
        return self.ENVIRONMENT == "prod"

    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_ECHO: bool = False

    @field_validator("DATABASE_URL")
    @classmethod
    def _check_database_url(cls, v: str) -> str:
        url = make_url(v)
        if url.drivername != "postgresql+psycopg":
            raise ValueError("DATABASE_URL phải dùng driver psycopg 3: postgresql+psycopg://...")
        if url.username in {"postgres", "medassist_owner"}:
            raise ValueError("API phải kết nối bằng medassist_app, không dùng postgres/medassist_owner")
        return v

    @field_validator("MIGRATION_DATABASE_URL")
    @classmethod
    def _check_migration_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        url = make_url(v)
        if url.drivername != "postgresql+psycopg":
            raise ValueError("MIGRATION_DATABASE_URL phải dùng driver psycopg 3: postgresql+psycopg://...")
        if url.username != "medassist_owner":
            raise ValueError("Migration phải chạy bằng medassist_owner (lược đồ tự dừng nếu sai vai trò)")
        return v


    @model_validator(mode="after")
    def _check_prod(self) -> "Settings":
        if self.is_prod:
            if "*" in self.CORS_ORIGINS:
                raise ValueError("prod: CORS_ORIGINS không được chứa '*'")
            if self.DB_ECHO:
                raise ValueError("prod: tắt DB_ECHO (log câu SQL có thể chứa dữ liệu bệnh nhân)")
        return self


settings = Settings()