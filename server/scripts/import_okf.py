"""Nạp tri thức OKF (Markdown + YAML front matter, thư mục ``knowledge/`` của Tuấn) vào CSDL.

Chạy trong server/:
    python -m scripts.import_okf --dry-run                      # chỉ kiểm tra + báo thay đổi, không ghi
    python -m scripts.import_okf                                # tạo bản phát hành Draft
    python -m scripts.import_okf --submit                       # tạo và gửi duyệt (PendingApproval)
    python -m scripts.import_okf --approve-as bs                # tạo và kích hoạt ngay (máy dev / demo)
Tùy chọn: --dir <thư mục OKF> (mặc định ../knowledge), --as <username Admin soạn> (mặc định tài khoản
'system'), --retire-missing (mục đang Active mà không còn trong thư mục -> Retired/Deactivated khi kích hoạt).

Quy tắc (đặc tả knowledge/_spec/okf_format.md + quyết định 18/10):
- Nhận diện file theo trường ``schema``; tài liệu (``okf_spec_v1``, ``okf_review_log_v1``) và thư mục
  ``exports/`` bị bỏ qua.
- Nguồn tra theo khóa tự nhiên (organization, edition); ``source_key`` chỉ dùng để liên kết trong thư mục.
- condition_logic kiểm theo đặc tả chung (app.validation.knowledge_validators) VÀ chạy thử bằng chính
  bộ đánh giá của pipeline (app.ai.rules.condition_evaluator) để chắc chắn luật dùng được.
- Chỉ mục mới hoặc có nội dung khác bản Active mới tạo phiên bản mới (version + 1); mục không đổi giữ nguyên.
- Kích hoạt trong MỘT transaction: bản cũ -> Retired(Superseded), bản mới -> Active, epoch tự tăng
  (trigger); trigger toàn vẹn kiểm tập Active khép kín lúc COMMIT.
"""
import argparse
import datetime
import re
import sys
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import (Condition, ConditionSymptom, GuidelineExcerpt, KnowledgeRelease, KnowledgeSource, Symptom,
                        TriageRule, User)
from app.models.user import SYSTEM_USER_ID
from app.exceptions import AppError
from app.services import audit_service as audit
from app.services import knowledge_service
from app.validation.knowledge_validators import (ConditionCode, ExcerptKey, SymptomCode, check_rule_key,
                                                 condition_logic_errors, logic_symptom_codes)

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "knowledge"
_FRONT = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.S)


# ============================================================================ định dạng file
class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ReleaseFile(_Strict):
    schema_: Literal["okf_release_v1"] = Field(alias="schema")
    label: str = Field(min_length=1, max_length=30)
    description: str | None = None


class SourceFile(_Strict):
    schema_: Literal["okf_source_v1"] = Field(alias="schema")
    source_key: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=255)
    organization: str = Field(min_length=1, max_length=100)
    publication_date: datetime.date | None = None
    edition: str = Field(min_length=1, max_length=50)
    url: str | None = None
    accessed_date: datetime.date | None = None
    license_note: str | None = None


class SymptomItem(_Strict):
    symptom_code: SymptomCode
    symptom_name: str = Field(min_length=1, max_length=150)
    category: str | None = Field(default=None, max_length=100)


class SymptomCatalogFile(_Strict):
    schema_: Literal["okf_symptom_catalog_v1"] = Field(alias="schema")
    symptoms: list[SymptomItem] = Field(min_length=1)


class _Sourced(_Strict):
    source_key: str
    source_edition: str | None = None          # tùy chọn: nếu có phải khớp edition của nguồn


class RelationItem(_Sourced):
    symptom_code: SymptomCode
    polarity: Literal["SUPPORTS", "CONTRADICTS"]
    weight: Decimal = Field(ge=0, le=1, max_digits=3, decimal_places=2)   # DECIMAL(3,2)
    is_key: bool = False


class ExcerptItem(_Sourced):
    excerpt_key: ExcerptKey
    title: str = Field(min_length=1, max_length=255)
    source_locator: str | None = Field(default=None, max_length=100)


