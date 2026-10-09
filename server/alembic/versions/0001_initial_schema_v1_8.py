"""Lược đồ khởi tạo v1.8 — thực thi server/db/medassist_schema_v1_8.sql

Dùng cho database MỚI (chưa từng dựng v1.7). Theo ERD v1.8 mục 1 và 6.2.

Revision ID: 0001
Revises:
Create Date: 2026-10-05
"""
import os
from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SCHEMA_FILE = Path(__file__).resolve().parents[2] / "db" / "medassist_schema_v1_8.sql"


def _exec_sql_script(sql: str) -> None:
    """Chạy cả file nhiều câu lệnh (có khối $$ và ký tự %) trong transaction của Alembic.

    Không dùng op.execute(text(...)): SQLAlchemy hiểu ':ten' là tham số bind,
    trong khi file có '::jsonb', ':q' trong chú thích... Gọi thẳng cursor của psycopg
    KHÔNG truyền tham số thì driver gửi nguyên văn, cho phép nhiều câu lệnh.
    """
    raw = op.get_bind().connection.driver_connection
    with raw.cursor() as cur:
        cur.execute(sql)


def upgrade() -> None:
    _exec_sql_script(SCHEMA_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    # Xóa sạch lược đồ = xóa luôn audit_log (vốn bất biến). Chỉ cho phép khi nói rõ.
    if os.getenv("MEDASSIST_ALLOW_DROP_SCHEMA") != "1":
        raise RuntimeError(
            "downgrade 0001 xóa TOÀN BỘ dữ liệu, kể cả audit_log. "
            "Chỉ dùng trên máy dev: đặt MEDASSIST_ALLOW_DROP_SCHEMA=1 rồi chạy lại."
        )
    _exec_sql_script(
        """
        DO $$
        DECLARE r record;
        BEGIN
            FOR r IN SELECT c.relname FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
            LOOP
                EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.relname);
            END LOOP;

            -- giữ alembic_version (yêu cầu ERD 12: downgrade không xóa bảng phiên bản)
            FOR r IN SELECT c.relname FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
                       AND c.relname <> 'alembic_version'
            LOOP
                EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.relname);
            END LOOP;

            -- hàm do lược đồ tạo (bỏ qua hàm thuộc extension)
            FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
                     JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public'
                       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                                       WHERE d.objid = p.oid AND d.deptype = 'e')
            LOOP
                EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
            END LOOP;
        END $$;

        DROP EXTENSION IF EXISTS pg_trgm;
        DROP EXTENSION IF EXISTS unaccent;

        ALTER DEFAULT PRIVILEGES FOR ROLE medassist_owner IN SCHEMA public
            REVOKE SELECT, INSERT, UPDATE ON TABLES FROM medassist_app;
        ALTER DEFAULT PRIVILEGES FOR ROLE medassist_owner IN SCHEMA public
            REVOKE USAGE, SELECT ON SEQUENCES FROM medassist_app;
        ALTER DEFAULT PRIVILEGES FOR ROLE medassist_owner IN SCHEMA public
            REVOKE SELECT ON TABLES FROM medassist_backup;
        """
    )