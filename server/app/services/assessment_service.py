"""Dịch vụ điều phối một lượt đánh giá AI.

Module này là ranh giới giữa ORM/transaction và pipeline thuần AI. Pha 1 luôn
chạy Node 1 đồng bộ; pha 2 chỉ được gọi từ worker. Dữ liệu ghi vào log là
metadata và kết quả cấu trúc đã lọc, không phải hồ sơ bệnh nhân hay prompt.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from time import monotonic
from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.pipeline.graph import ASSESSMENT_TIMEOUT_SECONDS, run_pipeline
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.pipeline.node2_graph_retrieval import run_node2
from app.ai.pipeline.node3_reasoning import REASONING_PROMPT_VERSION as PROMPT_VERSION
from app.exceptions import NotFoundError
from app.models.ai_assessment_log import AiAssessmentLog
from app.models.knowledge_release import KnowledgeRelease
from app.models.patient import Patient
from app.models.triage_rule import TriageRule
from app.models.visit import Visit
from app.models.visit_symptom import VisitSymptom
from app.services import audit_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _age(birth: date, on: date) -> tuple[int, int]:
    months = (on.year - birth.year) * 12 + on.month - birth.month
    if on.day < birth.day:
        months -= 1
    return max(months // 12, 0), max(months, 0)


def _release_id(reader: KnowledgeReader) -> UUID | None:
    value = reader.active_release().get("release_id")
    try:
        return UUID(str(value)) if value is not None else None
    except (TypeError, ValueError, AttributeError):
        return None


def _rule_hits(
    state: Mapping[str, Any],
    rules: list[Mapping[str, Any]] | None = None,
    symptom_map: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Chiếu hit luật về schema bền vững của ``ai_assessment_log``."""
    metadata = {rule.get("rule_key"): rule for rule in (rules or [])}
    hits = []
    for hit in state.get("rule_hits", []):
        rule_key = hit.get("rule_key")
        rule = metadata.get(rule_key, {})
        inferred_type = (
            "RED_FLAG" if isinstance(rule_key, str) and rule_key.startswith("rf_")
            else "PRIORITY_FLOOR" if isinstance(rule_key, str) and rule_key.startswith("pf_")
            else None
        )
        rule_type = hit.get("rule_type", rule.get("rule_type", inferred_type))
        inferred_priority = {
            "RED_FLAG": "Emergency",
            "PRIORITY_FLOOR": "HighPriority",
        }.get(rule_type)
        hits.append({
            "rule_key": rule_key,
            "version": hit.get("version"),
            "rule_type": rule_type,
            "resulting_priority": hit.get(
                "resulting_priority", rule.get("resulting_priority", inferred_priority)
            ),
            "reason_text": hit.get("reason_text", hit.get("reason", "")),
        })
    names = symptom_map or {}
    complete_now = []
    for item in state.get("complete_now", []):
        code = item.removeprefix("symptoms.") if isinstance(item, str) else str(item)
        complete_now.append({"symptom_code": code, "symptom_name": names.get(code, code)})
    return {"hits": hits, "complete_now": complete_now}


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
        "explanation": candidate.get("explanation", candidate.get("reason")),
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


def _features(db: Session, visit: Visit, patient: Patient) -> dict[str, Any]:
    symptoms = db.scalars(
        select(VisitSymptom).where(VisitSymptom.visit_id == visit.visit_id)
    ).all()
    age_years, age_months = _age(patient.date_of_birth, visit.visit_date.date())
    return {
        "symptoms": {item.symptom_code: item.state for item in symptoms},
        "vital_signs": dict(visit.vital_signs or {}),
        "age_years": age_years,
        "age_months": age_months,
    }


def _audit(db: Session, log: AiAssessmentLog, visit: Visit, actor_id: UUID | None) -> None:
    if actor_id is None:
        return
    audit_service.record(
        db,
        action="AI_ASSESSMENT",
        entity="visit",
        entity_id=visit.visit_id,
        actor_id=actor_id,
        new_values={
            "assessment_id": log.assessment_id,
            "ai_status": visit.ai_status,
            "status": log.status,
            "mode": log.mode,
            "priority_rule": log.priority_rule,
            "priority_final": log.priority_final,
            "validation_result": log.validation_result,
        },
    )


