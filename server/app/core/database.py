"""Kết nối PostgreSQL cục bộ (Docker) bằng vai trò medassist_app."""
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    echo=settings.DB_ECHO,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Lớp gốc cho mọi model ORM. Bảng do Alembic tạo, KHÔNG gọi Base.metadata.create_all()."""


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db