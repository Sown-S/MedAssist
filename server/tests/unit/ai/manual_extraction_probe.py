"""Probe extraction thủ công, dùng ca tổng hợp riêng, không dùng testset frozen.

Chạy trong môi trường worker: python -m tests.unit.ai.manual_extraction_probe
Cần Ollama và DB; chỉ SELECT tri thức, không đọc/ghi hồ sơ bệnh nhân.
Không log prompt hay output thô. Số đo không chứng nhận chất lượng lâm sàng.
"""

import argparse
import asyncio
import hashlib
import json
from time import monotonic

from sqlalchemy import text as sql_text
from pydantic import ValidationError

from app.ai.extraction import feature_extractor as extractor
from app.ai.llm.client import LLMClient, LLMError
from app.ai.llm.output_schemas import ExtractionOutput


CASES = (
    ("respiratory", "Ho khan từng cơn, khó thở khi đi nhanh, thở khò khè.", {
        "cough_dry": "PRESENT", "dyspnea_chronic_exertional": "PRESENT",
        "wheezing_bronchospasm": "PRESENT"}),
    ("negated", "Không ho khan, không thở khò khè, không khó thở khi đi nhanh.", {
        "cough_dry": "ABSENT", "dyspnea_chronic_exertional": "ABSENT",
        "wheezing_bronchospasm": "ABSENT"}),
    ("unaccented", "Ho khan tung con, kho tho khi di nhanh, tho kho khe.", {
        "cough_dry": "PRESENT", "dyspnea_chronic_exertional": "PRESENT",
        "wheezing_bronchospasm": "PRESENT"}),
    ("mixed", "Có ho khan. Không thở khò khè. Chưa rõ có khó thở khi đi nhanh hay không.", {
        "cough_dry": "PRESENT", "wheezing_bronchospasm": "ABSENT",
        "dyspnea_chronic_exertional": "UNKNOWN"}),
    ("negated_unaccented", "Khong ho khan, khong tho kho khe.", {
        "cough_dry": "ABSENT", "wheezing_bronchospasm": "ABSENT"}),
    ("no_symptoms", "Đến khám định kỳ, chưa cung cấp triệu chứng.", {}),
    ("headache", "Đau nhức đầu âm ỉ. Không chóng mặt xoay tròn.", {
        "headache_dull": "PRESENT", "dizziness_vertigo": "ABSENT"}),
    ("headache_unaccented", "Dau nhuc dau am i. Khong chong mat xoay tron.", {
        "headache_dull": "PRESENT", "dizziness_vertigo": "ABSENT"}),
    ("uncertain", "Chưa rõ có ho khan hay không.", {"cough_dry": "UNKNOWN"}),
    ("outside_catalogue", "Móng tay được sơn màu xanh.", {}),
)


class ProbeClient:
    def __init__(self, client):
        self.client = client
        self.calls = 0
        self.completed = False
        self.error_type = None
        self.valid_output = False
        self.metrics = {}
        generate = client._ollama.generate

        async def measured_generate(**kwargs):
            raw = await generate(**kwargs)
            envelope = json.loads(raw)
            self.metrics = {key: envelope.get(key) for key in
                            ("prompt_eval_count", "eval_count", "done_reason")}
            return raw

        client._ollama.generate = measured_generate

    async def generate_json(self, **kwargs):
        self.calls += 1
        try:
            result = await self.client.generate_json(**kwargs)
        except (LLMError, TimeoutError) as exc:
            self.error_type = type(exc).__name__
            raise
        self.completed = True
        payload = json.loads(kwargs["prompt"].split("\n")[-1])
        catalogue = payload["catalogue"]
        allowed = set(catalogue) if isinstance(catalogue, dict) else {r["symptom_code"] for r in catalogue}
        self.valid_output = valid_response(result, allowed)
        return result


def valid_response(result, allowed):
    try:
        parsed = ExtractionOutput.model_validate(result, strict=True)
    except ValidationError:
        return False
    states = {}
    for row in parsed.symptoms:
        if row.symptom_code not in allowed or (
            row.symptom_code in states and states[row.symptom_code] != row.status
        ):
            return False
        states[row.symptom_code] = row.status
    return True


def compare_result(actual, expected, *, completed):
    """Không tính timeout/kết nối lỗi trả [] là đúng đối với ca kỳ vọng rỗng."""
    return {"missing_or_wrong": sorted(k for k, v in expected.items() if actual.get(k) != v),
            "unexpected": sorted(set(actual) - set(expected)),
            "exact_match": completed and actual == expected}


async def main(cases=None, repeat=1):
    from app.core.config import settings
    from app.core.database import SessionLocal
    from app.services.knowledge_reader import DbKnowledgeReader

    reader = DbKnowledgeReader()
    reader.refresh()
    rows = extractor._catalogue(reader)
    active_codes = {row["symptom_code"] for row in rows}
    prompt = extractor.load_prompt(extractor.EXTRACTION_PROMPT_VERSION)
    print(json.dumps({"prompt_version": extractor.EXTRACTION_PROMPT_VERSION,
                      "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
                      "catalogue_count": len(rows), "model": settings.OLLAMA_MODEL,
                      "knowledge_release": reader.active_release().get("label")}, ensure_ascii=False), flush=True)
    for iteration in range(1, repeat + 1):
        for case_id, note, expected in CASES:
            if cases and case_id not in cases:
                continue
            if set(expected) - active_codes:
                raise RuntimeError("Probe expected codes are not in the Active catalogue")
            sent = extractor._select_prompt_catalogue(rows, note)
            sent_codes = {r["symptom_code"] for r in sent}
            client = ProbeClient(LLMClient(model=settings.OLLAMA_MODEL, base_url=settings.OLLAMA_BASE_URL))
            started = monotonic()
            with SessionLocal() as db:
                db.execute(sql_text("SET TRANSACTION READ ONLY"))
                result = await extractor.extract_symptoms(
                    note, reader, client, db, identifiers=[], timeout_seconds=30,
                    gate_state={"is_red_flag": False, "priority_rule": "Routine",
                                "priority_final": "Routine"},
                )
                db.rollback()
            actual = {r["symptom_code"]: r["status"] for r in result}
            elapsed = monotonic() - started
            print(json.dumps({"case": case_id, "iteration": iteration,
                              "seconds": round(elapsed, 2),
                              "calls": client.calls, "sent_count": len(sent),
                              "prefilter_missing": sorted(set(expected) - sent_codes),
                              "actual_statuses": actual, "metrics": client.metrics,
                              "completed": client.completed, "error_type": client.error_type,
                              "valid_output": client.valid_output,
                              **compare_result(actual, expected, completed=(client.completed
                                               and client.valid_output and elapsed < 30))},
                             ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", action="append", choices=[row[0] for row in CASES])
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()
    if args.repeat < 1:
        parser.error("--repeat must be positive")
    asyncio.run(main(args.case, args.repeat))
