"""Community voting (T3): three access modes on one ballot model, plus comments.

    open           anyone with the link; one ballot per browser (cookie), capped per IP per day
    authenticated  one ballot per account
    email_gated    one ballot per canonical email; the ballot token only travels by email
    link           organizer mints single-use ballot links (for in-room voting)

Ballot order is shuffled once per ballot and stored, so a refresh never reorders a voter's page.
Tallies stay hidden until the voting window closes and results are published.
"""

from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import audit
from app.config import settings
from app.deps import DB, ActorDep, CurrentUser, client_ip
from app.mailer import send_mail
from app.models import Ballot, Comment, Event, Submission, Vote
from app.rate_limit import enforce
from app.schemas import BallotIn, CommentIn, VoteIn, VoteLinksIn
from app.security import canonical_email, hash_ip
from app.timeutil import iso
from app.views import gallery_rows, project_public, voting_open

router = APIRouter(prefix="/v1", tags=["Voting"])


def _ballot_out(db: Session, ballot: Ballot, event: Event) -> dict:
    subs = {str(s.id): s for s in gallery_rows(db, event)}
    votes = {str(v.submission_id): v.units for v in db.query(Vote).filter(Vote.ballot_id == ballot.id)}
    return {
        "token": ballot.token,
        "confirmed": ballot.confirmed,
        "vote_mode": event.vote_mode,
        "budget": event.quadratic_budget if event.vote_mode == "quadratic" else 1,
        "spent": sum(u * u for u in votes.values()) if event.vote_mode == "quadratic" else len(votes),
        "voting_open": voting_open(event),
        "closes_at": iso(event.voting_closes_at),
        "projects": [project_public(subs[sid]) for sid in ballot.order if sid in subs],
        "votes": votes,
    }


def _new_ballot(db: Session, event: Event, voter_key: str, email: str | None, confirmed: bool, ip: str) -> Ballot:
    order = [str(s.id) for s in gallery_rows(db, event)]
    secrets.SystemRandom().shuffle(order)
    ballot = Ballot(
        event_id=event.id,
        voter_key=voter_key,
        token=secrets.token_urlsafe(24),
        order=order,
        email=email,
        confirmed=confirmed,
        ip_hash=hash_ip(ip) if ip else "",
    )
    db.add(ballot)
    db.flush()
    return ballot


@router.post("/events/{event_id}/ballots", summary="Get (or start) a ballot in this event's access mode")
def open_ballot(body: BallotIn, request: Request, response: Response, actor: ActorDep, db: DB):
    event = actor.event
    ip = client_ip(request)
    enforce(f"ballot:{ip}", settings.vote_rate_limit, settings.vote_rate_window_seconds)
    if not voting_open(event):
        raise HTTPException(403, "Voting is not open right now")
    mode = event.voting_access
    if mode == "open":
        cookie = f"portal_ballot_{event.id.hex}"
        token = request.cookies.get(cookie) or body.link_token or ""
        ballot = db.query(Ballot).filter(Ballot.event_id == event.id, Ballot.token == token).one_or_none()
        if ballot is None:
            # ponytail: a cleared cookie is a new ballot; the per-IP daily cap is what bounds it. Weakest mode by design.
            enforce(f"open-ballot:{ip}", settings.open_ballots_per_ip_per_day, 86400)
            ballot = _new_ballot(db, event, f"open:{uuid.uuid4().hex}", None, True, ip)
            audit(db, action="ballot.open", summary="An open-link ballot was started", event_id=event.id, ip=ip)
        db.commit()
        response.set_cookie(cookie, ballot.token, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 30, path="/")
        return _ballot_out(db, ballot, event)
    if mode == "authenticated":
        user = actor.require_login()
        key = f"user:{user.id}"
        ballot = db.query(Ballot).filter(Ballot.event_id == event.id, Ballot.voter_key == key).one_or_none()
        ballot = ballot or _new_ballot(db, event, key, user.email, True, ip)
        db.commit()
        return _ballot_out(db, ballot, event)
    if mode == "link":
        ballot = db.query(Ballot).filter(Ballot.event_id == event.id, Ballot.token == (body.link_token or "")).one_or_none()
        if ballot is None:
            raise HTTPException(403, "This event uses voting links. Ask the organizer for yours.")
        return _ballot_out(db, ballot, event)
    if not body.email:
        raise HTTPException(422, "Enter your email to get a voting link")
    email = canonical_email(body.email)
    enforce(f"ballot-email:{email}", 3, 3600)
    key = f"email:{email}"
    ballot = db.query(Ballot).filter(Ballot.event_id == event.id, Ballot.voter_key == key).one_or_none()
    if ballot is None:
        ballot = _new_ballot(db, event, key, body.email.lower(), False, ip)
    link = f"{settings.public_url}/events/{event.slug}/vote?ballot={ballot.token}"
    send_mail(body.email, f"Your voting link for {event.name}", f"Open this link to confirm your email and vote:\n\n{link}\n\nIgnore this if you did not ask for it.")
    audit(db, action="ballot.email", summary="A voting link was emailed", event_id=event.id, ip=ip)
    db.commit()
    # The token is deliberately not returned: the only way in is the email.
    return {"status": "check_email", "email": body.email.lower()}


def _ballot(db: Session, token: str, lock: bool = False) -> tuple[Ballot, Event]:
    q = db.query(Ballot).filter(Ballot.token == token)
    # Casting locks the ballot row, so concurrent quadratic votes cannot overspend the budget.
    ballot = (q.with_for_update() if lock else q).one_or_none()
    if ballot is None:
        raise HTTPException(404, "Ballot not found")
    return ballot, db.get(Event, ballot.event_id)