class ConditionFile(_Strict):
    schema_: Literal["okf_condition_v1"] = Field(alias="schema")
    condition_code: ConditionCode
    name_vi: str = Field(min_length=1, max_length=200)
    name_en: str | None = None                 # chỉ để đọc, không có cột trong CSDL
    icd10_code: str | None = Field(default=None, max_length=10)
    disease_group: str | None = Field(default=None, max_length=100)
    description: str | None = None
    relations: list[RelationItem] = Field(default_factory=list)
    excerpts: list[ExcerptItem] = Field(default_factory=list)


class RuleFile(_Sourced):
    schema_: Literal["okf_triage_rule_v1"] = Field(alias="schema")
    rule_key: str
    rule_name: str = Field(min_length=1, max_length=255)
    rule_type: Literal["RED_FLAG", "PRIORITY_FLOOR"]
    resulting_priority: Literal["Emergency", "HighPriority"]
    reason_text: str = Field(min_length=1)
    condition_logic: dict

    @model_validator(mode="after")
    def _key(self) -> "RuleFile":
        check_rule_key(self.rule_key, self.rule_type)
        return self


_MODELS = {"okf_release_v1": ReleaseFile, "okf_source_v1": SourceFile, "okf_symptom_catalog_v1": SymptomCatalogFile,
           "okf_condition_v1": ConditionFile, "okf_triage_rule_v1": RuleFile}
_IGNORED_SCHEMAS = {"okf_spec_v1", "okf_review_log_v1"}


# ============================================================================ đọc + kiểm tra thư mục
@dataclass
class Vault:
    root: Path
    release: ReleaseFile | None = None
    sources: dict[str, SourceFile] = field(default_factory=dict)
    symptoms: dict[str, SymptomItem] = field(default_factory=dict)
    conditions: dict[str, ConditionFile] = field(default_factory=dict)
    excerpt_content: dict[str, str] = field(default_factory=dict)
    rules: dict[str, RuleFile] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    def err(self, path: Path | str, message: str) -> None:
        rel = path.relative_to(self.root).as_posix() if isinstance(path, Path) else path
        self.errors.append(f"{rel}: {message}")


def _excerpts_in_body(body: str) -> dict[str, str]:
    parts = re.split(r"^## excerpt:\s*([a-z0-9_]+)\s*$", body, flags=re.M)
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}


def load_vault(root: Path) -> Vault:
    """Đọc toàn bộ thư mục và kiểm tra (không truy cập DB). Lỗi gom vào ``vault.errors``."""
    v = Vault(root=root)
    if not root.is_dir():
        v.errors.append(f"Không thấy thư mục OKF: {root}")
        return v
    for path in sorted(root.rglob("*.md")):
        rel = path.relative_to(root)
        if rel.parts[0] == "exports":
            continue
        text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
        m = _FRONT.match(text)
        if not m:
            v.err(path, "Thiếu front matter YAML (---)")
            continue
        try:
            data = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError as e:
            v.err(path, f"YAML lỗi: {e}")
            continue
        schema = data.get("schema")
        if schema in _IGNORED_SCHEMAS:
            continue
        model = _MODELS.get(schema)
        if model is None:
            v.err(path, f"schema không hỗ trợ: {schema!r}")
            continue
        try:
            obj = model.model_validate(data)
        except ValidationError as e:
            for d in e.errors():
                v.err(path, f"{'.'.join(str(x) for x in d['loc'])}: {d['msg']}")
            continue
        _register(v, path, obj, m.group(2))
    _cross_check(v)
    return v


def _dup(v: Vault, path: Path, kind: str, key: str, bucket: dict) -> bool:
    if key in bucket:
        v.err(path, f"{kind} trùng: {key}")
        return True
    return False


