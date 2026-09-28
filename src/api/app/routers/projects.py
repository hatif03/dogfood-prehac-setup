"""Gallery (public), teams and invite links, submissions with draft -> submit until the deadline."""

from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from app.audit import audit
from app.config import settings
from app.deps import DB, ActorDep, RequiredUser, actor_for, client_ip
from app.importer import detect_duplicates
from app.models import (
    CustomAnswer,
    Event,
    EventRole,
    InviteLink,
    Membership,
    Submission,
    SubmissionAsset,
    SubmissionStatus,
    Team,
)
from app.rbac import Actor
from app.schemas import SubmissionIn, TeamIn
from app.storage import get_bytes, put_bytes
from app.timeutil import iso, now
from app.views import comment_counts, gallery_rows, project_public, submissions_open, team_members

router = APIRouter(prefix="/v1", tags=["Projects"])

IMAGE_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}


def ensure_open(event: Event) -> None:
    """The one deadline check. Every write path for submissions calls it first."""
    if not submissions_open(event):
        when = iso(event.submissions_deadline) if event.submissions_deadline else "not yet"
        raise HTTPException(403, f"Submissions for {event.name} are closed (deadline {when})")


@router.get("/events/{event_id}/projects", summary="Public gallery with search and filters")
def gallery(actor: ActorDep, db: DB, q: str | None = None, track: str | None = None, tag: str | None = None):
    rows = gallery_rows(db, actor.event)
    needle = (q or "").strip().lower()
    counts = comment_counts(db, actor.event.id)
    out = []
    for s in rows:
        if track and not (s.track and track in (s.track.slug, str(s.track.id), s.track.external_id)):
            continue
        if tag and tag.lower() not in [t.lower() for t in s.tech_tags or []]:
            continue
        if needle and needle not in f"{s.title} {s.summary} {s.description} {s.team.name} {' '.join(s.tech_tags or [])}".lower():
            continue
        out.append(project_public(s, counts.get(s.id, 0)))
    return out


@router.get("/events/{event_id}/projects/{project_id}", summary="One public project")
def project(project_id: uuid.UUID, actor: ActorDep, db: DB):
    sub = db.get(Submission, project_id)
    if sub is None or sub.event_id != actor.event.id:
        raise HTTPException(404, "Project not found")
    own = actor.team_id == sub.team_id
    if sub.status != SubmissionStatus.submitted.value and not (own or actor.is_organizer):
        raise HTTPException(404, "Project not found")
    out = project_public(sub, comment_counts(db, actor.event.id).get(sub.id, 0), team_members(db, sub.team_id))
    dup = next((f for f in sub.flags if f.code == "duplicate"), None)
    out["duplicate_of"] = str(dup.duplicate_of_id) if dup and dup.duplicate_of_id else None
    out["status"] = sub.status
    return out


def _team_out(db, team: Team, event: Event) -> dict:
    invite = next((i for i in team.invites if not i.revoked), None)
    subs = db.query(Submission).filter(Submission.team_id == team.id).order_by(Submission.created_at).all()
    sub = next((s for s in subs if not any(f.code == "duplicate" for f in s.flags)), subs[0] if subs else None)
    return {
        "id": str(team.id),
        "name": team.name,
        "invite_token": invite.token if invite else None,
        "max_size": event.max_team_size,
        "members": [
            {"user_id": str(m.user_id), "display_name": m.user.display_name, "email": m.user.email, "is_captain": m.is_captain}
            for m in team.memberships
        ],
        "submission": _submission_out(sub) if sub else None,
    }


def _submission_out(sub: Submission) -> dict:
    return {
        "id": str(sub.id),
        "status": sub.status,
        "title": sub.title,
        "summary": sub.summary,
        "description": sub.description,
        "demo_video_url": sub.demo_video_url,
        "repo_url": sub.repo_url,
        "live_link": sub.live_link,
        "tech_tags": sub.tech_tags or [],
        "track_id": str(sub.track_id) if sub.track_id else None,
        "submitted_at": iso(sub.submitted_at),
        "updated_at": iso(sub.updated_at),
        "answers": [{"question_id": str(a.question_id), "body": a.body} for a in sub.answers],
        "flags": [{"code": f.code, "reason": f.reason} for f in sub.flags],
        "images": [f"/v1/assets/{a.id}" for a in sub.assets],
    }


@router.get("/events/{event_id}/team", summary="The caller's team, invite link and submission")
def my_team(actor: ActorDep, db: DB):
    actor.require_login()
    if actor.team_id is None:
        return None
    return _team_out(db, db.get(Team, actor.team_id), actor.event)


def _join_as_participant(db, actor: Actor) -> None:
    if actor.is_judge:
        raise HTTPException(409, "Judges cannot join a team in the event they judge")
    if actor.role == "visitor":
        db.add(EventRole(event_id=actor.event.id, user_id=actor.user.id, role="participant"))