@router.get("/ballots/{token}", summary="Ballot in its stored random order, with the voter's picks")
def get_ballot(token: str, db: DB):
    ballot, event = _ballot(db, token)
    if not ballot.confirmed and event.voting_access == "email_gated":
        ballot.confirmed = True  # opening the emailed link is the confirmation
        db.commit()
    return _ballot_out(db, ballot, event)


@router.post("/ballots/{token}/votes", summary="Cast, change or clear a vote (units=0 clears)")
def cast_vote(token: str, body: VoteIn, request: Request, db: DB, user: CurrentUser):
    ip = client_ip(request)
    enforce(f"vote:{ip}", settings.vote_rate_limit, settings.vote_rate_window_seconds)
    ballot, event = _ballot(db, token, lock=True)
    if event.archived or not voting_open(event):
        raise HTTPException(403, "Voting is closed")
    if not ballot.confirmed:
        raise HTTPException(403, "Confirm your email first")
    if str(body.submission_id) not in ballot.order:
        raise HTTPException(422, "That project is not on this ballot")
    existing = {v.submission_id: v for v in db.query(Vote).filter(Vote.ballot_id == ballot.id)}
    if event.vote_mode == "one_person_one_vote":
        for v in existing.values():
            db.delete(v)
        db.flush()  # the unit of work inserts before it deletes; the unique constraint needs the delete first
        if body.units > 0:
            db.add(Vote(ballot_id=ballot.id, event_id=event.id, submission_id=body.submission_id, units=1))
    else:
        spent = sum(v.units**2 for k, v in existing.items() if k != body.submission_id)
        if spent + body.units**2 > event.quadratic_budget:
            raise HTTPException(422, f"Not enough credits: {body.units} votes cost {body.units ** 2}, you have {event.quadratic_budget - spent} left")
        row = existing.get(body.submission_id)
        if body.units == 0 and row:
            db.delete(row)
        elif row:
            row.units = body.units
        elif body.units > 0:
            db.add(Vote(ballot_id=ballot.id, event_id=event.id, submission_id=body.submission_id, units=body.units))
    audit(db, action="vote.cast", summary=f"A ballot voted ({body.units} unit(s))", event_id=event.id, resource=str(ballot.id), ip=ip, actor=user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Duplicate vote") from exc
    return _ballot_out(db, ballot, event)


@router.post("/events/{event_id}/vote-links", summary="Mint single-use voting links (organizer, link mode)")
def mint_links(body: VoteLinksIn, request: Request, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    event = actor.event
    links = []
    for _ in range(body.count):
        ballot = _new_ballot(db, event, f"link:{uuid.uuid4().hex}", None, True, "")
        links.append(f"{settings.public_url}/events/{event.slug}/vote?ballot={ballot.token}")
    audit(db, action="ballot.links", summary=f"{user.display_name} minted {body.count} voting links", actor=user, event_id=event.id, ip=client_ip(request))
    db.commit()
    return {"links": links}


# --- comments ------------------------------------------------------------------------------------


def _comment_out(c: Comment) -> dict:
    return {"id": str(c.id), "author": c.author.display_name, "body": c.body, "created_at": iso(c.created_at), "hidden": c.hidden}


@router.get("/events/{event_id}/projects/{project_id}/comments", summary="Comments on a project (public)")
def list_comments(project_id: uuid.UUID, actor: ActorDep, db: DB):
    q = db.query(Comment).filter(Comment.event_id == actor.event.id, Comment.submission_id == project_id)
    if not actor.is_organizer:
        q = q.filter(Comment.hidden.is_(False))
    return [_comment_out(c) for c in q.order_by(Comment.created_at)]


@router.post("/events/{event_id}/projects/{project_id}/comments", summary="Comment on a project (signed in, rate limited)")
def post_comment(project_id: uuid.UUID, body: CommentIn, request: Request, actor: ActorDep, db: DB):
    user = actor.require_login()
    enforce(f"comment:{user.id}", settings.comment_rate_limit, 60)
    sub = db.get(Submission, project_id)
    if sub is None or sub.event_id != actor.event.id or sub.status != "submitted":
        raise HTTPException(404, "Project not found")
    text = body.body.strip()
    recent = db.query(Comment).filter(Comment.author_id == user.id, Comment.submission_id == project_id).order_by(Comment.created_at.desc()).first()
    if recent and recent.body == text:
        raise HTTPException(409, "You already posted that")
    c = Comment(event_id=actor.event.id, submission_id=project_id, author_id=user.id, body=text)
    db.add(c)
    audit(db, action="comment.create", summary=f"{user.display_name} commented on '{sub.title}'", actor=user, event_id=actor.event.id, resource=str(project_id), ip=client_ip(request))
    db.commit()
    db.refresh(c)
    return _comment_out(c)


@router.post("/events/{event_id}/comments/{comment_id}/hide", summary="Hide or restore a comment (organizer)")
def hide_comment(comment_id: uuid.UUID, actor: ActorDep, db: DB, hidden: bool = True):
    user = actor.require_organizer()
    c = db.get(Comment, comment_id)
    if c is None or c.event_id != actor.event.id:
        raise HTTPException(404, "Comment not found")
    c.hidden = hidden
    audit(db, action="comment.hide" if hidden else "comment.restore", summary=f"{user.display_name} {'hid' if hidden else 'restored'} a comment by {c.author.display_name}", actor=user, event_id=actor.event.id, resource=str(c.id))
    db.commit()
    return _comment_out(c)