def trigger_assessment(
    db: Session,
    visit_id: UUID,
    knowledge_reader: KnowledgeReader,
    *,
    triggered_by: UUID | None = None,
) -> AiAssessmentLog:
    """Chạy Node 1 và tạo log ``Skipped`` hoặc ``Queued`` trong transaction hiện tại."""
    started = monotonic()
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    patient = db.get(Patient, visit.patient_id)
    if patient is None:
        raise NotFoundError("Không tìm thấy bệnh nhân")
    features = _features(db, visit, patient)
    state = run_node1({"input_features": features}, knowledge_reader)
    active_rules = list(knowledge_reader.active_triage_rules())
    symptom_map = _symptom_map(knowledge_reader)
    hits = _rule_hits(state, active_rules, symptom_map)
    red_rule_id = None
    if state["is_red_flag"]:
        key = next((h.get("rule_key") for h in state["rule_hits"]), None)
        rule = next((r for r in active_rules if r.get("rule_key") == key), None)
        red_rule_id = rule.get("triage_rule_id") if rule else None
        if red_rule_id is None:
            red_rule_id = db.scalar(
                select(TriageRule.triage_rule_id).where(
                    TriageRule.rule_key == key,
                    TriageRule.rule_type == "RED_FLAG",
                    TriageRule.status == "Active",
                )
            )
        try:
            red_rule_id = UUID(str(red_rule_id)) if red_rule_id else None
        except (TypeError, ValueError):
            red_rule_id = None
        if red_rule_id is None:
            raise ValueError("Không tìm thấy triage rule ID cho RED_FLAG")
        visit.triage_priority_rule = "Emergency"
        visit.triage_priority = "Emergency"
        visit.priority_raised_by_ai = False
        visit.is_red_flag = True
        visit.red_flag_rule_id = red_rule_id
        visit.red_flag_reason = next((h.get("reason") for h in state["rule_hits"]), "")
        visit.ai_status = "Skipped"
        status, mode, completed = "Skipped", "RuleOnly", _now()
    else:
        visit.triage_priority_rule = state["priority_rule"]
        visit.triage_priority = state["priority_rule"]
        visit.priority_raised_by_ai = False
        visit.is_red_flag = False
        visit.red_flag_rule_id = None
        visit.red_flag_reason = None
        visit.ai_status = "Pending"
        status, mode, completed = "Queued", None, None
    log = AiAssessmentLog(
        visit_id=visit.visit_id,
        run_type="Assessment",
        triggered_by=triggered_by,
        status=status,
        mode=mode,
        input_features=None,
        rule_hits=hits,
        priority_rule=state["priority_rule"],
        priority_final=state["priority_final"],
        candidates=[],
        knowledge_release_id=_release_id(knowledge_reader),
        latency_phase1_ms=round((monotonic() - started) * 1000),
        latency_total_ms=round((monotonic() - started) * 1000) if completed else None,
        completed_at=completed,
    )
    db.add(log)
    db.flush()
    _audit(db, log, visit, triggered_by)
    return log


async def execute_queued_assessment(
    db: Session,
    assessment_id: UUID,
    knowledge_reader: KnowledgeReader,
    llm_client: LLMClient,
    *,
    actor_id: UUID | None = None,
    model_name: str | None = None,
    model_version: str | None = None,
) -> AiAssessmentLog:
    """Thực thi một log đã claim; worker sở hữu transaction bao ngoài."""
    log = db.get(AiAssessmentLog, assessment_id)
    if log is None:
        raise ValueError("Assessment không tồn tại")
    visit = db.get(Visit, log.visit_id)
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    patient = db.get(Patient, visit.patient_id)
    if patient is None:
        raise NotFoundError("Không tìm thấy bệnh nhân")
    if log.status != "Running":
        raise ValueError("Assessment chưa ở trạng thái Running")
    queued_at = log.queued_at or _now()
    remaining = max(0.0, ASSESSMENT_TIMEOUT_SECONDS - (_now() - queued_at).total_seconds())
    state = {"input_features": _features(db, visit, patient)}
    symptom_map = _symptom_map(knowledge_reader)

    async def preliminary(snapshot: Mapping[str, Any]) -> None:
        log.candidates = _candidates(snapshot, symptom_map)
        visit.ai_status = "Preliminary"
        db.flush()
        _audit(db, log, visit, actor_id or log.triggered_by)
        db.commit()

    llm_started = monotonic()
    result = await run_pipeline(
        state, knowledge_reader, llm_client, db,
        timeout_seconds=remaining, on_preliminary=preliminary,
    )
    log.latency_llm_ms = round((monotonic() - llm_started) * 1000)
    status = result.get("ai_status", "Degraded")
    log.status = status
    log.mode = result.get("mode", "RuleOnly")
    log.priority_final = result.get("priority_final", log.priority_rule)
    log.rule_hits = _rule_hits(
        result, list(knowledge_reader.active_triage_rules()), symptom_map
    )
    log.candidates = _candidates(result, symptom_map)
    log.validation_result = result.get("validation_result")
    log.prompt_version = PROMPT_VERSION
    log.model_name = model_name or getattr(llm_client, "model_name", None) or getattr(
        llm_client, "model", None
    )
    log.model_version = model_version or getattr(llm_client, "model_version", None) or getattr(
        llm_client, "version", None
    )
    log.completed_at = _now()
    log.latency_total_ms = round((_now() - queued_at).total_seconds() * 1000)
    visit.ai_status = {"Completed": "Ready", "Degraded": "Degraded", "Skipped": "Skipped"}.get(status, "Failed")
    if log.priority_rule == "Routine" and log.priority_final == "HighPriority" and status == "Completed":
        visit.triage_priority = "HighPriority"
        visit.priority_raised_by_ai = True
    _audit(db, log, visit, actor_id or log.triggered_by)
    db.flush()
    return log


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
    hits = rule_data.get("hits", rule_data) if isinstance(rule_data, dict) else []
    complete_now = rule_data.get("complete_now", []) if isinstance(rule_data, dict) else []
    return {
        "assessment_id": log.assessment_id,
        "ai_status": visit.ai_status,
        "mode": log.mode,
        "knowledge_release": release_label or (
            str(log.knowledge_release_id) if log.knowledge_release_id else None
        ),
        "model_version": log.model_version,
        "prompt_version": log.prompt_version,
        "priority": {"rule": log.priority_rule, "final": log.priority_final, "raised_by_ai": visit.priority_raised_by_ai},
        "alerts": [{"rule_key": h.get("rule_key"), "rule_type": h.get("rule_type"), "reason_text": h.get("reason_text", h.get("reason", ""))} for h in hits],
        "complete_now": complete_now,
        "candidates": log.candidates or [],
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
    if db is None:
        class _DB:
            pass
        db = _DB()  # type: ignore[assignment]
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
    return asyncio.run(run_pipeline(state, knowledge_reader, llm_client, db, timeout_seconds=ASSESSMENT_TIMEOUT_SECONDS))  # type: ignore[arg-type]
