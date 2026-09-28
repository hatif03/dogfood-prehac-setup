from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func

from app.assignment import blocked_ids
from app.audit import audit
from app.config import settings
from app.deps import COOKIE, DB, RequiredUser, actor_for, client_ip
from app.models import Assignment, Event, EventRole, Score, Submission
from app.models import Session as AuthSession
from app.models import User
from app.rate_limit import enforce
from app.email_verify import issue_verification, verify_token
from app.schemas import LoginIn, RegisterIn, UserOut
from app.security import hash_password, hash_token, new_token, session_expiry, verify_password
from app.views import event_summary

router = APIRouter(prefix="/v1/auth", tags=["Auth"])


def _user_out(user: User) -> dict:
    return {**UserOut.model_validate(user).model_dump(mode="json"), "email_verified": user.email_verified_at is not None}


def start_session(db, response: Response, user: User) -> None:
    token = new_token()
    db.add(AuthSession(user_id=user.id, token_hash=hash_token(token), expires_at=session_expiry()))
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", max_age=settings.session_hours * 3600, path="/"
    )


@router.post("/register", response_model=UserOut, summary="Create an account and sign in")
def register(body: RegisterIn, request: Request, response: Response, db: DB):
    if body.website.strip():
        raise HTTPException(400, "Could not create account")
    enforce(f"register:{client_ip(request)}", settings.login_rate_limit)
    email = body.email.lower()
    existing = db.query(User).filter(User.email == email).one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email already has an account. Sign in instead.")
    user = User(email=email, display_name=body.display_name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    start_session(db, response, user)
    issue_verification(db, user)
    audit(db, action="auth.register", summary=f"{user.display_name} created an account", actor=user)
    db.commit()
    return _user_out(user)


@router.post("/login", response_model=UserOut, summary="Sign in with email and password")
def login(body: LoginIn, request: Request, response: Response, db: DB):
    enforce(f"login:{client_ip(request)}", settings.login_rate_limit)
    enforce(f"login:{body.email.lower()}", settings.login_rate_limit)
    user = db.query(User).filter(User.email == body.email.lower()).one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    start_session(db, response, user)
    db.commit()
    return _user_out(user)


@router.post("/verify-email/resend", summary="Send another confirmation email")
def resend_verify(user: RequiredUser, db: DB):
    if user.email_verified_at is not None:
        return {"ok": True, "email_verified": True}
    issue_verification(db, user)
    db.commit()
    return {"ok": True, "status": "sent"}


@router.post("/verify-email/{token}", summary="Confirm email from the link in your inbox")
def verify_email(token: str, db: DB):
    try:
        user = verify_token(db, token)
    except ValueError as e:
        raise HTTPException(400, "This link is invalid or has expired. Sign in and request a new one.") from e
    audit(db, action="auth.verify_email", summary=f"{user.display_name} confirmed their email", actor=user)
    db.commit()
    return {"ok": True, "email_verified": True}


@router.post("/logout", summary="End the current session only")
def logout(request: Request, response: Response, db: DB, user: RequiredUser):
    sid = getattr(request.state, "session_id", None)
    if sid:
        db.query(AuthSession).filter(AuthSession.id == sid, AuthSession.label != "demo").delete()
    response.delete_cookie(COOKIE, path="/")
    db.commit()
    return {"ok": True}


@router.get("/work", summary="Home screen: for every event you belong to, your role and your next action")
def my_work(user: RequiredUser, db: DB):
    events = {e.id: e for e in db.query(Event).join(EventRole, EventRole.event_id == Event.id).filter(EventRole.user_id == user.id)}
    if user.is_platform_admin:
        events.update({e.id: e for e in db.query(Event)})
    out = []
    for event in sorted(events.values(), key=lambda e: e.created_at, reverse=True):
        actor = actor_for(db, user, event)
        item = {"event": event_summary(db, event), "role": actor.role}
        # Same counting as the dashboard: flagged submissions (duplicates) are out of judging.
        blocked = blocked_ids(db, event.id)
        if actor.is_judge:
            assigned = db.query(func.count(Assignment.id)).filter(Assignment.event_id == event.id, Assignment.judge_id == user.id, Assignment.submission_id.notin_(blocked)).scalar()
            done = db.query(func.count(Score.id)).filter(Score.event_id == event.id, Score.judge_id == user.id, Score.submitted.is_(True), Score.submission_id.notin_(blocked)).scalar()
            item["judge"] = {"assigned": assigned, "done": done}
        elif actor.is_organizer:
            assigned = db.query(func.count(Assignment.id)).filter(Assignment.event_id == event.id, Assignment.submission_id.notin_(blocked)).scalar()
            done = db.query(func.count(Score.id)).filter(Score.event_id == event.id, Score.submitted.is_(True), Score.submission_id.notin_(blocked)).scalar()
            item["organizer"] = {"reviews_assigned": assigned, "reviews_submitted": done}
        if actor.team_id:
            sub = db.query(Submission.status, Submission.title).filter(Submission.team_id == actor.team_id).order_by(Submission.created_at).first()
            item["participant"] = {"team_id": str(actor.team_id), "submission_status": sub[0] if sub else None, "title": sub[1] if sub else None}
        out.append(item)
    return out


@router.get("/me", summary="The signed-in user and their role in every event")
def me(user: RequiredUser, db: DB):
    roles = (
        db.query(EventRole, Event)
        .join(Event, Event.id == EventRole.event_id)
        .filter(EventRole.user_id == user.id)
        .all()
    )
    return {
        **_user_out(user),
        "roles": [{"event_id": str(e.id), "event_slug": e.slug, "event_name": e.name, "role": r.role} for r, e in roles],
    }
