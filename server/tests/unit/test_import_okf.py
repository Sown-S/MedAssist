"""scripts/import_okf.py + hàm kiểm tra condition_logic dùng chung.

Phần ghi DB chạy trong một transaction rồi ROLLBACK (không để lại tri thức trong medassist_test);
``SET CONSTRAINTS ALL IMMEDIATE`` ép trigger toàn vẹn chạy ngay trước khi rollback.
"""
import shutil
from pathlib import Path

import pytest
from sqlalchemy import func, select, text

from app.core.database import SessionLocal
from app.models import Condition, ConditionSymptom, KnowledgeRelease, Symptom, TriageRule, User
from app.validation.knowledge_validators import condition_logic_errors, logic_symptom_codes
from scripts import import_okf as okf

OFFICIAL = okf.DEFAULT_DIR


# ---------------------------------------------------------------------------- condition_logic
@pytest.mark.parametrize("logic", [
    {"type": "symptom", "symptom_code": "fever_high", "state": "PRESENT"},
    {"op": "OR", "args": [{"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": 92},
                          {"op": "AND", "args": [{"type": "age", "unit": "months", "cmp": "<", "value": 2},
                                                 {"type": "vital", "vital": "temperature_c", "cmp": ">=", "value": 38}]}]},
])
def test_logic_valid(logic):
    assert condition_logic_errors(logic) == []


@pytest.mark.parametrize("logic, path", [
    ({"op": "NOT", "args": [{"type": "symptom", "symptom_code": "a", "state": "PRESENT"}]}, "$.op"),
    ({"op": "AND", "args": []}, "$.args"),
    ({"op": "AND", "conditions": [{"type": "symptom", "symptom_code": "a", "state": "PRESENT"}]}, "$"),
    ({"type": "symptom", "code": "a", "status": "PRESENT"}, "$"),                 # định dạng cũ của Huy
    ({"type": "symptom", "symptom_code": "Sot-Cao", "state": "PRESENT"}, "$.symptom_code"),
    ({"type": "symptom", "symptom_code": "a", "state": "UNKNOWN"}, "$.state"),
    ({"type": "vital", "vital": "spo2", "cmp": "<", "value": 92}, "$.vital"),
    ({"type": "vital", "vital": "spo2_pct", "cmp": "lt", "value": 92}, "$.cmp"),
    ({"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": "92"}, "$.value"),
    ({"type": "age", "unit": "days", "cmp": "<", "value": 2}, "$.unit"),
    ({"type": "lab", "value": 1}, "$.type"),
    ("chuỗi", "$"),
])
def test_logic_invalid(logic, path):
    errors = condition_logic_errors(logic)
    assert errors and path in [e["path"] for e in errors], errors


def test_logic_depth_limit():
    node = {"type": "symptom", "symptom_code": "a", "state": "PRESENT"}
    for _ in range(5):
        node = {"op": "AND", "args": [node]}
    assert any("Lồng quá" in e["message"] for e in condition_logic_errors(node))


def test_logic_symptom_codes_any_depth():
    logic = {"op": "OR", "args": [{"type": "symptom", "symptom_code": "a", "state": "PRESENT"},
                                  {"op": "AND", "args": [{"type": "symptom", "symptom_code": "b", "state": "ABSENT"}]}]}
    assert logic_symptom_codes(logic) == {"a", "b"}


# ---------------------------------------------------------------------------- thư mục OKF chính thức
def test_official_vault_is_valid():
    v = okf.load_vault(OFFICIAL)
    assert v.errors == []
    assert v.release.label and len(v.conditions) >= 15 and len(v.rules) >= 1 and len(v.symptoms) >= 20
    groups = {c.disease_group for c in v.conditions.values()}
    assert len(groups) >= 3                                  # phạm vi Proposal: 3–4 nhóm bệnh


# ---------------------------------------------------------------------------- lỗi trong thư mục
@pytest.fixture
def vault_copy(tmp_path):
    dst = tmp_path / "knowledge"
    shutil.copytree(OFFICIAL, dst)
    return dst


