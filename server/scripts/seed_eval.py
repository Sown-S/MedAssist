"""Dữ liệu cho môi trường kiểm thử (deploy/docker-compose.eval.yml): tài khoản, danh mục, tri thức, bệnh nhân,
lượt khám các ngày trước và hàng đợi hôm nay. Chạy lại an toàn: phần nào đã có thì bỏ qua.

Chạy trong container api (service seed của compose eval tự chạy mỗi lần bật):
    python -m scripts.seed_eval
    python -m scripts.seed_eval --skip-knowledge    # tri thức đã nạp bằng import_okf
Mật khẩu chung của các tài khoản lấy từ biến EVAL_PASSWORD. Không dùng cho phòng khám thật.
"""
import argparse
import asyncio
import datetime
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select, text

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import AiAssessmentLog, Condition, Drug, InventoryBatch, Patient, Room, Symptom, User, Visit
from app.models.user import SYSTEM_USER_ID
from app.schemas.diagnosis import DiagnosisCreate
from app.schemas.inventory import BatchCreate
from app.schemas.patient import PatientCreate
from app.schemas.prescription import PrescriptionDraft
from app.schemas.visit import ReferralIn, VisitCreate
from app.schemas.visit_symptom import SymptomsPut
from app.services import (ai_queue_service, audit_service as audit, billing_service, emr_service,
                          inventory_service, prescription_service, queue_service, symptom_service)
from app.services.knowledge_reader import DbKnowledgeReader
from app.worker.runner import DisabledLLMClient, process_one

DATA = Path(__file__).resolve().parents[1] / "data"
DEFAULT_CASES = DATA / "eval_cases.jsonl"
DEFAULT_PASSWORD = "Kiemthu@2026"

ACCOUNTS = [  # username, họ tên, vai trò, mã phòng
    ("admin", "Nguyễn Quản Trị", "Admin", None),
    ("bs01", "BS. Trần Minh Khoa", "Physician", "01"),
    ("bs02", "BS. Lê Thu Hà", "Physician", "02"),
    ("letan01", "Phạm Thị Mai", "Nurse", None),
]

# Thuốc kê cho lượt khám mẫu theo nhóm bệnh: (tên thương mại, liều, số lần, số ngày, số lượng)
RX_BY_GROUP = {
    "ent": [("Zinnat 500", "1 viên", "2 lần/ngày sau ăn", 7, 14), ("Panadol", "1 viên", "Khi sốt > 38,5°C", 3, 6)],
    "infectious": [("Panadol", "1 viên", "3 lần/ngày khi sốt", 3, 9), ("Oresol 245", "1 gói", "Pha 200 ml, uống trong ngày", 3, 6)],
    "respiratory": [("Amoxicilin 500", "1 viên", "3 lần/ngày", 7, 21), ("Acemuc 200", "1 gói", "3 lần/ngày", 5, 15)],
    "musculoskeletal": [("Mobic 7.5", "1 viên", "1 lần/ngày sau ăn", 7, 7), ("Omeprazol 20", "1 viên", "Sáng trước ăn", 7, 7)],
    "dermatology": [("Clarityne", "1 viên", "Tối 1 viên", 10, 10), ("Canesten 1%", "Bôi mỏng", "2 lần/ngày", 14, 1)],
    "ophthalmology": [("Clarityne", "1 viên", "Tối 1 viên", 7, 7), ("Vitamin C 500", "1 viên", "Sáng 1 viên", 10, 10)],
}
DEFAULT_RX = [("Panadol", "1 viên", "Khi đau, cách 6 giờ", 3, 6)]

