"""Reader chỉ đọc gắn với một snapshot, không refresh giữa request."""

from copy import deepcopy
from typing import Any


class SnapshotReader:
    def __init__(self, snapshot: Any) -> None:
        # DbKnowledgeReader thay snapshot khi refresh, không sửa snapshot cũ.
        self._snapshot = snapshot

    def active_release(self):
        return deepcopy(self._snapshot.release)

    def active_triage_rules(self):
        return deepcopy(self._snapshot.triage_rules)

    def active_conditions(self):
        return deepcopy(self._snapshot.conditions)

    def active_symptoms(self):
        return deepcopy(self._snapshot.symptoms)
