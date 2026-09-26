from __future__ import annotations

import random
import uuid

from sqlalchemy.orm import Session

from app.assignment import eligible_submissions
from app.judging_math import bradley_terry
from app.models import PairwiseComparison, PairwiseRun


def next_pair(
    db: Session, event_id: uuid.UUID, judge_id: uuid.UUID
) -> tuple[uuid.UUID, uuid.UUID] | None:
    projects = [s.id for s in eligible_submissions(db, event_id)]
    if len(projects) < 2:
        return None
    history = (
        db.query(PairwiseComparison)
        .filter(PairwiseComparison.event_id == event_id, PairwiseComparison.judge_id == judge_id)
        .order_by(PairwiseComparison.created_at.desc())
        .all()
    )
    seen_pairs = {(min(h.winner_id, h.loser_id), max(h.winner_id, h.loser_id)) for h in history}
    if history:
        anchor = history[0].winner_id
        candidates = [p for p in projects if p != anchor]
        random.shuffle(candidates)
        for other in candidates:
            key = (min(anchor, other), max(anchor, other))
            if key not in seen_pairs:
                return anchor, other
    random.shuffle(projects)
    return projects[0], projects[1]


def fit_bradley_terry(db: Session, event_id: uuid.UUID, l2: float = 0.1) -> PairwiseRun:
    comps = db.query(PairwiseComparison).filter(PairwiseComparison.event_id == event_id).all()
    ranking = bradley_terry([(str(c.winner_id), str(c.loser_id)) for c in comps], l2=l2)
    run = PairwiseRun(
        event_id=event_id,
        method="bradley_terry_l2",
        params={"l2": l2, "n_comparisons": len(comps)},
        ranking=[{"submission_id": r["project"], "mu": r["mu"]} for r in ranking],
    )
    db.add(run)
    db.flush()
    return run
