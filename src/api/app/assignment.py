"""Judge assignment: track-aware, conflict-free, load-balanced, idempotent top-up."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models import (
    Assignment,
    AssignmentBatch,
    EligibilityFlag,
    Event,
    EventRole,
    JudgeTrack,
    Membership,
    Submission,
    SubmissionStatus,
)


def blocked_ids(db: Session, event_id: uuid.UUID) -> set[uuid.UUID]:
    return {
        f.submission_id
        for f in db.query(EligibilityFlag)
        .join(Submission, Submission.id == EligibilityFlag.submission_id)
        .filter(Submission.event_id == event_id, EligibilityFlag.blocks_judging.is_(True))
    }


def eligible_submissions(db: Session, event_id: uuid.UUID) -> list[Submission]:
    """Submitted and not flagged (duplicates, ineligible). Drafts are never judged."""
    blocked = blocked_ids(db, event_id)
    rows = (
        db.query(Submission)
        .filter(Submission.event_id == event_id, Submission.status == SubmissionStatus.submitted.value)
        .order_by(Submission.submitted_at, Submission.id)
        .all()
    )
    return [s for s in rows if s.id not in blocked]


def judge_pool(db: Session, event_id: uuid.UUID) -> dict[uuid.UUID, set[uuid.UUID]]:
    """judge user id -> track ids (empty set = every track)."""
    roles = db.query(EventRole).filter(EventRole.event_id == event_id, EventRole.role == "judge").all()
    tracks: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for t in db.query(JudgeTrack).filter(JudgeTrack.role_id.in_([r.id for r in roles])):
        tracks[t.role_id].add(t.track_id)
    return {r.user_id: tracks[r.id] for r in roles}


def generate_assignments(
    db: Session, event: Event, reviews_per_project: int | None = None, kind: str = "top_up"
) -> tuple[AssignmentBatch, list[str]]:
    """Fill every eligible project up to N distinct judges.

    Greedy least-loaded: projects with the fewest reviewers go first; each takes judges who
    cover its track, are not on its team and do not already have it, lowest load first.
    Existing assignments are kept, so re-running is a top-up, never a reshuffle of work done.
    Returns the batch and readable warnings for projects that could not be filled.
    """
    n = reviews_per_project or event.reviews_per_project
    pool = judge_pool(db, event.id)
    if not pool:
        raise ValueError("No judges on this event yet. Invite judges first.")
    projects = eligible_submissions(db, event.id)
    have: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    load: dict[uuid.UUID, int] = defaultdict(int)
    for a in db.query(Assignment).filter(Assignment.event_id == event.id):
        have[a.submission_id].add(a.judge_id)
        load[a.judge_id] += 1
    members: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for m in db.query(Membership).filter(Membership.team_id.in_([p.team_id for p in projects])):
        members[m.team_id].add(m.user_id)

    batch = AssignmentBatch(event_id=event.id, reviews_per_project=n, kind=kind)
    db.add(batch)
    db.flush()
    warnings = []
    for project in sorted(projects, key=lambda p: (len(have[p.id]), str(p.id))):
        need = n - len(have[project.id])
        if need <= 0:
            continue
        candidates = [
            j
            for j, tracks in pool.items()
            if (not tracks or project.track_id in tracks)
            and j not in have[project.id]
            and j not in members[project.team_id]
        ]
        candidates.sort(key=lambda j: (load[j], str(j)))
        for judge_id in candidates[:need]:
            db.add(Assignment(batch_id=batch.id, event_id=event.id, judge_id=judge_id, submission_id=project.id))
            have[project.id].add(judge_id)
            load[judge_id] += 1
        if len(have[project.id]) < n:
            warnings.append(f"{project.title}: only {len(have[project.id])} of {n} reviews possible with current judges")
    db.flush()
    return batch, warnings
