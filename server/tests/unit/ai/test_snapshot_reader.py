"""Request đang chạy không đổi tri thức khi request khác refresh cache."""

from types import SimpleNamespace

import pytest

from app.routers import assessment_router


def test_requests_pin_separate_epochs_and_reuse_reader(monkeypatch):
    source = {"epoch": 1, "init": 0}

    class Reader:
        def __init__(self, bind):
            source["init"] += 1
            self.snapshot = None

        def refresh(self):
            epoch = source["epoch"]
            if self.snapshot is None or self.snapshot.release["epoch"] != epoch:
                self.snapshot = SimpleNamespace(
                    release={"epoch": epoch}, triage_rules=[{"epoch": epoch}],
                    conditions=[{"epoch": epoch}], symptoms=[{"epoch": epoch}],
                )
            return self.snapshot

    monkeypatch.setattr(assessment_router, "_reader_cache", {})
    monkeypatch.setattr(assessment_router, "import_module", lambda _: SimpleNamespace(DbKnowledgeReader=Reader))
    bind = object()
    db = SimpleNamespace(get_bind=lambda: bind)
    first = assessment_router.get_knowledge_reader(db)
    assert first.active_triage_rules() == [{"epoch": 1}]
    source["epoch"] = 2
    second = assessment_router.get_knowledge_reader(db)
    third = assessment_router.get_knowledge_reader(db)
    assert source["init"] == 1
    for method in ("active_release", "active_triage_rules", "active_conditions", "active_symptoms"):
        expected_old = {"epoch": 1} if method == "active_release" else [{"epoch": 1}]
        expected_new = {"epoch": 2} if method == "active_release" else [{"epoch": 2}]
        assert getattr(first, method)() == expected_old
        assert getattr(second, method)() == getattr(third, method)() == expected_new


@pytest.mark.parametrize("method,field", [
    ("active_release", "release"), ("active_triage_rules", "triage_rules"),
    ("active_conditions", "conditions"), ("active_symptoms", "symptoms"),
])
def test_returned_data_cannot_mutate_snapshot(method, field):
    from app.ai.snapshot_reader import SnapshotReader

    value = {"nested": [1]}
    snapshot = SimpleNamespace(**{field: value})
    reader = SnapshotReader(snapshot)
    getattr(reader, method)()["nested"].append(2)
    assert getattr(reader, method)() == {"nested": [1]}