# Hàng đợi hôm nay: (loại ca, số ca, trạng thái cuối)
# Ca đã khám xong đứng trước để có số thứ tự nhỏ; đánh giá của chúng chạy ngay trong script (_rule_only_now).
TODAY_PLAN = [
    ("typical", 1, "Finished"), ("typical", 1, "Prescribed"), ("typical", 1, "Examining"),
    ("red_flag", 2, "CheckedIn"), ("priority_floor", 2, "CheckedIn"), ("typical", 3, "CheckedIn"),
    ("priority_floor", 1, "Waiting"), ("ambiguous", 2, "Waiting"), ("typical", 2, "Waiting"),
]
HISTORY_DAYS = 10
HISTORY_PER_DAY = 3
RETURNING = 4                    # bệnh nhân trong hàng đợi hôm nay có thêm một lượt khám cũ


def load_cases(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _phone(i: int) -> str:
    return f"09{(35_000_000 + i * 7_919) % 100_000_000:08d}"


# ------------------------------------------------------------------------------------------- nền
def seed_accounts(db, password: str) -> dict[str, User]:
    pw_hash = hash_password(password)
    rooms = {r.code: r.room_id for r in db.scalars(select(Room))}
    taken = set(db.scalars(select(User.room_id).where(User.is_active.is_(True), User.room_id.is_not(None))))
    out = {}
    for username, name, role, room in ACCOUNTS:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            room_id = rooms.get(room)
            user = User(username=username, password_hash=pw_hash, full_name=name, role=role,
                        room_id=None if room_id in taken else room_id)
            db.add(user)
            db.flush()
            audit.record(db, action="CREATE", entity="users", entity_id=user.user_id, actor_id=SYSTEM_USER_ID,
                         new_values={"username": username, "role": role, "source": "scripts.seed_eval"})
        out[username] = user
    db.commit()
    return out


def _run(main, *argv: str) -> None:
    saved = sys.argv
    sys.argv = ["seed_eval", *argv]
    try:
        code = main()
    finally:
        sys.argv = saved
    if code:
        raise SystemExit(f"Bước nạp {main.__module__} thất bại (mã {code})")


def seed_catalogs(knowledge_dir: Path | None, approver: str) -> None:
    from scripts import import_okf, seed_drugs, seed_referral_facilities, seed_services
    _run(seed_drugs.main)
    _run(seed_services.main)
    _run(seed_referral_facilities.main)
    if knowledge_dir is not None:
        if import_okf.main(["--dir", str(knowledge_dir), "--submit", "--approve-as", approver]):
            raise SystemExit("Nạp tri thức thất bại")


def seed_stock_alerts(db, today: datetime.date) -> None:
    """Vài lô sắp hết hạn và vài thuốc dưới ngưỡng để màn Kho có cảnh báo."""
    system = db.get(User, SYSTEM_USER_ID)
    drugs = db.scalars(select(Drug).where(Drug.is_active.is_(True)).order_by(Drug.generic_name)).all()
    for drug in drugs[5:8]:
        number = f"EVAL-NEAR-{str(drug.drug_id)[:6].upper()}"
        if not db.scalar(select(InventoryBatch.batch_id).where(InventoryBatch.batch_number == number)):
            inventory_service.create_batch(db, BatchCreate(
                drug_id=drug.drug_id, batch_number=number, expiry_date=today + datetime.timedelta(days=20),
                quantity=30, import_price=Decimal(1000)), system)
    for drug in drugs[10:13]:
        drug.reorder_level = 5000
    db.commit()


# ------------------------------------------------------------------------------------- lượt khám
class Flow:
    def __init__(self, db, users: dict[str, User], reader):
        self.db, self.users, self.reader = db, users, reader
        self.nurse = users["letan01"]
        self.conditions = {c.condition_code: c for c in db.scalars(select(Condition).where(Condition.status == "Active"))}
        self.drugs = {d.trade_name: d for d in db.scalars(select(Drug).where(Drug.is_active.is_(True)))}

    def patient(self, case: dict, idx: int):
        p = case["patient"]
        found = self.db.scalar(select(Patient).where(Patient.full_name == p["full_name"],
                                                     Patient.date_of_birth == datetime.date.fromisoformat(p["date_of_birth"])))
        if found:
            return found
        data = {k: v for k, v in p.items() if v is not None}
        return emr_service.create_patient(self.db, PatientCreate(phone=_phone(idx), confirm_duplicate=True, **data),
                                          self.nurse)

    def intake(self, case: dict, idx: int, check_in: bool) -> Visit:
        patient = self.patient(case, idx)
        visit = queue_service.create_visit(self.db, VisitCreate(patient_id=patient.patient_id, **case["visit"]),
                                           self.nurse)
        symptoms = [{"symptom_code": k, "state": v} for k, v in case["symptoms"].items()]
        symptom_service.put_symptoms(self.db, visit.visit_id, SymptomsPut(symptoms=symptoms), self.nurse)
        ai_queue_service.enqueue_assessment(self.db, visit.visit_id, self.nurse, self.reader)
        if check_in:
            queue_service.check_in(self.db, visit.visit_id, self.nurse)
        return visit

    def _rx_lines(self, case: dict) -> list[dict]:
        cond = self.conditions.get(case.get("condition_code") or "")
        out = []
        for trade, dosage, freq, days, qty in RX_BY_GROUP.get(cond.disease_group if cond else "", DEFAULT_RX):
            drug = self.drugs.get(trade)
            if drug:
                out.append({"drug_id": drug.drug_id, "dosage": dosage, "frequency": freq, "duration_days": days,
                            "quantity": qty})
        return out

    def examine(self, visit: Visit, case: dict, doctor: User) -> None:
        queue_service.start_exam(self.db, visit.visit_id, doctor)
        cond = self.conditions.get(case.get("condition_code") or "")
        dx = (DiagnosisCreate(condition_code=cond.condition_code) if cond
              else DiagnosisCreate(diagnosis_name=case["visit"]["chief_complaint"][:255]))
        prescription_service.add_diagnosis(self.db, visit.visit_id, dx, doctor)

    def prescribe(self, visit: Visit, case: dict, doctor: User) -> None:
        lines = self._rx_lines(case)
        if lines:
            prescription_service.save_draft(self.db, visit.visit_id, PrescriptionDraft(items=lines), doctor)
            prescription_service.confirm(self.db, visit.visit_id, doctor)
        else:
            prescription_service.complete_without_prescription(self.db, visit.visit_id, doctor)

    def collect(self, visit: Visit, method: str) -> None:
        billing_service.dispense_all(self.db, visit.visit_id, self.nurse)
        billing_service.pay(self.db, visit.visit_id, method, self.nurse)

    def refer(self, visit: Visit, case: dict, doctor: User) -> None:
        queue_service.start_exam(self.db, visit.visit_id, doctor)
        queue_service.refer(self.db, visit.visit_id, ReferralIn(
            facility_name="Bệnh viện Đà Nẵng", reason="Cần chuyên khoa và cận lâm sàng tuyến trên",
            diagnosis=case["visit"]["chief_complaint"][:500], transport="Family"), doctor)


# --------------------------------------------------------------------------------- dời ngày cũ
# Mốc lệch thêm (phút) sau giờ tiếp đón, để một lượt khám cũ trông như diễn ra trong khoảng 1 giờ.
_EXTRA = {
    ("visit", "checked_in_at"): 5, ("visit", "exam_started_at"): 20, ("visit", "finished_at"): 50,
    ("visit", "updated_at"): 50, ("visit_symptom", "confirmed_at"): 2, ("ai_assessment_log", "*"): 3,
    ("diagnosis", "*"): 30, ("prescription", "*"): 32,
    ("invoice", "created_at"): 33, ("invoice", "paid_at"): 50, ("prescription_item", "dispensed_at"): 48,
}
_TABLES = {   # bảng -> điều kiện chọn các dòng thuộc lượt khám
    "visit": "visit_id = :v",
    "visit_symptom": "visit_id = :v",
    "ai_assessment_log": "visit_id = :v",
    "diagnosis": "visit_id = :v",
    "prescription": "visit_id = :v",
    "prescription_item": "prescription_id IN (SELECT prescription_id FROM prescription WHERE visit_id = :v)",
    "invoice": "visit_id = :v",
}


def backdate(db, visit_id, at: datetime.datetime, queue_number: int) -> None:
    """Dời mốc thời gian của một lượt khám đã xong về `at` (giờ tiếp đón). Nhật ký và sổ kho chỉ ghi thêm
    nên giữ giờ thật lúc nạp."""
    created = db.scalar(select(Visit.created_at).where(Visit.visit_id == visit_id))
    delta = at - created
    cols = db.execute(text("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = "
                           "'public' AND data_type = 'timestamp with time zone' AND table_name = ANY(:t)"),
                      {"t": list(_TABLES)}).all()
    for table, where in _TABLES.items():
        sets = []
        for t, col in cols:
            if t != table or col == "lease_until":
                continue
            extra = _EXTRA.get((table, col), _EXTRA.get((table, "*"), 0))
            sets.append(f"{col} = {col} + make_interval(secs => :d) + make_interval(mins => {extra})")
        if table == "visit":
            sets += ["queue_date = (:at)::date", "queue_number = :n"]
        db.execute(text(f"UPDATE {table} SET {', '.join(sets)} WHERE {where}"),
                   {"d": delta.total_seconds(), "v": visit_id, "at": at.date(), "n": queue_number})
    prefix = f"HD-{at:%Y%m%d}-"
    seq = db.scalar(text("SELECT count(*) FROM invoice WHERE invoice_code LIKE :p"), {"p": prefix + "%"})
    for i, inv_id in enumerate(db.scalars(text("SELECT invoice_id FROM invoice WHERE visit_id = :v ORDER BY created_at"),
                                          {"v": visit_id})):
        db.execute(text("UPDATE invoice SET invoice_code = :c WHERE invoice_id = :i"),
                   {"c": f"{prefix}{seq + i + 1:04d}", "i": inv_id})


def _rule_only_now(flow: "Flow", visit_id) -> None:
    """Lượt khám đã xử lý xong trong script: chạy đánh giá ngay trong tiến trình, không gọi LLM, để có gợi ý theo
    luật trước khi bác sĩ chẩn đoán. Việc cũ hơn còn trong hàng đợi (nếu có) cũng được xử lý theo thứ tự."""
    flow.db.commit()
    pending = select(func.count()).select_from(AiAssessmentLog).where(
        AiAssessmentLog.visit_id == visit_id, AiAssessmentLog.status.in_(("Queued", "Running")))
    for _ in range(500):
        if not flow.db.scalar(pending) or not asyncio.run(process_one(flow.reader, DisabledLLMClient(), None)):
            break
        flow.db.expire_all()


def seed_history(flow: Flow, cases: list[dict], today: datetime.date, now: datetime.datetime) -> int:
    db = flow.db
    doctors = [flow.users["bs01"], flow.users["bs02"]]
    typical = [c for c in cases if c["category"] in ("typical", "variant")]
    today_typical = typical[:sum(n for cat, n, _ in TODAY_PLAN if cat == "typical")]
    pool = typical[len(today_typical):]
    plan = []                                          # (ngày lùi, ca, kết cục)
    for d in range(1, HISTORY_DAYS + 1):
        for k in range(HISTORY_PER_DAY):
            case = pool[((d - 1) * HISTORY_PER_DAY + k) % len(pool)]
            outcome = "refer" if (d, k) in ((3, 2), (8, 1)) else "cancel" if (d, k) == (5, 2) else "finish"
            plan.append((d, case, outcome))
    for i, case in enumerate(today_typical[:RETURNING]):
        plan.append((HISTORY_DAYS + 4 + i, case, "finish"))
    counters: dict[datetime.date, int] = {}
    for i, (days_ago, case, outcome) in enumerate(plan):
        doctor = doctors[i % 2]
        visit = flow.intake(case, 1000 + i, check_in=True)
        _rule_only_now(flow, visit.visit_id)
        if outcome == "cancel":
            queue_service.cancel(db, visit.visit_id, "Bệnh nhân bỏ về trước khi khám", flow.nurse)
        elif outcome == "refer":
            flow.refer(visit, case, doctor)
        else:
            flow.examine(visit, case, doctor)
            flow.prescribe(visit, case, doctor)
            flow.collect(visit, "BankingTransfer" if i % 3 == 0 else "Cash")
        day = today - datetime.timedelta(days=days_ago)
        counters[day] = counters.get(day, 0) + 1
        at = datetime.datetime.combine(day, datetime.time(7, 30), now.tzinfo) + datetime.timedelta(
            minutes=40 * counters[day])
        backdate(db, visit.visit_id, at, counters[day])
        db.commit()
    return len(plan)


def seed_today(flow: Flow, cases: list[dict]) -> int:
    db = flow.db
    by_cat: dict[str, list[dict]] = {}
    for c in cases:
        by_cat.setdefault("typical" if c["category"] == "variant" else c["category"], []).append(c)
    used: dict[str, int] = {}
    n = 0
    for cat, count, status in TODAY_PLAN:
        for _ in range(count):
            i = used.get(cat, 0)
            used[cat] = i + 1
            case = by_cat[cat][i]
            visit = flow.intake(case, 2000 + n, check_in=status != "Waiting")
            doctor = flow.users["bs01" if status == "Examining" else "bs02"]
            if status in ("Examining", "Prescribed", "Finished"):
                _rule_only_now(flow, visit.visit_id)
                flow.examine(visit, case, doctor)
            if status in ("Prescribed", "Finished"):
                flow.prescribe(visit, case, doctor)
            if status == "Finished":
                flow.collect(visit, "Cash")
            db.commit()
            n += 1
    return n


# ------------------------------------------------------------------------------------------ main
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Nạp dữ liệu môi trường kiểm thử MedAssist")
    ap.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    ap.add_argument("--knowledge-dir", type=Path, default=Path(os.environ.get("KNOWLEDGE_DIR", "/knowledge")))
    ap.add_argument("--skip-knowledge", action="store_true", help="Không nạp tri thức (đã có bản Active)")
    ap.add_argument("--skip-catalogs", action="store_true", help="Không nạp thuốc, dịch vụ, cơ sở chuyển tuyến")
    args = ap.parse_args(argv)
    password = os.environ.get("EVAL_PASSWORD") or DEFAULT_PASSWORD
    cases = load_cases(args.cases)

    with SessionLocal() as db:
        first_run = db.scalar(select(User.user_id).where(User.username == "letan01")) is None
        users = seed_accounts(db, password)
        today, now = db.execute(select(func.current_date(), func.now())).one()
    if first_run and not args.skip_catalogs:
        seed_catalogs(None if args.skip_knowledge else args.knowledge_dir, "bs01")
        with SessionLocal() as db:
            seed_stock_alerts(db, today)

    reader = DbKnowledgeReader()
    if not reader.refresh().release.get("release_id"):
        print("Chưa có bản tri thức Active: không tạo lượt khám mẫu.", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        active = set(db.scalars(select(Symptom.symptom_code).where(Symptom.status == "Active")))
        cases = [c for c in cases if set(c["symptoms"]) <= active]
        flow = Flow(db, {u: db.get(User, users[u].user_id) for u in users}, reader)
        has_history = db.scalar(select(Visit.visit_id).where(Visit.queue_date < today).limit(1))
        has_today = db.scalar(select(Visit.visit_id).where(Visit.queue_date == today).limit(1))
        made_history = 0 if has_history else seed_history(flow, cases, today, now)
        made_today = 0 if has_today else seed_today(flow, cases)
    print(f"Tài khoản: {', '.join(u for u, *_ in ACCOUNTS)} (mật khẩu chung trong EVAL_PASSWORD). "
          f"Lượt khám cũ mới tạo: {made_history}; hàng đợi hôm nay mới tạo: {made_today}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
