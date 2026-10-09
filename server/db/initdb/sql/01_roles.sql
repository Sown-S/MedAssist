-- =====================================================================
-- MedAssist — khởi tạo hạ tầng CSDL (chạy MỘT LẦN, bằng superuser postgres)
-- Gọi bởi 01_roles.sh. Biến psql: :dbname, :owner_pw, :app_pw, :backup_pw
-- Theo ERD v1.8 mục 6.2. Lược đồ (bảng, trigger, GRANT trên bảng) là việc của Alembic.
-- =====================================================================
\set ON_ERROR_STOP on

-- 1. Ba vai trò (chỉ tạo nếu chưa có, để chạy được cho cả medassist và medassist_eval)
SELECT format('CREATE ROLE medassist_owner  LOGIN PASSWORD %L', :'owner_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medassist_owner') \gexec
SELECT format('CREATE ROLE medassist_app    LOGIN PASSWORD %L', :'app_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medassist_app') \gexec
SELECT format('CREATE ROLE medassist_backup LOGIN PASSWORD %L', :'backup_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medassist_backup') \gexec

-- 2. Owner, múi giờ, CONNECT (v1.6 thiếu REVOKE CONNECT)
ALTER DATABASE :"dbname" OWNER TO medassist_owner;
ALTER DATABASE :"dbname" SET timezone TO 'Asia/Ho_Chi_Minh';
REVOKE CONNECT, TEMPORARY ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO medassist_owner, medassist_app, medassist_backup;

-- 3. Schema public: owner tạo đối tượng, app/backup chỉ USAGE (không CREATE)
\connect :"dbname"
ALTER SCHEMA public OWNER TO medassist_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO medassist_app, medassist_backup;