def _register(v: Vault, path: Path, obj: BaseModel, body: str) -> None:
    if isinstance(obj, ReleaseFile):
        if v.release is not None:
            v.err(path, "Có nhiều hơn một _release.md")
        v.release = obj
    elif isinstance(obj, SourceFile):
        if not _dup(v, path, "source_key", obj.source_key, v.sources):
            v.sources[obj.source_key] = obj
    elif isinstance(obj, SymptomCatalogFile):
        for s in obj.symptoms:
            if not _dup(v, path, "Mã triệu chứng", s.symptom_code, v.symptoms):
                v.symptoms[s.symptom_code] = s
    elif isinstance(obj, ConditionFile):
        if path.stem != obj.condition_code:
            v.err(path, f"Tên file phải trùng condition_code ({obj.condition_code})")
        if _dup(v, path, "Mã bệnh", obj.condition_code, v.conditions):
            return
        v.conditions[obj.condition_code] = obj
        bodies = _excerpts_in_body(body)
        seen = set()
        for r in obj.relations:
            if r.symptom_code in seen:
                v.err(path, f"Quan hệ trùng: {r.symptom_code}")
            seen.add(r.symptom_code)
        for e in obj.excerpts:
            if _dup(v, path, "excerpt_key", e.excerpt_key, v.excerpt_content):
                continue
            content = bodies.get(e.excerpt_key, "")
            if not content:
                v.err(path, f"Không có nội dung '## excerpt: {e.excerpt_key}' trong thân file")
            v.excerpt_content[e.excerpt_key] = content
    elif isinstance(obj, RuleFile):
        if path.stem != obj.rule_key:
            v.err(path, f"Tên file phải trùng rule_key ({obj.rule_key})")
        expected = {"RED_FLAG": "Emergency", "PRIORITY_FLOOR": "HighPriority"}[obj.rule_type]
        if obj.resulting_priority != expected:
            v.err(path, f"Luật {obj.rule_type} phải có resulting_priority = {expected}")
        for e in condition_logic_errors(obj.condition_logic):
            v.err(path, f"condition_logic {e['path']}: {e['message']}")
        if not _dup(v, path, "rule_key", obj.rule_key, v.rules):
            v.rules[obj.rule_key] = obj


def _cross_check(v: Vault) -> None:
    from app.ai.rules.condition_evaluator import ConditionFormatError, evaluate_condition
    if v.release is None:
        v.errors.append("Thiếu _release.md")
    if not v.symptoms:
        v.errors.append("Thiếu symptoms/symptom_catalog.md")

    def source_ok(where: str, item: _Sourced) -> None:
        src = v.sources.get(item.source_key)
        if src is None:
            v.errors.append(f"{where}: source_key '{item.source_key}' không có trong sources/")
        elif item.source_edition and item.source_edition != src.edition:
            v.errors.append(f"{where}: source_edition '{item.source_edition}' khác edition của nguồn '{src.edition}'")

    editions = {}
    for s in v.sources.values():
        key = (s.organization, s.edition)
        if key in editions:
            v.errors.append(f"sources: {s.source_key} và {editions[key]} trùng (organization, edition)")
        editions[key] = s.source_key
    for c in v.conditions.values():
        for r in c.relations:
            where = f"{c.condition_code}/{r.symptom_code}"
            if r.symptom_code not in v.symptoms:
                v.errors.append(f"{where}: triệu chứng không có trong catalog")
            source_ok(where, r)
        for e in c.excerpts:
            source_ok(e.excerpt_key, e)
    for r in v.rules.values():
        source_ok(r.rule_key, r)
        for code in sorted(logic_symptom_codes(r.condition_logic) - set(v.symptoms)):
            v.errors.append(f"{r.rule_key}: condition_logic dùng triệu chứng không có trong catalog: {code}")
        try:                                             # chạy thử bằng bộ đánh giá của pipeline
            evaluate_condition(r.condition_logic, {"symptoms": {}, "vital_signs": {}})
        except ConditionFormatError as e:
            v.errors.append(f"{r.rule_key}: bộ đánh giá luật không đọc được condition_logic: {e}")


