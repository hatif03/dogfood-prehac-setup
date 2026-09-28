"""Response shapes shared by several routers. Public shapes never include scores."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.assignment import blocked_ids
from app.models import Comment, Event, EventRole, Membership, Submission, SubmissionStatus, Team
from app.rbac import Actor
from app.timeutil import ensure_utc, iso, now


def voting_open(event: Event) -> bool:
    if not (event.voting_opens_at and event.voting_closes_at):
        return False
    return ensure_utc(event.voting_opens_at) <= now() <= ensure_utc(event.voting_closes_at)


def submissions_open(event: Event) -> bool:
    if event.submissions_open_at and now() < ensure_utc(event.submissions_open_at):
        return False
    return event.submissions_deadline is None or now() <= ensure_utc(event.submissions_deadline)


def phase(event: Event) -> str:
    if event.archived:
        return "archived"
    if event.submissions_open_at and now() < ensure_utc(event.submissions_open_at):
        return "upcoming"
    if submissions_open(event):
        return "submissions_open"
    if voting_open(event):
        return "voting"
    if event.results_published:
        return "results"
    return "judging"


def results_visible(event: Event, actor: Actor) -> bool:
    return actor.is_organizer or (event.results_published and not voting_open(event))


def event_summary(db: Session, event: Event) -> dict:
    blocked = blocked_ids(db, event.id)
    projects = [
        sid
        for (sid,) in db.query(Submission.id).filter(
            Submission.event_id == event.id, Submission.status == SubmissionStatus.submitted.value
        )
        if sid not in blocked
    ]
    judges = db.query(func.count(EventRole.id)).filter(EventRole.event_id == event.id, EventRole.role == "judge").scalar()
    teams = db.query(func.count(Team.id)).filter(Team.event_id == event.id).scalar()
    return {
        "id": str(event.id),
        "slug": event.slug,
        "external_id": event.external_id,
        "name": event.name,
        "tagline": event.tagline,
        "phase": phase(event),
        "submissions_deadline": iso(event.submissions_deadline),
        "voting_opens_at": iso(event.voting_opens_at),
        "voting_closes_at": iso(event.voting_closes_at),
        "results_published": event.results_published,
        "archived": event.archived,
        "counts": {"projects": len(projects), "judges": judges, "teams": teams, "tracks": len(event.tracks)},
    }


def event_detail(db: Session, event: Event, actor: Actor) -> dict:
    out = event_summary(db, event)
    rubric = event.rubric
    out.update(
        {
            "description": event.description,
            "starts_at": iso(event.starts_at),
            "ends_at": iso(event.ends_at),
            "submissions_open_at": iso(event.submissions_open_at),
            "judging_deadline": iso(event.judging_deadline),
            "judging_mode": event.judging_mode,
            "voting_access": event.voting_access,
            "vote_mode": event.vote_mode,
            "reviews_per_project": event.reviews_per_project,
            "quadratic_budget": event.quadratic_budget,
            "max_team_size": event.max_team_size,
            "require_verified_email": event.require_verified_email,
            "submissions_open": submissions_open(event),
            "voting_open": voting_open(event),
            "results_visible": results_visible(event, actor),
            "tracks": [{"id": str(t.id), "slug": t.slug, "name": t.name, "description": t.description} for t in event.tracks],
            "prizes": [
                {"id": str(p.id), "name": p.name, "description": p.description, "track_id": str(p.track_id) if p.track_id else None}
                for p in event.prizes
            ],
            "rubric": rubric_out(event),
            "questions": [
                {"id": str(q.id), "prompt": q.prompt, "required": q.required, "sort_order": q.sort_order}
                for q in event.questions
            ],
            "viewer": {
                "authenticated": actor.user is not None,
                "role": actor.role,
                "track_ids": sorted(str(t) for t in actor.track_ids),
                "team_id": str(actor.team_id) if actor.team_id else None,
            },
        }
    )
    if actor.is_organizer:
        out["widget_token"] = event.widget_token
    return out


def rubric_out(event: Event) -> dict | None:
    r = event.rubric
    if r is None:
        return None
    return {
        "id": str(r.id),
        "name": r.name,
        "scale_min": r.scale_min,
        "scale_max": r.scale_max,
        "criteria": [
            {"id": str(c.id), "key": c.key, "name": c.name, "description": c.description, "weight": c.weight}
            for c in r.criteria
        ],
    }


def project_public(sub: Submission, comment_count: int = 0, members: list[str] | None = None) -> dict:
    return {
        "id": str(sub.id),
        "external_id": sub.external_id,
        "title": sub.title,
        "summary": sub.summary,
        "description": sub.description,
        "repo_url": sub.repo_url,
        "live_link": sub.live_link,
        "demo_video_url": sub.demo_video_url,
        "tech_tags": sub.tech_tags or [],
        "track": {"id": str(sub.track.id), "slug": sub.track.slug, "name": sub.track.name} if sub.track else None,
        "team": {"id": str(sub.team.id), "name": sub.team.name, "members": members or []},
        "submitted_at": iso(sub.submitted_at),
        "comment_count": comment_count,
        "images": [f"/v1/assets/{a.id}" for a in sub.assets],
    }


def gallery_rows(db: Session, event: Event) -> list[Submission]:
    blocked = blocked_ids(db, event.id)
    rows = (
        db.query(Submission)
        .filter(Submission.event_id == event.id, Submission.status == SubmissionStatus.submitted.value)
        .order_by(Submission.title, Submission.id)
        .all()
    )
    return [s for s in rows if s.id not in blocked]


def comment_counts(db: Session, event_id) -> dict:
    return dict(
        db.query(Comment.submission_id, func.count(Comment.id))
        .filter(Comment.event_id == event_id, Comment.hidden.is_(False))
        .group_by(Comment.submission_id)
        .all()
    )


def team_members(db: Session, team_id) -> list[str]:
    return [m.user.display_name for m in db.query(Membership).filter(Membership.team_id == team_id).order_by(Membership.joined_at)]
