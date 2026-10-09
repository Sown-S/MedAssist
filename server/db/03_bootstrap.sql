-- =====================================================================
-- MedAssist — dữ liệu bắt buộc (chạy bằng medassist_owner qua Alembic 0002)
-- KHÔNG chạy tay. Chạy lại nhiều lần vẫn an toàn (ON CONFLICT DO NOTHING).
-- =====================================================================

-- Tài khoản 'system': người thực hiện của script seed / import_okf.py trong audit_log
-- và created_by của bảng tri thức (ERD v1.8 mục 2.21).
--  * is_active = FALSE và password_hash không phải hash hợp lệ -> không ai đăng nhập được.
--  * UUID cố định để code dùng thẳng: app.models.user.SYSTEM_USER_ID.
WITH ins AS (
    INSERT INTO users (user_id, username, password_hash, full_name, role, is_active)
    VALUES ('00000000-0000-0000-0000-000000000001', 'system', '!disabled-no-login',
            'Hệ thống (script nạp dữ liệu)', 'Admin', FALSE)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id, username, role, is_active
)
INSERT INTO audit_log (user_id, action_type, target_entity, entity_id, new_values)
SELECT user_id, 'CREATE', 'users', user_id,
       jsonb_build_object('username', username, 'role', role, 'is_active', is_active,
                          'source', 'alembic 0002_bootstrap_system_account')
FROM ins;