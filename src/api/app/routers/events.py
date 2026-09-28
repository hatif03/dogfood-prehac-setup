from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.audit import audit
from app.deps import DB, ActorDep, CurrentUser, RequiredUser, actor_for, client_ip
from app.importer import slugify, unique_slug
from app.models import (
    Criterion,
    CustomAnswer,
    CustomQuestion,
    Event,
    EventRole,
    JudgeTrack,
    Prize,
    Rubric,
    Score,
    Submission,
    Track,
    User,
)
from app.rbac import Actor
from app.schemas import ArchiveIn, CriterionIn, EventCreate, EventFields, PrizeIn, PublishIn, QuestionIn, RoleIn, RubricIn, TrackIn
from app.scoring import recompute_weighted
from app.timeutil import ensure_utc
from app.views import event_detail, event_summary, rubric_out, voting_open

router = APIRouter(prefix="/v1/events", tags=["Events"])

DEFAULT_CRITERIA = [
    ("functionality", "Functionality", "Does it work end to end?", 0.4),
    ("quality", "Quality", "Code, design and polish.", 0.3),
    ("innovation", "Innovation", "Is the idea or approach new?", 0.3),
]


DATE_ORDER = [
    ("starts_at", "ends_at"),
    ("submissions_open_at", "submissions_deadline"),
    ("submissions_deadline", "judging_deadline"),
    ("voting_opens_at", "voting_closes_at"),
]


def check_dates(event: Event) -> None:
    for first, second in DATE_ORDER:
        a, b = getattr(event, first), getattr(event, second)
        if a and b and ensure_utc(a) >= ensure_utc(b):
            raise HTTPException(422, f"{first.replace('_', ' ')} must be before {second.replace('_', ' ')}")


@router.get("", summary="All events, newest first (public)")
def list_events(db: DB):
    return [event_summary(db, e) for e in db.query(Event).order_by(Event.created_at.desc())]


@router.post("", summary="Create an event; the caller becomes its organizer")
def create_event(body: EventCreate, request: Request, db: DB, user: RequiredUser):
    slug = body.slug or unique_slug(db, slugify(body.name))
    if db.query(Event.id).filter(Event.slug == slug).first():
        raise HTTPException(409, "That URL slug is taken")
    fields = body.model_dump(exclude={"slug", "tracks", "prizes", "rubric"}, exclude_none=True)
    event = Event(slug=slug, **fields)
    check_dates(event)
    db.add(event)
    db.flush()
    db.add(EventRole(event_id=event.id, user_id=user.id, role="organizer"))
    _replace_tracks(db, event, body.tracks)
    db.flush()
    _replace_prizes(db, event, body.prizes)
    rubric = body.rubric or RubricIn(
        criteria=[{"key": k, "name": n, "description": d, "weight": w} for k, n, d, w in DEFAULT_CRITERIA]
    )
    db.add(Rubric(event_id=event.id, scale_min=rubric.scale_min, scale_max=rubric.scale_max))
    db.flush()
    db.refresh(event)
    _replace_criteria(db, event, rubric)
    audit(db, action="event.create", summary=f"{user.display_name} created {event.name}", actor=user, event_id=event.id, ip=client_ip(request))
    db.commit()
    db.refresh(event)
    return event_detail(db, event, actor_for(db, user, event))


@router.get("/{event_id}", summary="Event detail, tracks, prizes, rubric and the viewer's role (public)")
def get_event(actor: ActorDep, db: DB):
    return event_detail(db, actor.event, actor)


