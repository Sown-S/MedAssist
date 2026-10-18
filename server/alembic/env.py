"""Alembic env — MedAssist.

Chạy bằng medassist_owner qua MIGRATION_DATABASE_URL (ERD v1.8 mục 6.2).
KHÔNG dùng DATABASE_URL (medassist_app): app không có quyền tạo bảng.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.models import Base  # import gói models = nạp mọi model vào Base.metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

if not settings.MIGRATION_DATABASE_URL:
    raise RuntimeError("Thiếu MIGRATION_DATABASE_URL trong server/.env (vai trò medassist_owner)")
config.set_main_option("sqlalchemy.url", settings.MIGRATION_DATABASE_URL.replace("%", "%%"))

target_metadata = Base.metadata

# View không có trong models: không để autogenerate đề xuất DROP.
VIEWS = {
    "v_inventory_batch_status", "v_drug_stock", "v_inventory_reconciliation",
    "v_knowledge_integrity_issues", "v_ai_decision_reconciliation",
}


def include_object(obj, name, type_, reflected, compare_to):
    # Đủ 25 model (ERD v1.8): mọi bảng đều được so. Bảng có trong DB mà thiếu model sẽ hiện
    # thành drop_table trong `alembic check` -> biết ngay để viết model, KHÔNG được tự xóa bảng.
    if type_ == "table" and (name in VIEWS or name == "alembic_version"):
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=True,
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()