def _edit(path: Path, old: str, new: str) -> None:
    text_ = path.read_text(encoding="utf-8")
    assert old in text_, f"không thấy '{old}' trong {path.name}"
    path.write_text(text_.replace(old, new, 1), encoding="utf-8")


def _first(dir_: Path, pattern: str) -> Path:
    return sorted(dir_.glob(pattern))[0]


def test_errors_are_reported(vault_copy):
    rule = vault_copy / "rules/red_flags/rf_respiratory_failure.md"
    _edit(rule, "state: PRESENT", "state: MAYBE")
    _edit(rule, "vital: spo2_pct", "vital: spo2")
    cond = _first(vault_copy, "conditions/*/*.md")
    first_symptom = next(line.split(":")[-1].strip() for line in cond.read_text(encoding="utf-8").splitlines()
                         if line.startswith("- symptom_code:"))
    _edit(cond, f"- symptom_code: {first_symptom}", "- symptom_code: khong_co_trong_catalog")
    (vault_copy / "rules/red_flags/rf_respiratory_failure.md").rename(vault_copy / "rules/red_flags/rf_doi_ten.md")
    (vault_copy / "rules/red_flags/la.md").write_text("---\nschema: okf_unknown_v9\n---\n", encoding="utf-8")
    (vault_copy / "exports").mkdir(exist_ok=True)
    (vault_copy / "exports/bao_cao.md").write_text("không có front matter", encoding="utf-8")   # bị bỏ qua

    errors = "\n".join(okf.load_vault(vault_copy).errors)
    assert "state: Chỉ nhận PRESENT hoặc ABSENT" in errors
    assert "vital: Không phải khóa sinh hiệu chuẩn" in errors
    assert "khong_co_trong_catalog: triệu chứng không có trong catalog" in errors
    assert "Tên file phải trùng rule_key" in errors
    assert "schema không hỗ trợ" in errors
    assert "exports" not in errors


def test_rule_prefix_and_source_edition(vault_copy):
    _edit(vault_copy / "rules/red_flags/rf_respiratory_failure.md", "rule_type: RED_FLAG", "rule_type: PRIORITY_FLOOR")
    rule = _first(vault_copy, "rules/priority_floors/*.md")
    _edit(rule, "source_edition: ", "source_edition: Sai ")
    errors = "\n".join(okf.load_vault(vault_copy).errors)
    assert "phải có mã bắt đầu bằng 'pf_'" in errors
    assert "khác edition của nguồn" in errors


# ---------------------------------------------------------------------------- ghi DB (rollback)
@pytest.fixture
def db(users):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _u(db, name):
    return db.scalar(select(User).where(User.username == name))


def _active(db, model):
    return db.scalar(select(func.count()).select_from(model).where(model.status == "Active"))


def _check_integrity(db):
    db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))         # chạy trigger toàn vẹn ngay
    assert db.execute(text("SELECT count(*) FROM v_knowledge_integrity_issues")).scalar() == 0


def test_import_and_activate(db):
    v = okf.load_vault(OFFICIAL)
    before = {m: _active(db, m) for m in (Symptom, Condition, ConditionSymptom, TriageRule)}
    plan = okf.make_plan(db, v)
    rel = okf.apply_plan(db, v, plan, drafter=_u(db, "admin"), approver=_u(db, "bs"))
    _check_integrity(db)
    assert rel.status == "Active" and rel.approved_by == _u(db, "bs").user_id
    assert _active(db, Condition) - before[Condition] == len(v.conditions)
    assert _active(db, TriageRule) - before[TriageRule] == len(v.rules)
    assert _active(db, ConditionSymptom) - before[ConditionSymptom] == sum(len(c.relations) for c in v.conditions.values())

    again = okf.make_plan(db, v)                               # chạy lại: không có gì đổi
    assert again.changes == [] and again.new_sources == []