@router.patch("/{event_id}", summary="Update dates, modes and copy (organizer)")
def patch_event(body: EventFields, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    event = actor.event
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if key in {"name", "judging_mode", "voting_access", "vote_mode", "reviews_per_project"} and value is None:
            continue
        setattr(event, key, value)
    check_dates(event)
    audit(db, action="event.update", summary=f"{user.display_name} updated {', '.join(changes) or 'nothing'}", actor=user, event_id=event.id, payload={k: str(v) for k, v in changes.items()})
    db.commit()
    db.refresh(event)
    return event_detail(db, event, actor)


def _replace_tracks(db, event: Event, tracks: list[TrackIn]) -> None:
    keep = {t.id for t in tracks if t.id}
    for row in list(event.tracks):
        if row.id not in keep:
            if db.query(Submission.id).filter(Submission.track_id == row.id).first():
                raise HTTPException(409, f"Track '{row.name}' has projects; move them before deleting it")
            db.query(JudgeTrack).filter(JudgeTrack.track_id == row.id).delete()
            db.query(Prize).filter(Prize.track_id == row.id).update({Prize.track_id: None})
            db.delete(row)
    existing = {t.id: t for t in event.tracks}
    for t in tracks:
        if t.id and t.id in existing:
            existing[t.id].name, existing[t.id].description = t.name, t.description
        else:
            db.add(Track(event_id=event.id, slug=unique_track_slug(db, event, t.name), name=t.name, description=t.description))


def unique_track_slug(db, event: Event, name: str) -> str:
    base, n = slugify(name), 2
    slug = base
    while db.query(Track.id).filter(Track.event_id == event.id, Track.slug == slug).first():
        slug, n = f"{base}-{n}", n + 1
    return slug


def _replace_prizes(db, event: Event, prizes: list[PrizeIn]) -> None:
    db.query(Prize).filter(Prize.event_id == event.id).delete()
    for i, p in enumerate(prizes):
        db.add(Prize(event_id=event.id, name=p.name, description=p.description, track_id=p.track_id, sort_order=i))


def _replace_criteria(db, event: Event, body: RubricIn) -> None:
    if body.scale_min >= body.scale_max:
        raise HTTPException(422, "scale_min must be below scale_max")
    rubric = event.rubric
    total = sum(c.weight for c in body.criteria)
    by_id = {c.id: c for c in rubric.criteria}
    by_key = {c.key: c for c in rubric.criteria}
    used = db.query(Score.id).filter(Score.event_id == event.id).first() is not None
    # An incoming criterion updates the existing row with its id, or else with its key.
    matched: list[tuple[CriterionIn, str, Criterion | None]] = []
    keys = set()
    for c in body.criteria:
        key = c.key or slugify(c.name).replace("-", "_")
        if key in keys:
            raise HTTPException(422, f"Two criteria share the key '{key}'")
        keys.add(key)
        matched.append((c, key, by_id.get(c.id) if c.id else by_key.get(key)))
    keep = {row.id for _, _, row in matched if row is not None}
    for cid, row in by_id.items():
        if cid not in keep:
            if used:
                raise HTTPException(409, f"Criterion '{row.name}' already has scores; set its weight low instead of deleting it")
            db.delete(row)
    rubric.scale_min, rubric.scale_max = body.scale_min, body.scale_max
    for i, (c, key, row) in enumerate(matched):
        if row is not None:
            row.name, row.description, row.weight, row.sort_order = c.name, c.description, c.weight / total, i
        else:
            db.add(Criterion(rubric_id=rubric.id, key=key, name=c.name, description=c.description, weight=c.weight / total, sort_order=i))
    db.flush()
    db.refresh(rubric)


@router.put("/{event_id}/tracks", summary="Replace the track list (organizer)")
def put_tracks(body: list[TrackIn], actor: ActorDep, db: DB):
    user = actor.require_organizer()
    _replace_tracks(db, actor.event, body)
    audit(db, action="event.tracks", summary=f"{user.display_name} edited tracks", actor=user, event_id=actor.event.id)
    db.commit()
    db.refresh(actor.event)
    return event_detail(db, actor.event, actor)["tracks"]


@router.put("/{event_id}/prizes", summary="Replace the prize list (organizer)")
def put_prizes(body: list[PrizeIn], actor: ActorDep, db: DB):
    user = actor.require_organizer()
    _replace_prizes(db, actor.event, body)
    audit(db, action="event.prizes", summary=f"{user.display_name} edited prizes", actor=user, event_id=actor.event.id)
    db.commit()
    db.refresh(actor.event)
    return event_detail(db, actor.event, actor)["prizes"]


def _replace_questions(db, event: Event, questions: list[QuestionIn]) -> None:
    keep = {q.id for q in questions if q.id}
    for row in list(event.questions):
        if row.id not in keep:
            db.query(CustomAnswer).filter(CustomAnswer.question_id == row.id).delete()
            db.delete(row)
    existing = {q.id: q for q in event.questions}
    for i, q in enumerate(questions):
        if q.id and q.id in existing:
            row = existing[q.id]
            row.prompt, row.required, row.sort_order = q.prompt, q.required, i
        else:
            db.add(CustomQuestion(event_id=event.id, prompt=q.prompt, required=q.required, sort_order=i))


@router.put("/{event_id}/questions", summary="Replace custom submission questions (organizer)")
def put_questions(body: list[QuestionIn], actor: ActorDep, db: DB):
    user = actor.require_organizer()
    _replace_questions(db, actor.event, body)
    audit(db, action="event.questions", summary=f"{user.display_name} edited submission questions", actor=user, event_id=actor.event.id)
    db.commit()
    db.refresh(actor.event)
    return event_detail(db, actor.event, actor)["questions"]


@router.get("/{event_id}/rubric", summary="Criteria, weights and scale (public)")
def get_rubric(actor: ActorDep):
    return rubric_out(actor.event)


@router.put("/{event_id}/rubric", summary="Re-weight the rubric; every stored total is recomputed (organizer)")
def put_rubric(body: RubricIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    event = actor.event
    before = {c.name: round(c.weight, 4) for c in event.rubric.criteria}
    _replace_criteria(db, event, body)
    n = recompute_weighted(db, event)
    after = {c.name: round(c.weight, 4) for c in event.rubric.criteria}
    audit(
        db,
        action="rubric.update",
        summary=f"{user.display_name} changed rubric weights; {n} reviews recomputed",
        actor=user,
        event_id=event.id,
        payload={"before": before, "after": after},
    )
    db.commit()
    db.refresh(event)
    return {**rubric_out(event), "recomputed": n}


@router.get("/{event_id}/people", summary="Everyone with a role in this event (organizer)")
def people(actor: ActorDep, db: DB):
    actor.require_organizer()
    rows = db.query(EventRole, User).join(User, User.id == EventRole.user_id).filter(EventRole.event_id == actor.event.id)
    tracks: dict = {}
    for jt in db.query(JudgeTrack).join(EventRole, EventRole.id == JudgeTrack.role_id).filter(EventRole.event_id == actor.event.id):
        tracks.setdefault(jt.role_id, []).append(str(jt.track_id))
    return [
        {
            "user_id": str(u.id),
            "email": u.email,
            "display_name": u.display_name,
            "role": r.role,
            "external_id": u.external_id,
            "track_ids": tracks.get(r.id, []),
            "claimed": u.password_hash != "!",
        }
        for r, u in rows.order_by(EventRole.role, User.display_name)
    ]


@router.post("/{event_id}/roles", summary="Give a registered user a role (organizer)")
def assign_role(body: RoleIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    event = actor.event
    target = db.query(User).filter(User.email == body.user_email.lower()).one_or_none()
    if target is None:
        raise HTTPException(404, "No account with that email. Send a judge invite instead.")
    target_actor: Actor = actor_for(db, target, event)
    if body.role == "judge" and target_actor.team_id:
        raise HTTPException(409, "That person is on a team in this event and cannot judge it")
    row = db.query(EventRole).filter(EventRole.event_id == event.id, EventRole.user_id == target.id).one_or_none()
    if row is None:
        row = EventRole(event_id=event.id, user_id=target.id, role=body.role)
        db.add(row)
        db.flush()
    row.role = body.role
    db.query(JudgeTrack).filter(JudgeTrack.role_id == row.id).delete()
    for tid in body.track_ids:
        db.add(JudgeTrack(role_id=row.id, track_id=tid))
    audit(db, action="role.assign", summary=f"{user.display_name} made {target.display_name} {body.role}", actor=user, event_id=event.id, resource=target.email)
    db.commit()
    return {"ok": True}


@router.post("/{event_id}/publish", summary="Publish or unpublish results (organizer)")
def publish(body: PublishIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    event = actor.event
    if body.published and voting_open(event):
        raise HTTPException(409, "Voting is still open. Results stay hidden until the voting window closes.")
    event.results_published = body.published
    verb = "published" if body.published else "unpublished"
    audit(db, action=f"results.{verb}", summary=f"{user.display_name} {verb} results", actor=user, event_id=event.id)
    db.commit()
    return {"results_published": event.results_published}


@router.post("/{event_id}/archive", summary="Archive (read-only forever) or unarchive an event (organizer)")
def archive(body: ArchiveIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    event = actor.event
    if body.archived and voting_open(event):
        raise HTTPException(409, "Close voting before archiving")
    event.archived = body.archived
    verb = "archived" if body.archived else "unarchived"
    audit(db, action="event.archive", summary=f"{user.display_name} {verb} {event.name}", actor=user, event_id=event.id)
    db.commit()
    return {"archived": event.archived}


@router.get("/{event_id}/me", summary="The caller's role in this event")
def my_role(actor: ActorDep, user: CurrentUser):
    return {
        "authenticated": user is not None,
        "role": actor.role,
        "track_ids": sorted(str(t) for t in actor.track_ids),
        "team_id": str(actor.team_id) if actor.team_id else None,
    }
