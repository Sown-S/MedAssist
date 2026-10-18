"""Tạo tài khoản nhân viên từ dòng lệnh (dùng để tạo Admin đầu tiên).

Chạy trong server/:
    python -m scripts.create_user --username admin --full-name "Quản trị viên" --role Admin
Mật khẩu nhập ẩn (không hiện, không lưu vào lịch sử lệnh). Dòng audit ghi người thực hiện
là tài khoản 'system', vì script không có người đăng nhập.
"""
import argparse
import getpass
import sys

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import MIN_PASSWORD_LENGTH, hash_password
from app.models.user import ROLES, SYSTEM_USER_ID, User
from app.services import audit_service as audit


def main() -> int:
    p = argparse.ArgumentParser(description="Tạo tài khoản MedAssist")
    p.add_argument("--username", required=True)
    p.add_argument("--full-name", required=True)
    p.add_argument("--role", required=True, choices=ROLES)
    p.add_argument("--email")
    p.add_argument("--phone")
    args = p.parse_args()

    if args.username.lower() == "system":
        print("Không được dùng tên 'system' (tài khoản hệ thống).", file=sys.stderr)
        return 1

    pw = getpass.getpass(f"Mật khẩu (>= {MIN_PASSWORD_LENGTH} ký tự): ")
    if pw != getpass.getpass("Nhập lại mật khẩu: "):
        print("Hai lần nhập không khớp.", file=sys.stderr)
        return 1
    try:
        pw_hash = hash_password(pw)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1

    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == args.username)):
            print(f"Tên đăng nhập '{args.username}' đã tồn tại.", file=sys.stderr)
            return 1
        user = User(username=args.username, password_hash=pw_hash, full_name=args.full_name,
                    role=args.role, email=args.email, phone=args.phone)
        db.add(user)
        db.flush()
        audit.record(db, action="CREATE", entity="users", entity_id=user.user_id,
                     actor_id=SYSTEM_USER_ID,
                     new_values={"username": user.username, "role": user.role,
                                 "full_name": user.full_name, "source": "scripts.create_user"})
        db.commit()
        print(f"Đã tạo {user.role} '{user.username}' ({user.user_id}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())