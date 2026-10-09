#!/bin/bash
# Chạy tự động MỘT LẦN khi volume db còn trống (docker-entrypoint-initdb.d).
# Mật khẩu lấy từ biến môi trường, không nằm trong file SQL.
# Không đặt `set -u`: nếu file mất quyền thực thi (checkout trên Windows) entrypoint sẽ `source` nó.

: "${MEDASSIST_OWNER_PASSWORD:?Thiếu MEDASSIST_OWNER_PASSWORD}"
: "${MEDASSIST_APP_PASSWORD:?Thiếu MEDASSIST_APP_PASSWORD}"
: "${MEDASSIST_BACKUP_PASSWORD:?Thiếu MEDASSIST_BACKUP_PASSWORD}"

SQL_FILE="${MEDASSIST_INITDB_SQL:-/docker-entrypoint-initdb.d/sql/01_roles.sql}"

run_for_db() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
       -v dbname="$1" \
       -v owner_pw="$MEDASSIST_OWNER_PASSWORD" \
       -v app_pw="$MEDASSIST_APP_PASSWORD" \
       -v backup_pw="$MEDASSIST_BACKUP_PASSWORD" \
       -f "$SQL_FILE"
}

# Database chính (POSTGRES_DB=medassist đã được entrypoint tạo sẵn)
run_for_db "${POSTGRES_DB:-medassist}"

# Database đánh giá NCKH (ERD điểm mở #12), chỉ khi bật cờ
if [ "${MEDASSIST_CREATE_EVAL_DB:-0}" = "1" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
       -c "CREATE DATABASE medassist_eval"
  run_for_db medassist_eval
fi