# ============================================================================ so với CSDL
ITEM_TYPES = ("symptom", "condition", "relation", "excerpt", "rule")


@dataclass
class Change:
    kind: str                  # symptom | condition | relation | excerpt | rule
    key: str
    action: str                # new | changed
    values: dict[str, Any]


@dataclass
class Plan:
    changes: list[Change] = field(default_factory=list)
    unchanged: dict[str, int] = field(default_factory=lambda: dict.fromkeys(ITEM_TYPES, 0))
    missing: list[tuple[str, str]] = field(default_factory=list)       # đang Active, không còn trong thư mục
    new_sources: list[SourceFile] = field(default_factory=list)

    def count(self, action: str) -> dict[str, int]:
        out = dict.fromkeys(ITEM_TYPES, 0)
        for c in self.changes:
            if c.action == action:
                out[c.kind] += 1
        return out


def _source_ids(db: Session, v: Vault) -> tuple[dict[str, Any], list[SourceFile]]:
    """source_key -> source_id (hoặc chính SourceFile nếu chưa có trong DB)."""
    out, new = {}, []
    for key, s in v.sources.items():
        sid = db.scalar(select(KnowledgeSource.source_id).where(KnowledgeSource.organization == s.organization,
                                                                KnowledgeSource.edition == s.edition))
        if sid is None:
            new.append(s)
            out[key] = s
        else:
            out[key] = sid
    return out, new


_MODEL = {"symptom": (Symptom, ("symptom_code",)), "condition": (Condition, ("condition_code",)),
          "relation": (ConditionSymptom, ("condition_code", "symptom_code")),
          "excerpt": (GuidelineExcerpt, ("excerpt_key",)), "rule": (TriageRule, ("rule_key",))}


def _key_of(kind: str, row) -> str:
    return "/".join(str(getattr(row, k)) for k in _MODEL[kind][1])


def _norm(value):
    if isinstance(value, Decimal):
        return value.quantize(Decimal("0.01"))
    if isinstance(value, float):
        return Decimal(str(value)).quantize(Decimal("0.01"))
    return value


def desired_items(v: Vault, sids: dict[str, Any]) -> dict[str, dict[str, dict[str, Any]]]:
    """Giá trị mong muốn của từng mục theo thư mục OKF, theo đúng tên cột CSDL."""
    items: dict[str, dict[str, dict[str, Any]]] = {k: {} for k in ITEM_TYPES}
    for s in v.symptoms.values():
        items["symptom"][s.symptom_code] = {"symptom_code": s.symptom_code, "symptom_name": s.symptom_name,
                                            "category": s.category}
    for c in v.conditions.values():
        items["condition"][c.condition_code] = {"condition_code": c.condition_code, "name_vi": c.name_vi,
                                                "icd10_code": c.icd10_code, "disease_group": c.disease_group,
                                                "description": c.description}
        for r in c.relations:
            items["relation"][f"{c.condition_code}/{r.symptom_code}"] = {
                "condition_code": c.condition_code, "symptom_code": r.symptom_code, "polarity": r.polarity,
                "weight": r.weight, "is_key": r.is_key, "source_id": sids[r.source_key]}
        for e in c.excerpts:
            items["excerpt"][e.excerpt_key] = {
                "excerpt_key": e.excerpt_key, "condition_code": c.condition_code, "title": e.title,
                "content": v.excerpt_content[e.excerpt_key], "source_id": sids[e.source_key],
                "source_locator": e.source_locator}
    for r in v.rules.values():
        items["rule"][r.rule_key] = {"rule_key": r.rule_key, "rule_name": r.rule_name, "rule_type": r.rule_type,
                                     "condition_logic": r.condition_logic, "resulting_priority": r.resulting_priority,
                                     "reason_text": r.reason_text, "source_id": sids[r.source_key]}
    return items


