from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import ApiKey, Event, EventRole, JudgeTrack, Membership, Team, User
from app.models import Session as AuthSession
from app.rbac import Actor
from app.security import hash_token
from app.timeutil import ensure_utc, now

COOKIE = "portal_session"


def _token(request: Request) -> str | None:
    token = request.cookies.get(COOKIE)
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    raw_key = request.headers.get("X-API-Key")
    if raw_key:
        key = db.query(ApiKey).filter(ApiKey.key_hash == hash_token(raw_key), ApiKey.revoked.is_(False)).one_or_none()
        if key is None:
            return None
        key.last_used_at = now()
        db.commit()
        request.state.api_key_event_id = key.event_id
        return db.get(User, key.user_id)
    token = _token(request)
    if not token:
        return None
    row = db.query(AuthSession).filter(AuthSession.token_hash == hash_token(token)).one_or_none()
    if row is None or ensure_utc(row.expires_at) < now():
        return None
    request.state.session_id = row.id
    return db.get(User, row.user_id)


CurrentUser = Annotated[User | None, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


def require_user(user: CurrentUser) -> User:
    if user is None:
        raise HTTPException(401, "Sign in required")
    return user


RequiredUser = Annotated[User, Depends(require_user)]


def get_event(event_id: str, db: DB) -> Event:
    """Path accepts a UUID or a slug, so URLs stay readable: /v1/events/sample-hack-2026/..."""
    event = None
    try:
        event = db.get(Event, uuid.UUID(event_id))
    except ValueError:
        pass
    if event is None:
        event = db.query(Event).filter(Event.slug == event_id).one_or_none()
    if event is None:
        raise HTTPException(404, "Event not found")
    return event


EventDep = Annotated[Event, Depends(get_event)]


def actor_for(db: Session, user: User | None, event: Event) -> Actor:
    if user is None:
        return Actor(event=event, user=None, role="visitor")
    role = db.query(EventRole).filter(EventRole.event_id == event.id, EventRole.user_id == user.id).one_or_none()
    team_id = (
        db.query(Team.id)
        .join(Membership, Membership.team_id == Team.id)
        .filter(Team.event_id == event.id, Membership.user_id == user.id)
        .scalar()
    )
    if user.is_platform_admin:
        return Actor(event=event, user=user, role="admin", team_id=team_id)
    if role is None:
        return Actor(event=event, user=user, role="participant" if team_id else "visitor", team_id=team_id)
    tracks = frozenset(t.track_id for t in db.query(JudgeTrack).filter(JudgeTrack.role_id == role.id))
    return Actor(event=event, user=user, role=role.role, track_ids=tracks, team_id=team_id)


READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_actor(request: Request, event: EventDep, user: CurrentUser, db: DB) -> Actor:
    if event.archived and request.method not in READ_METHODS and not request.url.path.endswith("/archive"):
        # One check for every event-scoped write: archived means read-only, whatever the route.
        raise HTTPException(403, f"{event.name} is archived and read-only")
    key_event = getattr(request.state, "api_key_event_id", None)
    if key_event is not None and key_event != event.id:
        user = None  # an API key never reaches outside its own event
    return actor_for(db, user, event)


ActorDep = Annotated[Actor, Depends(get_actor)]


def client_ip(request: Request) -> str:
    # ponytail: trusts the first X-Forwarded-For hop when TRUST_PROXY is on (the web proxy sets it);
    # do not expose the API port publicly with this on.
    fwd = request.headers.get("x-forwarded-for")
    if settings.trust_proxy and fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""
