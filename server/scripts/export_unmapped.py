"""Xuất các cụm lời kể trích xuất không khớp triệu chứng nào, để soạn từ đồng nghĩa (aliases) cho catalog.
Cụm đã che định danh từ lúc trích xuất; file chỉ có cụm và số lần gặp, không kèm lượt khám hay bệnh nhân.
Cách chạy (thư mục server/): python -m scripts.export_unmapped --since 2026-11-20 --out unmapped.csv
"""

import argparse
import csv
import datetime
import sys
from collections import Counter
from pathlib import Path

from sqlalchemy import Date, cast, select

from app.core.database import SessionLocal
from app.models import AiAssessmentLog
from app.models.user import SYSTEM_USER_ID
from app.services import audit_service as audit


def collect(db, since: datetime.date, until: datetime.date | None) -> Counter:
    day = cast(AiAssessmentLog.queued_at, Date)  # ngày theo giờ CSDL, như báo cáo
    stmt = select(AiAssessmentLog.validation_result).where(AiAssessmentLog.run_type == "Extraction", day >= since)
    if until is not None:
        stmt = stmt.where(day <= until)
    counts: Counter = Counter()
    for result in db.scalars(stmt):
        phrases = result.get("unmapped_phrases") if isinstance(result, dict) else None
        for phrase in phrases or []:
            if isinstance(phrase, str) and phrase.strip():
                counts[" ".join(phrase.lower().split())] += 1
    return counts


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Xuất cụm lời kể không khớp triệu chứng (phrase, count)")
    p.add_argument("--since", type=datetime.date.fromisoformat, required=True, help="Từ ngày (YYYY-MM-DD)")
    p.add_argument("--until", type=datetime.date.fromisoformat, help="Đến ngày, tính cả ngày đó")
    p.add_argument("--min-count", type=int, default=1, help="Chỉ xuất cụm gặp ít nhất N lần")
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args(argv)

    with SessionLocal() as db:
        counts = collect(db, args.since, args.until)
        rows = sorted((c, phrase) for phrase, c in counts.items() if c >= args.min_count)
        rows.sort(key=lambda r: (-r[0], r[1]))
        audit.record(
            db,
            action="EXPORT",
            entity="ai_assessment_log",
            actor_id=SYSTEM_USER_ID,
            new_values={
                "source": "scripts.export_unmapped",
                "since": args.since.isoformat(),
                "until": args.until.isoformat() if args.until else None,
                "phrases": len(rows),
            },
        )
        db.commit()

    with args.out.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["phrase", "count"])
        writer.writerows((phrase, c) for c, phrase in rows)
    print(f"Đã xuất {len(rows)} cụm vào {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
