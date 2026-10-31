"""Dựng payload polling đánh giá AI và chạy pipeline offline cho bộ đánh giá đóng băng."""

from __future__ import annotations

import asyncio
import re
from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.pipeline.graph import ASSESSMENT_TIMEOUT_SECONDS, run_pipeline
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.pipeline.node2_graph_retrieval import run_node2
from app.exceptions import NotFoundError
from app.models.ai_assessment_log import AiAssessmentLog
from app.models.knowledge_release import KnowledgeRelease
from app.models.visit import Visit

_LEADING_SYMPTOM_TAG_RE = re.compile(r"^\s*\[([a-z0-9]+(?:_[a-z0-9]+)*)\]\s*")
_INLINE_SYMPTOM_TAG_RE = re.compile(r"\[([a-z0-9]+(?:_[a-z0-9]+)*)\]")


def _clean_explanation(
    raw: Any, symptom_map: Mapping[str, str] | None = None
) -> str | None:
    """Loại bỏ thẻ [symptom_code] kỹ thuật ở đầu câu giải thích và đổi thẻ nội tuyến sang tên tiếng Việt."""
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return text
    names = symptom_map or {}
    stripped = _LEADING_SYMPTOM_TAG_RE.sub("", text, count=1).strip()
    if stripped:
        text = stripped
    if names:
        text = _INLINE_SYMPTOM_TAG_RE.sub(
            lambda m: names.get(m.group(1), m.group(1)), text
        )
    return text


def _candidate(
    candidate: Mapping[str, Any], rank: int, symptom_map: Mapping[str, str] | None = None
) -> dict[str, Any]:
    """Chỉ giữ projection an toàn của một ứng viên để lưu/polling."""
    supporting = candidate.get("supporting", candidate.get("supporting_evidence", []))
    contradicting = candidate.get("contradicting", candidate.get("contradicting_evidence", []))
    missing = candidate.get("missing", candidate.get("unknown_key_symptoms", []))
    names = symptom_map or {}

    def evidence(rows: Any) -> list[dict[str, Any]]:
        return [
            {
                "symptom_code": row.get("symptom_code"),
                "symptom_name": names.get(row.get("symptom_code"), row.get("symptom_code")),
                "weight": row.get("weight"),
                "is_key": row.get("is_key", False),
            }
            for row in (rows or [])
            if isinstance(row, Mapping)
        ]

    def missing_items(rows: Any) -> list[dict[str, str]]:
        result = []
        for row in rows or []:
            code = row.get("symptom_code") if isinstance(row, Mapping) else row
            if isinstance(code, str):
                result.append({"symptom_code": code, "symptom_name": names.get(code, code)})
        return result

    return {
        "rank": rank,
        "condition_code": candidate.get("condition_code"),
        "name_vi": candidate.get("name_vi"),
        "icd10_code": candidate.get("icd10_code"),
        "score": candidate.get("score"),
        "supporting": evidence(supporting),
        "contradicting": evidence(contradicting),
        "missing": missing_items(missing if isinstance(missing, list) else [missing]),
        "explanation": _clean_explanation(
            candidate.get("explanation", candidate.get("reason")), names
        ),
        "label": "Reference Suggestion",
    }


def _candidates(
    state: Mapping[str, Any], symptom_map: Mapping[str, str] | None = None
) -> list[dict[str, Any]]:
    return [
        _candidate(item, index, symptom_map)
        for index, item in enumerate(state.get("candidates", [])[:3], 1)
    ]


def _symptom_map(reader: KnowledgeReader) -> dict[str, str]:
    result = {}
    for symptom in reader.active_symptoms():
        code = symptom.get("symptom_code")
        name = symptom.get("symptom_name", symptom.get("name_vi", code))
        if isinstance(code, str):
            result[code] = name if isinstance(name, str) else code
    return result