def make_plan(db: Session, v: Vault) -> Plan:
    plan = Plan()
    sids, plan.new_sources = _source_ids(db, v)
    for kind, wanted in desired_items(v, sids).items():
        model, _ = _MODEL[kind]
        active = {_key_of(kind, row): row for row in db.scalars(select(model).where(model.status == "Active"))}
        for key, values in wanted.items():
            row = active.pop(key, None)
            if row is None:
                plan.changes.append(Change(kind, key, "new", values))
            elif any(_norm(getattr(row, col)) != _norm(val) for col, val in values.items()
                     if not isinstance(val, SourceFile)):
                plan.changes.append(Change(kind, key, "changed", values))
            elif any(isinstance(val, SourceFile) for val in values.values()):
                plan.changes.append(Change(kind, key, "changed", values))     # đổi sang nguồn mới
            else:
                plan.unchanged[kind] += 1
        plan.missing.extend((kind, key) for key in sorted(active))
    return plan


# ============================================================================ ghi vào CSDL
class ImportError_(Exception):
    pass


def _user(db: Session, username: str | None, role: str | None) -> User:
    if username is None:
        return db.get(User, SYSTEM_USER_ID)
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active:
        raise ImportError_(f"Không có tài khoản đang hoạt động '{username}'")
    if role and user.role != role:
        raise ImportError_(f"'{username}' phải có vai trò {role} (hiện là {user.role})")
    return user


def apply_plan(db: Session, v: Vault, plan: Plan, *, drafter: User, approver: User | None = None,
               submit: bool = False, retire_missing: bool = False) -> KnowledgeRelease:
    """Ghi bản phát hành + các phiên bản mới. Không commit (bên gọi commit; trigger toàn vẹn chạy lúc đó)."""
    if approver is not None and approver.user_id == drafter.user_id:
        raise ImportError_("Người duyệt phải khác người soạn")
    open_rel = db.scalar(select(KnowledgeRelease).where(KnowledgeRelease.status.in_(["Draft", "PendingApproval"])))
    if open_rel is not None:
        raise ImportError_(f"Đang có bản phát hành mở '{open_rel.label}' ({open_rel.status}); duyệt hoặc từ chối trước")
    if db.scalar(select(KnowledgeRelease.release_id).where(KnowledgeRelease.label == v.release.label)):
        raise ImportError_(f"Nhãn '{v.release.label}' đã dùng; đổi label trong _release.md cho bản mới")

    # Khi duyệt ngay: ghi như một bản chờ duyệt rồi kích hoạt bằng CHÍNH hàm của API quản trị tri thức
    status = "PendingApproval" if (submit or approver) else "Draft"
    now = func.now()
    rel = KnowledgeRelease(label=v.release.label, description=v.release.description, status=status,
                           created_by=drafter.user_id, submitted_at=now if status == "PendingApproval" else None)
    db.add(rel)
    created_sources = {}
    for s in plan.new_sources:
        src = KnowledgeSource(title=s.title, organization=s.organization, publication_date=s.publication_date,
                              edition=s.edition, url=s.url, accessed_date=s.accessed_date,
                              license_note=s.license_note, created_by=drafter.user_id)
        db.add(src)
        created_sources[id(s)] = src
    db.flush()

    for kind in ITEM_TYPES:                               # khóa (symptom/condition) trước quan hệ
        model, keycols = _MODEL[kind]
        for ch in (c for c in plan.changes if c.kind == kind):
            values = {k: (created_sources[id(val)].source_id if isinstance(val, SourceFile) else val)
                      for k, val in ch.values.items()}
            where = [getattr(model, col) == values[col] for col in keycols]
            latest = db.scalar(select(func.max(model.version)).where(*where)) or 0
            db.add(model(**values, version=latest + 1, status=status, release_id=rel.release_id,
                         created_by=drafter.user_id))
        db.flush()

    if approver:
        try:
            knowledge_service.activate_release(db, rel, approver)
        except AppError as e:
            raise ImportError_(e.message) from None

    retired = 0
    if approver and retire_missing:
        for kind, key in plan.missing:
            model, keycols = _MODEL[kind]
            where = [getattr(model, col) == part for col, part in zip(keycols, key.split("/"))]
            retired += db.execute(update(model).where(*where, model.status == "Active")
                                  .values(status="Retired", retired_by=approver.user_id, retired_at=now,
                                          retired_reason="Deactivated")).rowcount
        db.flush()

    audit.record(db, action="CREATE", entity="knowledge_release", entity_id=rel.release_id,
                 actor_id=drafter.user_id,
                 new_values={"label": rel.label, "status": status, "source": "scripts.import_okf",
                             "new": plan.count("new"), "changed": plan.count("changed"),
                             "new_sources": len(plan.new_sources), "retired_missing": retired})
    if approver:
        audit.record(db, action="UPDATE", entity="knowledge_release", entity_id=rel.release_id,
                     actor_id=approver.user_id, new_values={"status": "Active", "approved": True})
    return rel


