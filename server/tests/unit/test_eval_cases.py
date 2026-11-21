"""server/data/eval_cases.jsonl (ca mẫu của seed_eval) chỉ dùng mã có trong kho tri thức hiện tại."""

import json
from pathlib import Path

from scripts import import_okf as okf

CASES = Path(__file__).resolve().parents[2] / "data" / "eval_cases.jsonl"


def test_eval_cases_use_current_knowledge_codes():
    vault = okf.load_vault(okf.DEFAULT_DIR)
    cases = [json.loads(line) for line in CASES.read_text(encoding="utf-8").splitlines() if line.strip()]
    bad_conditions = [
        c["case_id"] for c in cases if c.get("condition_code") and c["condition_code"] not in vault.conditions
    ]
    bad_symptoms = [(c["case_id"], s) for c in cases for s in c["symptoms"] if s not in vault.symptoms]
    assert bad_conditions == [] and bad_symptoms == []
