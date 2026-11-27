"""Gỡ 0011: đưa lược đồ về đúng 0010 (ERD v2.3)

0011 đã merge trước khi chốt lại kế hoạch; migration đã merge không sửa, nên gỡ bằng revision mới.
upgrade chạy lại downgrade của 0011 sau khi kiểm dữ liệu; downgrade chạy lại upgrade của 0011.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-26
"""

from alembic import context, op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

# Dữ liệu chỉ 0011 mới có thì dừng, không tự sửa: người vận hành quyết định xử lý từng dòng.
# Khóa bảng tới hết migration để không có dòng vi phạm chen vào sau lần kiểm.
_GUARD = """
DO $$
DECLARE pharmacists INT; shared_rooms INT; vas_visits INT; vas_rules INT; gated_rules INT;
BEGIN
    LOCK TABLE users, visit, triage_rule IN SHARE MODE;
    SELECT count(*) INTO pharmacists FROM users WHERE role = 'Pharmacist';
    SELECT count(*) INTO shared_rooms FROM (
        SELECT room_id FROM users WHERE is_active AND room_id IS NOT NULL GROUP BY room_id HAVING count(*) > 1
    ) s;
    SELECT count(*) INTO vas_visits FROM visit WHERE vital_signs ? 'pain_vas';
    SELECT count(*) INTO vas_rules FROM triage_rule WHERE status = 'Active'
        AND jsonb_path_exists(jsonb_build_array(condition_logic, trigger_when), 'lax $.**.vital ? (@ == "pain_vas")');
    SELECT count(*) INTO gated_rules FROM triage_rule WHERE status = 'Active' AND trigger_when IS NOT NULL;
    IF pharmacists + shared_rooms + vas_visits + vas_rules + gated_rules > 0 THEN
        RAISE EXCEPTION 'Không gỡ được 0011: còn % tài khoản Pharmacist, % phòng có nhiều tài khoản đang hoạt động, '
            '% lượt khám có pain_vas, % luật Active dùng pain_vas, % luật Active có trigger_when. '
            'Xử lý các dòng này rồi chạy lại.', pharmacists, shared_rooms, vas_visits, vas_rules, gated_rules;
    END IF;
END $$;
"""


def _revision_0011():
    return context.script.get_revision("0011").module


def upgrade() -> None:
    op.execute(_GUARD)
    _revision_0011().downgrade()
    op.execute("DELETE FROM system_setting WHERE setting_key = 'prescription.gi_protect_age'")


def downgrade() -> None:
    _revision_0011().upgrade()