@router.post("/events/{event_id}/teams", summary="Create a team; returns its invite link")
def create_team(body: TeamIn, request: Request, actor: ActorDep, db: DB):
    ensure_open(actor.event)  # a team formed after the deadline could only be used to smuggle in a member
    user = actor.require_login()
    if actor.team_id:
        raise HTTPException(409, "You are already on a team in this event")
    _join_as_participant(db, actor)
    team = Team(event_id=actor.event.id, name=body.name.strip())
    db.add(team)
    db.flush()
    db.add(Membership(event_id=actor.event.id, team_id=team.id, user_id=user.id, is_captain=True))
    db.add(InviteLink(team_id=team.id, token=secrets.token_urlsafe(12)))
    audit(db, action="team.create", summary=f"{user.display_name} created team {team.name}", actor=user, event_id=actor.event.id, resource=str(team.id), ip=client_ip(request))
    db.commit()
    db.refresh(team)
    return _team_out(db, team, actor.event)


@router.get("/invites/{token}", summary="Preview a team invite (public)")
def invite_preview(token: str, db: DB):
    invite = db.query(InviteLink).filter(InviteLink.token == token, InviteLink.revoked.is_(False)).one_or_none()
    if invite is None:
        raise HTTPException(404, "This invite link is invalid or was revoked")
    team = invite.team
    event = db.get(Event, team.event_id)
    return {
        "team": team.name,
        "event": {"slug": event.slug, "name": event.name},
        "members": [m.user.display_name for m in team.memberships],
        "full": len(team.memberships) >= event.max_team_size,
    }


@router.post("/invites/{token}/accept", summary="Join a team by invite link")
def accept_invite(token: str, db: DB, user: RequiredUser):
    invite = db.query(InviteLink).filter(InviteLink.token == token, InviteLink.revoked.is_(False)).one_or_none()
    if invite is None:
        raise HTTPException(404, "This invite link is invalid or was revoked")
    team = invite.team
    event = db.get(Event, team.event_id)
    if event.archived:
        raise HTTPException(403, f"{event.name} is archived and read-only")
    ensure_open(event)
    actor = actor_for(db, user, event)
    if actor.team_id == team.id:
        return {"team_id": str(team.id), "event_slug": event.slug}
    if actor.team_id:
        raise HTTPException(409, "You are already on another team in this event")
    # Lock the team row so simultaneous joins cannot all pass the size check.
    db.query(Team).filter(Team.id == team.id).with_for_update().one()
    size = db.query(Membership).filter(Membership.team_id == team.id).count()
    if size >= event.max_team_size:
        raise HTTPException(409, f"This team is full ({event.max_team_size} people)")
    _join_as_participant(db, actor)
    db.add(Membership(event_id=event.id, team_id=team.id, user_id=user.id))
    audit(db, action="team.join", summary=f"{user.display_name} joined {team.name}", actor=user, event_id=event.id, resource=str(team.id))
    db.commit()
    return {"team_id": str(team.id), "event_slug": event.slug}


@router.post("/events/{event_id}/teams/rotate-invite", summary="Revoke the team's invite link and mint a new one")
def rotate_invite(actor: ActorDep, db: DB):
    ensure_open(actor.event)
    actor.require_login()
    if actor.team_id is None:
        raise HTTPException(404, "You are not on a team")
    db.query(InviteLink).filter(InviteLink.team_id == actor.team_id).update({InviteLink.revoked: True})
    db.add(InviteLink(team_id=actor.team_id, token=secrets.token_urlsafe(12)))
    db.commit()
    return _team_out(db, db.get(Team, actor.team_id), actor.event)


def _own_submission(db, actor: Actor) -> Submission | None:
    subs = db.query(Submission).filter(Submission.team_id == actor.team_id).order_by(Submission.created_at).all()
    return next((s for s in subs if not any(f.code == "duplicate" for f in s.flags)), None)


@router.post("/events/{event_id}/projects", summary="Save the team's submission as a draft (until the deadline)")
def save_project(body: SubmissionIn, request: Request, actor: ActorDep, db: DB):
    ensure_open(actor.event)
    user = actor.require_login()
    if actor.team_id is None:
        raise HTTPException(403, "Create or join a team before submitting")
    # Serialize saves per team (Postgres row lock), so two tabs cannot create two submissions.
    db.query(Team).filter(Team.id == actor.team_id).with_for_update().one()
    if body.track_id and body.track_id not in {t.id for t in actor.event.tracks}:
        raise HTTPException(422, "Unknown track for this event")
    sub = _own_submission(db, actor)
    if sub is None:
        sub = Submission(event_id=actor.event.id, team_id=actor.team_id)
        db.add(sub)
    for field in ("title", "summary", "description", "demo_video_url", "repo_url", "live_link", "track_id"):
        setattr(sub, field, getattr(body, field))
    sub.tech_tags = [t.strip()[:40] for t in body.tech_tags if t.strip()]
    sub.updated_at = now()
    db.flush()
    db.query(CustomAnswer).filter(CustomAnswer.submission_id == sub.id).delete()
    questions = {q.id for q in actor.event.questions}
    for a in body.answers:
        qid = uuid.UUID(str(a.get("question_id")))
        if qid in questions:
            db.add(CustomAnswer(submission_id=sub.id, question_id=qid, body=str(a.get("body", ""))[:5000]))
    audit(db, action="submission.save", summary=f"{user.display_name} saved '{sub.title or 'untitled'}'", actor=user, event_id=actor.event.id, resource=str(sub.id), ip=client_ip(request))
    db.commit()
    db.refresh(sub)
    return _submission_out(sub)