def get_latest_assessment(
    db: Session, visit_id: UUID, knowledge_reader: KnowledgeReader | None = None
) -> dict[str, Any] | None:
    """Dựng payload polling từ Visit và lượt Assessment mới nhất."""
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    log = db.scalars(
        select(AiAssessmentLog)
        .where(AiAssessmentLog.visit_id == visit_id, AiAssessmentLog.run_type == "Assessment")
        .order_by(AiAssessmentLog.queued_at.desc())
    ).first()
    if log is None:
        return None
    release_label = None
    if knowledge_reader is not None:
        release_label = knowledge_reader.active_release().get("label")
    if not release_label and log.knowledge_release_id:
        release_label = db.scalar(
            select(KnowledgeRelease.label).where(
                KnowledgeRelease.release_id == log.knowledge_release_id
            )
        )
    rule_data = log.rule_hits or {}
    if isinstance(rule_data, dict):
        hits = rule_data.get("hits", [])
        complete_now = rule_data.get("complete_now", [])
    elif isinstance(rule_data, list):
        hits = rule_data
        complete_now = []
    else:
        hits = []
        complete_now = []

    alerts = []
    for hit in hits:
        if not isinstance(hit, Mapping):
            continue
        rule_key = hit.get("rule_key")
        rule_type = hit.get("rule_type")
        if rule_type is None and isinstance(rule_key, str):
            if rule_key.startswith("rf_"):
                rule_type = "RED_FLAG"
            elif rule_key.startswith("pf_"):
                rule_type = "PRIORITY_FLOOR"
        if rule_type not in ("RED_FLAG", "PRIORITY_FLOOR"):
            continue
        alerts.append({
            "rule_key": rule_key,
            "rule_type": rule_type,
            "reason_text": hit.get("reason_text") or hit.get("reason") or "",
        })

    candidates = log.candidates if isinstance(log.candidates, list) else []
    symptom_map = _symptom_map(knowledge_reader) if knowledge_reader is not None else {}
    if any(
        not isinstance(candidate, Mapping)
        or "rank" not in candidate
        or "supporting" not in candidate
        for candidate in candidates
    ):
        candidates = _candidates({"candidates": candidates}, symptom_map)
    else:
        candidates = [
            {
                **candidate,
                "explanation": _clean_explanation(
                    candidate.get("explanation", candidate.get("reason")),
                    symptom_map,
                ),
            }
            for candidate in candidates
        ]
    return {
        "assessment_id": log.assessment_id,
        "ai_status": visit.ai_status,
        "mode": log.mode,
        "knowledge_release": release_label or (
            str(log.knowledge_release_id) if log.knowledge_release_id else None
        ),
        "model_version": log.model_version or getattr(log, "model_name", None),
        "prompt_version": log.prompt_version,
        "priority": {"rule": log.priority_rule, "final": log.priority_final, "raised_by_ai": visit.priority_raised_by_ai},
        "alerts": alerts,
        "complete_now": complete_now,
        "candidates": candidates,
    }


def evaluate_case_offline(
    case: Mapping[str, Any],
    knowledge_reader: KnowledgeReader,
    *,
    mode: str = "Full",
    llm_client: LLMClient | None = None,
    db: Session | None = None,
) -> dict[str, Any]:
    """Chạy pipeline không qua HTTP cho bộ đánh giá đóng băng."""
    if mode not in ("RuleOnly", "Full"):
        raise ValueError("mode phải là RuleOnly hoặc Full")
    if mode == "Full" and llm_client is None:
        raise ValueError("Full cần llm_client")
    state = {"input_features": dict(case.get("input_features", case))}
    if mode == "RuleOnly":
        result = run_node1(state, knowledge_reader)
        if result["is_red_flag"]:
            result["mode"] = "RuleOnly"
            return result
        result = run_node2(result, knowledge_reader)
        result["candidates"] = result.get("candidates", [])[:3]
        result.update(ai_status="Degraded", mode="RuleOnly")
        return result
    if db is not None:
        return asyncio.run(
            run_pipeline(
                state,
                knowledge_reader,
                llm_client,
                db,
                timeout_seconds=ASSESSMENT_TIMEOUT_SECONDS,
            )
        )
    from app.core.database import SessionLocal

    bind = getattr(knowledge_reader, "_bind", None)
    session_ctx = Session(bind) if bind is not None else SessionLocal()
    with session_ctx as real_db:
        try:
            return asyncio.run(
                run_pipeline(
                    state,
                    knowledge_reader,
                    llm_client,
                    real_db,
                    timeout_seconds=ASSESSMENT_TIMEOUT_SECONDS,
                )
            )
        finally:
            real_db.rollback()
