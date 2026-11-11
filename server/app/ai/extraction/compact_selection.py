"""Lựa chọn bằng ID ngắn, giải mã về mã catalog trước validation/HITL."""

import json

from app.ai.extraction.phrase_retrieval import RetrievalPlan
from app.ai.extraction.phrase_splitter import IncompleteSegmentation
from app.ai.llm.client import LLMResponseError
from app.ai.llm.prompts import load_prompt

PROMPT_VERSION = "extraction-phrases-compact-v3"


def _group_key(group):
    return (group.phrase.text, group.phrase.context, tuple(candidate.symptom_code for candidate in group.candidates))


def _layout(plan):
    unique = list({_group_key(group): group for group in plan.groups}.values())
    catalogue = {}
    for group in unique:
        for candidate in group.candidates:
            catalogue.setdefault(candidate.symptom_code, (f"c{len(catalogue) + 1}", candidate.symptom_name))
    return unique, catalogue


def selection_request(plan: RetrievalPlan) -> tuple[str, dict]:
    """Giữ toàn bộ cụm/ngữ cảnh; chỉ gửi mỗi câu và định nghĩa một lần."""
    unique, catalogue = _layout(plan)
    if len(unique) > 64:
        raise IncompleteSegmentation("Extraction group count exceeds selection budget.")
    sentences, groups, properties = {}, {}, {}
    for index, group in enumerate(unique, 1):
        sentence_id = sentences.setdefault(group.phrase.context, f"s{len(sentences) + 1}")
        ids = [catalogue[c.symptom_code][0] for c in group.candidates]
        key = f"p{index}"
        groups[key] = {"phrase": group.phrase.text, "sentence": sentence_id, "codes": ids}
        choices = [code + ":" + status for code in ids for status in ("P", "A", "U")]
        properties[key] = {
            "type": "array",
            "maxItems": len(ids),
            "items": {"type": "string", "enum": choices} if choices else {"type": "string"},
        }
    properties["unmapped"] = {
        "type": "array",
        "maxItems": len(groups),
        "items": {"type": "string", "enum": list(groups)},
    }
    schema = {
        "title": "PhraseExtractionOutput",
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }
    payload = {
        "catalogue": {value[0]: value[1] for value in catalogue.values()},
        "sentences": {value: key for key, value in sentences.items()},
        "groups": groups,
    }
    prompt = load_prompt(PROMPT_VERSION) + "\n" + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if len(prompt.encode("utf-8")) + len(json.dumps(schema).encode("utf-8")) > 24000:
        raise IncompleteSegmentation("Extraction request exceeds byte guard.")
    return prompt, schema


def decode_selection(output: object, plan: RetrievalPlan) -> dict:
    """Không nhận ID ngoài cụm, khóa thiếu/thừa, trạng thái sai hoặc chọn trùng."""
    unique, catalogue = _layout(plan)
    keys = [f"p{index}" for index in range(1, len(unique) + 1)]
    if (
        not isinstance(output, dict)
        or set(output) != set(keys) | {"unmapped"}
        or not isinstance(output["unmapped"], list)
        or any(not isinstance(key, str) or key not in keys for key in output["unmapped"])
        or len(set(output["unmapped"])) != len(output["unmapped"])
    ):
        raise LLMResponseError("Invalid compact selection.")
    statuses = {"P": "PRESENT", "A": "ABSENT", "U": "UNKNOWN"}
    decoded_by_group = {}
    for key, group in zip(keys, unique):
        allowed = {
            catalogue[c.symptom_code][0] + ":" + state: {"symptom_code": c.symptom_code, "status": status}
            for c in group.candidates
            for state, status in statuses.items()
        }
        values = output[key]
        if not isinstance(values, list) or any(not isinstance(value, str) or value not in allowed for value in values):
            raise LLMResponseError("Invalid compact selection.")
        rows = [allowed[value] for value in values]
        if len({row["symptom_code"] for row in rows}) != len(rows):
            raise LLMResponseError("Invalid compact selection.")
        decoded_by_group[_group_key(group)] = (rows, key in output["unmapped"])
    decoded = {"unmapped": []}
    for group in plan.groups:
        rows, unmapped = decoded_by_group[_group_key(group)]
        decoded[group.phrase.phrase_id] = rows
        if unmapped:
            decoded["unmapped"].append(group.phrase.phrase_id)
    return decoded