def test_changed_item_gets_new_version(db, vault_copy):
    first = okf.load_vault(vault_copy)
    okf.apply_plan(db, first, okf.make_plan(db, first), drafter=_u(db, "admin"), approver=_u(db, "bs"))
    _edit(vault_copy / "_release.md", f"label: {first.release.label}", "label: KB-TEST-2")
    rule = vault_copy / "rules/red_flags/rf_respiratory_failure.md"
    _edit(rule, "value: 92", "value: 90")

    second = okf.load_vault(vault_copy)
    plan = okf.make_plan(db, second)
    assert [(c.kind, c.key, c.action) for c in plan.changes] == [("rule", "rf_respiratory_failure", "changed")]
    okf.apply_plan(db, second, plan, drafter=_u(db, "admin"), approver=_u(db, "bs"))
    _check_integrity(db)
    rows = db.execute(select(TriageRule.version, TriageRule.status, TriageRule.retired_reason)
                      .where(TriageRule.rule_key == "rf_respiratory_failure").order_by(TriageRule.version)).all()
    assert [tuple(r) for r in rows][-2:] == [(rows[-2].version, "Retired", "Superseded"),
                                             (rows[-2].version + 1, "Active", None)]


def test_retire_missing(db, vault_copy):
    first = okf.load_vault(vault_copy)
    okf.apply_plan(db, first, okf.make_plan(db, first), drafter=_u(db, "admin"), approver=_u(db, "bs"))
    _edit(vault_copy / "_release.md", f"label: {first.release.label}", "label: KB-TEST-3")
    (vault_copy / "rules/red_flags/rf_seizures.md").unlink()
    second = okf.load_vault(vault_copy)
    plan = okf.make_plan(db, second)
    assert ("rule", "rf_seizures") in plan.missing and plan.changes == []
    okf.apply_plan(db, second, plan, drafter=_u(db, "admin"), approver=_u(db, "bs"), retire_missing=True)
    _check_integrity(db)
    assert db.scalar(select(TriageRule.status).where(TriageRule.rule_key == "rf_seizures",
                                                     TriageRule.status == "Active")) is None


def test_draft_and_guards(db):
    v = okf.load_vault(OFFICIAL)
    plan = okf.make_plan(db, v)
    with pytest.raises(okf.ImportError_, match="khác người soạn"):
        okf.apply_plan(db, v, plan, drafter=_u(db, "bs"), approver=_u(db, "bs"))
    rel = okf.apply_plan(db, v, plan, drafter=_u(db, "admin"), submit=True)
    db.flush()
    assert rel.status == "PendingApproval" and rel.approved_by is None
    assert db.scalar(select(func.count()).select_from(Condition)
                     .where(Condition.release_id == rel.release_id, Condition.status == "PendingApproval")) == len(v.conditions)
    with pytest.raises(okf.ImportError_, match="Đang có bản phát hành mở"):
        okf.apply_plan(db, v, plan, drafter=_u(db, "admin"))


# ---------------------------------------------------------------------------- dòng lệnh
def test_cli_dry_run_and_errors(vault_copy, capsys, users):
    assert okf.main(["--dir", str(OFFICIAL), "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert "--dry-run: không ghi gì." in out or "Không có thay đổi" in out
    _edit(vault_copy / "rules/red_flags/rf_respiratory_failure.md", "state: PRESENT", "state: MAYBE")
    assert okf.main(["--dir", str(vault_copy), "--dry-run"]) == 1
    assert "lỗi, không nạp" in capsys.readouterr().err


def test_cli_rejects_wrong_roles(capsys, users):
    assert okf.main(["--dir", str(OFFICIAL), "--approve-as", "admin"]) == 1
    assert "phải có vai trò Physician" in capsys.readouterr().err
    with SessionLocal() as s:
        assert s.scalar(select(KnowledgeRelease).where(KnowledgeRelease.status.in_(["Draft", "PendingApproval"]))) is None