# ============================================================================ dòng lệnh
def _report(v: Vault, plan: Plan) -> None:
    print(f"Thư mục: {v.root}")
    print(f"  {len(v.symptoms)} triệu chứng, {len(v.conditions)} bệnh, "
          f"{sum(len(c.relations) for c in v.conditions.values())} quan hệ, {len(v.excerpt_content)} trích dẫn, "
          f"{len(v.rules)} luật, {len(v.sources)} nguồn")
    new, changed = plan.count("new"), plan.count("changed")
    for kind in ITEM_TYPES:
        print(f"  {kind:10} mới {new[kind]:3}  đổi {changed[kind]:3}  giữ nguyên {plan.unchanged[kind]:3}")
    if plan.new_sources:
        print(f"  Nguồn mới: {', '.join(s.source_key for s in plan.new_sources)}")
    if plan.missing:
        print(f"  Đang Active nhưng không còn trong thư mục ({len(plan.missing)}): "
              + ", ".join(f"{k}:{key}" for k, key in plan.missing[:10]) + (" ..." if len(plan.missing) > 10 else ""))


def main(argv: list[str] | None = None) -> int:
    from app.core.database import SessionLocal
    p = argparse.ArgumentParser(description="Nạp tri thức OKF vào CSDL MedAssist")
    p.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    p.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra và báo thay đổi")
    p.add_argument("--submit", action="store_true", help="Gửi duyệt ngay (PendingApproval)")
    p.add_argument("--approve-as", metavar="USERNAME", help="Bác sĩ duyệt và kích hoạt ngay (máy dev/demo)")
    p.add_argument("--as", dest="drafter", metavar="USERNAME", help="Admin soạn (mặc định tài khoản system)")
    p.add_argument("--retire-missing", action="store_true",
                   help="Khi kích hoạt: mục Active không còn trong thư mục -> Retired")
    args = p.parse_args(argv)

    vault = load_vault(args.dir.resolve())
    if vault.errors:
        print(f"Thư mục OKF có {len(vault.errors)} lỗi, không nạp:", file=sys.stderr)
        for e in vault.errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        plan = make_plan(db, vault)
        _report(vault, plan)
        if not plan.changes and not (args.retire_missing and plan.missing):
            print("Không có thay đổi so với bản Active. Không tạo bản phát hành.")
            return 0
        if args.dry_run:
            print("--dry-run: không ghi gì.")
            return 0
        try:
            drafter = _user(db, args.drafter, "Admin" if args.drafter else None)
            approver = _user(db, args.approve_as, "Physician") if args.approve_as else None
            rel = apply_plan(db, vault, plan, drafter=drafter, approver=approver, submit=args.submit,
                             retire_missing=args.retire_missing)
            db.commit()                                    # trigger toàn vẹn kiểm tập Active ở đây
        except ImportError_ as e:
            db.rollback()
            print(f"Không nạp: {e}", file=sys.stderr)
            return 1
        except Exception as e:                             # vd trigger toàn vẹn từ chối
            db.rollback()
            print(f"CSDL từ chối: {getattr(e, 'orig', e)}", file=sys.stderr)
            return 1
        print(f"Đã tạo bản phát hành {rel.label} ({rel.status}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