@router.post("/events/{event_id}/projects/{project_id}/submit", summary="Mark the draft as submitted (until the deadline)")
def submit_project(project_id: uuid.UUID, actor: ActorDep, db: DB):
    ensure_open(actor.event)
    user = actor.require_login()
    sub = db.get(Submission, project_id)
    if sub is None or sub.event_id != actor.event.id or sub.team_id != actor.team_id:
        raise HTTPException(404, "Submission not found")
    missing = [f for f in ("title", "summary") if not getattr(sub, f).strip()]
    if actor.event.tracks and sub.track_id is None:
        missing.append("track")
    for q in actor.event.questions:
        if not q.required:
            continue
        if not any(a.question_id == q.id and a.body.strip() for a in sub.answers):
            missing.append(q.prompt[:80] + ("…" if len(q.prompt) > 80 else ""))
    if missing:
        raise HTTPException(422, f"Fill in {', '.join(missing)} before submitting")
    sub.status = SubmissionStatus.submitted.value
    sub.submitted_at = now()
    db.flush()
    flags = detect_duplicates(db, actor.event)
    audit(db, action="submission.submit", summary=f"{user.display_name} submitted '{sub.title}'", actor=user, event_id=actor.event.id, resource=str(sub.id))
    db.commit()
    db.refresh(sub)
    out = _submission_out(sub)
    out["warnings"] = [f.reason for f in flags if f.submission_id == sub.id]
    return out


@router.post("/events/{event_id}/projects/{project_id}/unsubmit", summary="Back to draft (until the deadline)")
def unsubmit_project(project_id: uuid.UUID, actor: ActorDep, db: DB):
    ensure_open(actor.event)
    actor.require_login()
    sub = db.get(Submission, project_id)
    if sub is None or sub.event_id != actor.event.id or sub.team_id != actor.team_id:
        raise HTTPException(404, "Submission not found")
    sub.status = SubmissionStatus.draft.value
    db.commit()
    return _submission_out(sub)


@router.post("/events/{event_id}/projects/{project_id}/flags/clear", summary="Clear a false-positive flag, e.g. a wrong duplicate match (organizer)")
def clear_flags(project_id: uuid.UUID, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    sub = db.get(Submission, project_id)
    if sub is None or sub.event_id != actor.event.id:
        raise HTTPException(404, "Project not found")
    cleared = [f.code for f in sub.flags]
    for f in list(sub.flags):
        # Kept as evidence: the flag becomes non-blocking instead of disappearing.
        f.blocks_judging = False
        f.code = f"cleared:{f.code}" if not f.code.startswith("cleared:") else f.code
    audit(db, action="flag.clear", summary=f"{user.display_name} cleared {', '.join(cleared) or 'no'} flag(s) on '{sub.title}'", actor=user, event_id=actor.event.id, resource=str(sub.id))
    db.commit()
    return {"cleared": cleared}


@router.post("/events/{event_id}/projects/{project_id}/images", summary="Upload a screenshot (PNG/JPEG/WebP/GIF, 5 MB)")
def upload_image(project_id: uuid.UUID, actor: ActorDep, db: DB, file: UploadFile = File(...)):
    ensure_open(actor.event)
    actor.require_login()
    sub = db.get(Submission, project_id)
    if sub is None or sub.event_id != actor.event.id or sub.team_id != actor.team_id:
        raise HTTPException(404, "Submission not found")
    ext = IMAGE_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(415, "Images only: PNG, JPEG, WebP or GIF")
    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "Images must be 5 MB or smaller")
    try:
        key = put_bytes(data, file.content_type, ext)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, "Object storage is unavailable") from exc
    asset = SubmissionAsset(submission_id=sub.id, kind="gallery", object_key=key, content_type=file.content_type)
    db.add(asset)
    db.commit()
    return {"id": str(asset.id), "url": f"/v1/assets/{asset.id}"}


@router.get("/assets/{asset_id}", summary="Serve an uploaded image")
def asset(asset_id: uuid.UUID, db: DB):
    row = db.get(SubmissionAsset, asset_id)
    if row is None:
        raise HTTPException(404, "Not found")
    try:
        body = get_bytes(row.object_key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, "Object storage is unavailable") from exc
    return Response(body, media_type=row.content_type, headers={"Cache-Control": "public, max-age=86400"})
