"""Knowledge Reader đọc tập tri thức Active từ PostgreSQL (cài đặt ``app.ai.interfaces.KnowledgeReader``).

ERD v1.8 mục KNOWLEDGE_EPOCH: đọc ``epoch`` cùng TOÀN BỘ dòng Active trong một snapshot
(REPEATABLE READ), cache theo epoch. Đầu mỗi lần đánh giá chỉ cần một câu ``SELECT epoch``; khác
epoch đã cache thì nạp lại. Epoch đã commit luôn khớp dữ liệu đã commit, nên cách này đúng cho
mọi tiến trình (api, worker) mà không cần tín hiệu invalidate — tắt khẩn cấp có hiệu lực ngay ở
lần đánh giá kế tiếp của worker.

Dữ liệu trả về là dict/list thuần (deep copy mỗi lần gọi), không phải model SQLAlchemy, đúng hợp
đồng mà pipeline của Huy dùng. Mapping chốt ngày 18/10 (card worker AI).
"""
import threading
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Engine, select

from app.core.database import engine as default_engine
from app.models import (Condition, ConditionSymptom, GuidelineExcerpt, KnowledgeEpoch, KnowledgeRelease,
                        KnowledgeSource, Symptom, TriageRule)


@dataclass(frozen=True)
class KnowledgeSnapshot:
    epoch: int
    release: dict[str, Any]
    triage_rules: list[dict[str, Any]]
    conditions: list[dict[str, Any]]
    symptoms: list[dict[str, Any]]


def _float(value) -> float:
    return float(value) if value is not None else 0.0


def load_snapshot(bind: Engine) -> KnowledgeSnapshot:
    """Đọc epoch + toàn bộ dòng Active trong MỘT transaction REPEATABLE READ, chỉ đọc."""
    with bind.connect().execution_options(isolation_level="REPEATABLE READ") as conn:
        with conn.begin():
            epoch = conn.execute(select(KnowledgeEpoch.epoch)).scalar_one_or_none() or 0

            rel = conn.execute(
                select(KnowledgeRelease.release_id, KnowledgeRelease.label, KnowledgeRelease.approved_at)
                .where(KnowledgeRelease.status == "Active")
                .order_by(KnowledgeRelease.approved_at.desc().nulls_last()).limit(1)).first()
            release = {"release_id": str(rel.release_id) if rel else None,
                       "label": rel.label if rel else None,
                       "approved_at": rel.approved_at.isoformat() if rel and rel.approved_at else None,
                       "epoch": int(epoch)}

            symptoms = [{"symptom_code": r.symptom_code, "symptom_name": r.symptom_name, "category": r.category}
                        for r in conn.execute(select(Symptom.symptom_code, Symptom.symptom_name, Symptom.category)
                                              .where(Symptom.status == "Active")
                                              .order_by(Symptom.symptom_code))]

            rules = [{"triage_rule_id": str(r.triage_rule_id), "rule_key": r.rule_key, "version": r.version,
                      "rule_type": r.rule_type, "resulting_priority": r.resulting_priority,
                      "reason_text": r.reason_text, "condition_logic": r.condition_logic}
                     for r in conn.execute(
                         select(TriageRule.triage_rule_id, TriageRule.rule_key, TriageRule.version,
                                TriageRule.rule_type, TriageRule.resulting_priority, TriageRule.reason_text,
                                TriageRule.condition_logic)
                         .where(TriageRule.status == "Active").order_by(TriageRule.rule_key))]

            relations: dict[str, list[dict[str, Any]]] = {}
            for r in conn.execute(select(ConditionSymptom.condition_code, ConditionSymptom.symptom_code,
                                         ConditionSymptom.polarity, ConditionSymptom.weight,
                                         ConditionSymptom.is_key)
                                  .where(ConditionSymptom.status == "Active")
                                  .order_by(ConditionSymptom.condition_code, ConditionSymptom.symptom_code)):
                relations.setdefault(r.condition_code, []).append(
                    {"symptom_code": r.symptom_code, "polarity": r.polarity, "weight": _float(r.weight),
                     "is_key": bool(r.is_key)})

            guidelines: dict[str, list[dict[str, Any]]] = {}
            for r in conn.execute(select(GuidelineExcerpt.condition_code, GuidelineExcerpt.excerpt_key,
                                         GuidelineExcerpt.title, GuidelineExcerpt.content,
                                         GuidelineExcerpt.source_locator, KnowledgeSource.title.label("source_title"))
                                  .join(KnowledgeSource, KnowledgeSource.source_id == GuidelineExcerpt.source_id)
                                  .where(GuidelineExcerpt.status == "Active")
                                  .order_by(GuidelineExcerpt.condition_code, GuidelineExcerpt.excerpt_key)):
                guidelines.setdefault(r.condition_code, []).append(
                    {"excerpt_key": r.excerpt_key, "title": r.title, "content": r.content,
                     "source_title": r.source_title, "source_locator": r.source_locator})

            conditions = [{"condition_code": r.condition_code, "name_vi": r.name_vi, "icd10_code": r.icd10_code,
                           "disease_group": r.disease_group,
                           "symptoms": relations.get(r.condition_code, []),
                           "guidelines": guidelines.get(r.condition_code, [])}
                          for r in conn.execute(select(Condition.condition_code, Condition.name_vi,
                                                       Condition.icd10_code, Condition.disease_group)
                                                .where(Condition.status == "Active")
                                                .order_by(Condition.condition_code))]
    return KnowledgeSnapshot(int(epoch), release, rules, conditions, symptoms)


class DbKnowledgeReader:
    """Reader dùng chung trong một tiến trình. Gọi ``refresh()`` ở đầu mỗi lần đánh giá để bảo đảm
    cả lần chạy dùng MỘT snapshot nhất quán (các hàm active_* không tự nạp lại giữa chừng)."""

    def __init__(self, bind: Engine | None = None) -> None:
        self._bind = bind or default_engine
        self._lock = threading.Lock()
        self._snapshot: KnowledgeSnapshot | None = None

    def current_epoch(self) -> int:
        with self._bind.connect() as conn:
            return int(conn.execute(select(KnowledgeEpoch.epoch)).scalar_one_or_none() or 0)

    def refresh(self) -> KnowledgeSnapshot:
        """Nạp lại nếu epoch trong DB khác epoch đang cache. Trả snapshot dùng cho lần chạy này."""
        epoch = self.current_epoch()
        with self._lock:
            if self._snapshot is None or self._snapshot.epoch != epoch:
                self._snapshot = load_snapshot(self._bind)
            return self._snapshot

    def _snap(self) -> KnowledgeSnapshot:
        return self._snapshot if self._snapshot is not None else self.refresh()

    # ---- interface KnowledgeReader -------------------------------------------------------
    def active_release(self) -> dict[str, Any]:
        return deepcopy(self._snap().release)

    def active_triage_rules(self) -> list[dict[str, Any]]:
        return deepcopy(self._snap().triage_rules)

    def active_conditions(self) -> list[dict[str, Any]]:
        return deepcopy(self._snap().conditions)

    def active_symptoms(self) -> list[dict[str, Any]]:
        return deepcopy(self._snap().symptoms)
