"""Judging: invites, assignment, scoring, isolation, live progress, normalization, results, pairwise."""

from __future__ import annotations

import math
import random
import secrets
import uuid
from collections import Counter, defaultdict

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import crowd_bt
from app import judging_math as jm
from app.assignment import blocked_ids, eligible_submissions, generate_assignments
from app.audit import audit
from app.config import settings
from app.deps import DB, ActorDep, CurrentUser, actor_for, client_ip
from app.mailer import send_mail
from app.models import (
    Assignment,
    AuditEvent,
    Ballot,
    EligibilityFlag,
    Event,
    EventRole,
    JudgeInvite,
    JudgeTrack,
    PairwiseComparison,
    PairwiseRun,
    Score,
    ScoreCell,
    Submission,
    SubmissionStatus,
    Team,
    Track,
    User,
    Vote,
)
from app.rbac import Actor
from app.routers.auth import start_session
from app.schemas import AssignIn, InviteAcceptIn, JudgeInviteIn, NormalizeIn, PairwiseIn, ScoreIn
from app.scoring import fit_pairwise, latest_run, review_rows, run_normalization, weighted
from app.security import UNCLAIMED, hash_password
from app.timeutil import is_past, iso, now
from app.views import results_visible, voting_open

router = APIRouter(prefix="/v1", tags=["Judging"])


# --- invites -------------------------------------------------------------------------------------


@router.post("/events/{event_id}/judge-invites", summary="Email judge invites via local SMTP (organizer)")
def invite_judges(body: JudgeInviteIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    event = actor.event
    valid_tracks = {t.id for t in event.tracks}
    if any(t not in valid_tracks for t in body.track_ids):
        raise HTTPException(422, "Unknown track")
    out = []
    for email in {e.lower() for e in body.emails}:
        token = secrets.token_urlsafe(16)
        db.add(JudgeInvite(event_id=event.id, email=email, token=token, track_ids=[str(t) for t in body.track_ids]))
        link = f"{settings.public_url}/judge-invite/{token}"
        send_mail(email, f"You're invited to judge {event.name}", f"Hi,\n\nYou have been invited to judge {event.name}.\n\nAccept here: {link}\n")
        out.append({"email": email, "link": link})
    audit(db, action="judge.invite", summary=f"{user.display_name} invited {len(out)} judge(s)", actor=user, event_id=event.id, payload={"emails": [o["email"] for o in out]})
    db.commit()
    return {"invited": out}


@router.get("/events/{event_id}/judge-invites", summary="Pending and accepted judge invites (organizer)")
def list_invites(actor: ActorDep, db: DB):
    actor.require_organizer()
    rows = db.query(JudgeInvite).filter(JudgeInvite.event_id == actor.event.id).order_by(JudgeInvite.created_at.desc())
    return [
        {
            "email": r.email,
            "track_ids": r.track_ids,
            "link": f"{settings.public_url}/judge-invite/{r.token}",
            "accepted_at": iso(r.accepted_at),
            "created_at": iso(r.created_at),
        }
        for r in rows
    ]


def _invite(db: Session, token: str) -> JudgeInvite:
    inv = db.query(JudgeInvite).filter(JudgeInvite.token == token).one_or_none()
    if inv is None:
        raise HTTPException(404, "This judge invite is invalid")
    return inv


@router.get("/judge-invites/{token}", summary="Preview a judge invite (public)")
def invite_preview(token: str, db: DB, user: CurrentUser):
    inv = _invite(db, token)
    event = db.get(Event, inv.event_id)
    account = db.query(User).filter(User.email == inv.email).one_or_none()
    return {
        "email": inv.email,
        "event": {"slug": event.slug, "name": event.name},
        "accepted": inv.accepted_at is not None,
        "needs_password": account is None or account.password_hash == UNCLAIMED,
        "signed_in_as": user.email if user else None,
    }


@router.post("/judge-invites/{token}/accept", summary="Accept a judge invite; sets a password for new accounts")
def accept_invite(token: str, body: InviteAcceptIn, response: Response, db: DB, user: CurrentUser):
    """The token was emailed to the invitee, so holding it proves control of that address."""
    inv = _invite(db, token)
    event = db.get(Event, inv.event_id)
    if event.archived:
        raise HTTPException(403, f"{event.name} is archived and read-only")
    account = db.query(User).filter(User.email == inv.email).one_or_none()
    if user is not None and user.email != inv.email:
        raise HTTPException(403, f"This invite is for {inv.email}. Sign out first.")
    if user is None:
        if account is not None and account.password_hash != UNCLAIMED:
            raise HTTPException(401, f"Sign in as {inv.email} to accept")
        if not body.password:
            raise HTTPException(422, "Choose a password (8+ characters)")
        if account is None:
            account = User(email=inv.email, display_name=body.display_name or inv.email.split("@")[0], password_hash="")
            db.add(account)
        account.password_hash = hash_password(body.password)
        if body.display_name:
            account.display_name = body.display_name
        if account.email_verified_at is None:
            from app.timeutil import now

            account.email_verified_at = now()
        db.flush()
        start_session(db, response, account)
        user = account
    judge_actor = actor_for(db, user, event)
    if judge_actor.team_id:
        raise HTTPException(409, "You are on a team in this event, so you cannot judge it")
    role = db.query(EventRole).filter(EventRole.event_id == event.id, EventRole.user_id == user.id).one_or_none()
    if role is None:
        role = EventRole(event_id=event.id, user_id=user.id, role="judge")
        db.add(role)
        db.flush()
    elif role.role not in ("organizer", "admin"):
        role.role = "judge"
    for tid in inv.track_ids:
        if not db.query(JudgeTrack).filter(JudgeTrack.role_id == role.id, JudgeTrack.track_id == uuid.UUID(tid)).first():
            db.add(JudgeTrack(role_id=role.id, track_id=uuid.UUID(tid)))
    inv.accepted_at = inv.accepted_at or now()
    audit(db, action="judge.join", summary=f"{user.display_name} accepted a judge invite", actor=user, event_id=event.id)
    db.commit()
    return {"event_slug": event.slug}


# --- assignment ----------------------------------------------------------------------------------


@router.post("/events/{event_id}/assignments", summary="Top up assignments to N reviews per project (organizer)")
def assign(body: AssignIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    try:
        batch, warnings = generate_assignments(db, actor.event, body.reviews_per_project)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    count = len(batch.assignments)
    audit(db, action="assignment.generate", summary=f"{user.display_name} generated {count} new assignments", actor=user, event_id=actor.event.id, resource=str(batch.id), payload={"warnings": warnings[:20]})
    db.commit()
    return {"batch_id": str(batch.id), "created": count, "warnings": warnings}


def _visible_assignment_query(db: Session, actor: Actor):
    q = db.query(Assignment).filter(Assignment.event_id == actor.event.id, Assignment.judge_id == actor.user.id)
    rows = [a for a in q if actor.sees_track(a.submission.track_id)]
    blocked = blocked_ids(db, actor.event.id)
    return [a for a in rows if a.submission_id not in blocked]


def _score_cells(score: Score | None) -> list[dict]:
    return [{"criterion_id": str(c.criterion_id), "value": c.value} for c in score.cells] if score else []


@router.get("/events/{event_id}/assignments/mine", summary="The judge's own queue (judge only)")
def my_queue(actor: ActorDep, db: DB):
    actor.require_judge()
    items = []
    scores = {s.submission_id: s for s in db.query(Score).filter(Score.event_id == actor.event.id, Score.judge_id == actor.user.id)}
    for a in sorted(_visible_assignment_query(db, actor), key=lambda a: (a.created_at, a.submission.title)):
        s = a.submission
        score = scores.get(s.id)
        items.append(
            {
                "assignment_id": str(a.id),
                "project": {
                    "id": str(s.id),
                    "title": s.title,
                    "summary": s.summary,
                    "description": s.description,
                    "repo_url": s.repo_url,
                    "live_link": s.live_link,
                    "demo_video_url": s.demo_video_url,
                    "track": s.track.name if s.track else None,
                    "team": s.team.name,
                },
                "score": {
                    "id": str(score.id),
                    "cells": _score_cells(score),
                    "comment": score.comment,
                    "submitted": score.submitted,
                    "weighted": score.raw_weighted,
                }
                if score
                else None,
            }
        )
    done = sum(1 for i in items if i["score"] and i["score"]["submitted"])
    return {
        "items": items,
        "progress": {"done": done, "total": len(items)},
        "judging_closed": is_past(actor.event.judging_deadline),
    }


@router.put("/events/{event_id}/assignments/{assignment_id}/score", summary="Save or submit a review (the assigned judge only)")
def put_score(assignment_id: uuid.UUID, body: ScoreIn, request: Request, actor: ActorDep, db: DB):
    user = actor.require_judge()
    event = actor.event
    # Lock the assignment first: every write to this review then queues behind one row lock,
    # so concurrent saves cannot take the review and audit locks in opposite orders.
    a = db.query(Assignment).filter(Assignment.id == assignment_id).with_for_update().one_or_none()
    # Someone else's assignment answers exactly like a missing one: no existence oracle.
    if a is None or a.event_id != event.id or a.judge_id != user.id or not actor.sees_track(a.submission.track_id):
        raise HTTPException(404, "Assignment not found")
    if is_past(event.judging_deadline):
        raise HTTPException(403, "Judging has closed for this event")
    if a.submission_id in blocked_ids(db, event.id):
        raise HTTPException(409, "This project is flagged and excluded from judging")
    rubric = event.rubric
    by_id = {c.id: c for c in rubric.criteria}
    by_key = {c.key: c for c in rubric.criteria}
    cells: dict[uuid.UUID, float] = {}
    for cell in body.cells:
        crit = by_id.get(cell.criterion_id) if cell.criterion_id else by_key.get(cell.key or "")
        if crit is None:
            raise HTTPException(422, "Unknown criterion")
        if not rubric.scale_min <= cell.value <= rubric.scale_max:
            raise HTTPException(422, f"{crit.name} must be between {rubric.scale_min} and {rubric.scale_max}")
        cells[crit.id] = float(cell.value)
    if body.submitted and set(cells) != set(by_id):
        raise HTTPException(422, "Score every criterion before submitting")
    score = db.query(Score).filter(Score.judge_id == user.id, Score.submission_id == a.submission_id).one_or_none()
    if score is None:
        score = Score(assignment_id=a.id, judge_id=user.id, submission_id=a.submission_id, event_id=event.id)
        db.add(score)
        db.flush()
    score.cells.clear()
    db.flush()
    for cid, v in cells.items():
        score.cells.append(ScoreCell(criterion_id=cid, value=v))
    score.raw_weighted = weighted(cells, rubric.criteria) if set(cells) == set(by_id) else None
    score.submitted = body.submitted
    score.comment = body.comment
    score.updated_at = now()
    verb = "submitted" if body.submitted else "saved a draft of"
    audit(db, action="score.submit" if body.submitted else "score.draft", summary=f"{user.display_name} {verb} a review for '{a.submission.title}'", actor=user, event_id=event.id, resource=str(score.id), ip=client_ip(request))
    db.commit()
    return {"id": str(score.id), "weighted": score.raw_weighted, "submitted": score.submitted}


# --- score reads: the isolation boundary ---------------------------------------------------------


def _resolve_judge(db: Session, event: Event, ref: str) -> uuid.UUID | None:
    """?judge= accepts a user UUID, a fixture id (jdg_01) or an email."""
    try:
        return uuid.UUID(ref)
    except ValueError:
        pass
    user = db.query(User).filter((User.external_id == ref) | (User.email == ref.lower())).first()
    return user.id if user else None


def _score_out(s: Score) -> dict:
    return {
        "id": str(s.id),
        "judge": {"id": str(s.judge_id), "name": s.judge.display_name, "external_id": s.judge.external_id},
        "project": {"id": str(s.submission_id), "title": s.submission.title, "external_id": s.submission.external_id},
        "cells": _score_cells(s),
        "weighted": s.raw_weighted,
        "comment": s.comment,
        "submitted": s.submitted,
        "updated_at": iso(s.updated_at),
    }


@router.get(
    "/events/{event_id}/scores",
    summary="Scores. Judges: only their own (asking for a peer is 403). Organizers: all.",
)
def list_scores(actor: ActorDep, db: DB, judge: str | None = None, project: uuid.UUID | None = None):
    user = actor.require_score_reader()
    judge_id = None
    if judge is not None:
        judge_id = _resolve_judge(db, actor.event, judge)
        if not actor.may_read_judge(judge_id):
            raise HTTPException(403, "Judges can only read their own scores")
    elif not actor.is_organizer:
        judge_id = user.id
    if judge_id is None and judge is not None:
        return []
    rows = review_rows(db, actor.event.id, judge_id, project)
    return [
        {
            "id": str(r["id"]),
            "judge": {"id": str(r["judge_id"]), "name": r["judge_name"], "external_id": r["judge_external_id"]},
            "project": {"id": str(r["project_id"]), "title": r["title"], "external_id": r["project_external_id"]},
            "cells": r["cells"],
            "weighted": r["weighted"],
            "comment": r["comment"],
            "submitted": r["submitted"],
            "updated_at": iso(r["updated_at"]),
        }
        for r in rows
        if actor.sees_track(r["track_id"])
    ]


@router.get("/events/{event_id}/scores/{score_id}", summary="One review (its judge or an organizer; others get 404)")
def get_score(score_id: uuid.UUID, actor: ActorDep, db: DB):
    actor.require_score_reader()
    s = db.get(Score, score_id)
    if s is None or s.event_id != actor.event.id or not actor.may_read_judge(s.judge_id):
        raise HTTPException(404, "Score not found")
    return _score_out(s)


# --- organizer dashboard -------------------------------------------------------------------------


@router.get("/events/{event_id}/dashboard", summary="Live progress, coverage and integrity flags (organizer)")
def dashboard(actor: ActorDep, db: DB):
    """Polled every few seconds by the organizer console, so every number is an aggregate query:
    no review, cell or project is loaded as an object (2 000 projects / 10 000 reviews in well under a second)."""
    actor.require_organizer()
    event = actor.event
    blocked = blocked_ids(db, event.id)
    eligible = [
        (sid, title)
        for sid, title in db.query(Submission.id, Submission.title).filter(
            Submission.event_id == event.id, Submission.status == SubmissionStatus.submitted.value
        )
        if sid not in blocked
    ]
    eligible_ids = {sid for sid, _ in eligible}
    roles = (
        db.query(User.id, User.display_name, User.email, User.external_id)
        .join(EventRole, EventRole.user_id == User.id)
        .filter(EventRole.event_id == event.id, EventRole.role == "judge")
        .all()
    )
    assigned: Counter = Counter()
    for judge_id, sid, n in (
        db.query(Assignment.judge_id, Assignment.submission_id, func.count())
        .filter(Assignment.event_id == event.id)
        .group_by(Assignment.judge_id, Assignment.submission_id)
    ):
        if sid in eligible_ids:
            assigned[judge_id] += n
    done: Counter = Counter()
    drafts: Counter = Counter()
    last: dict = {}
    sums: dict = defaultdict(lambda: [0.0, 0, math.inf, -math.inf])  # sum, n, min, max of submitted totals
    reviews: Counter = Counter()
    for judge_id, sid, submitted, weighted, updated in db.query(
        Score.judge_id, Score.submission_id, Score.submitted, Score.raw_weighted, Score.updated_at
    ).filter(Score.event_id == event.id):
        if sid not in eligible_ids:
            continue
        if last.get(judge_id) is None or updated > last[judge_id]:
            last[judge_id] = updated
        if not submitted:
            drafts[judge_id] += 1
            continue
        done[judge_id] += 1
        reviews[sid] += 1
        if weighted is not None:
            acc = sums[judge_id]
            acc[0] += weighted
            acc[1] += 1
            acc[2] = min(acc[2], weighted)
            acc[3] = max(acc[3], weighted)
    constant = {j for j, (_, n, lo, hi) in sums.items() if n >= jm.CONSTANT_RATER_MIN_REVIEWS and hi - lo < 1e-9}
    judges = []
    for uid, name, email, external_id in roles:
        a, d = assigned[uid], done[uid]
        acc = sums.get(uid)
        total, n = (acc[0], acc[1]) if acc else (0.0, 0)
        judges.append(
            {
                "judge_id": str(uid),
                "name": name,
                "email": email,
                "external_id": external_id,
                "assigned": a,
                "completed": d,
                "drafts": drafts[uid],
                "status": "done" if a and d >= a else "not_started" if d == 0 and drafts[uid] == 0 else "in_progress",
                "last_activity": iso(last.get(uid)),
                "mean_score": round(total / n, 3) if n else None,
                "constant_rater": uid in constant,
            }
        )
    judges.sort(key=lambda j: (j["status"] == "done", j["completed"] / j["assigned"] if j["assigned"] else 1, j["name"]))
    coverage = Counter(reviews.get(sid, 0) for sid, _ in eligible)
    target = event.reviews_per_project
    flags = (
        db.query(EligibilityFlag.submission_id, Submission.title, EligibilityFlag.duplicate_of_id, EligibilityFlag.reason)
        .join(Submission, Submission.id == EligibilityFlag.submission_id)
        .filter(Submission.event_id == event.id, EligibilityFlag.code == "duplicate")
        .all()
    )
    shared_ip = sum(
        n
        for _, n in db.query(Ballot.ip_hash, func.count())
        .filter(Ballot.event_id == event.id, Ballot.ip_hash != "")
        .group_by(Ballot.ip_hash)
        if n > 3
    )
    activity = db.query(AuditEvent).filter(AuditEvent.event_id == event.id).order_by(AuditEvent.seq.desc()).limit(15).all()
    total_assigned = sum(assigned.values())
    submitted_total = sum(done.values())
    run = latest_run(db, event.id)
    return {
        "generated_at": iso(now()),
        "kpis": {
            "projects": len(eligible),
            "judges": len(roles),
            "reviews_submitted": submitted_total,
            "reviews_assigned": total_assigned,
            "completion": round(submitted_total / total_assigned, 4) if total_assigned else 0,
            "judges_not_started": sum(1 for j in judges if j["status"] == "not_started"),
            "projects_below_target": sum(1 for sid, _ in eligible if reviews.get(sid, 0) < target),
            "votes": db.query(func.count(Vote.id)).filter(Vote.event_id == event.id).scalar(),
        },
        "judges": judges,
        "coverage": {"target": target, "histogram": [{"reviews": k, "projects": coverage[k]} for k in sorted(coverage)]},
        "integrity": {
            "constant_raters": [j for j in judges if j["constant_rater"]],
            "duplicates": [
                {"project_id": str(sid), "title": title, "duplicate_of": str(dup) if dup else None, "reason": reason}
                for sid, title, dup, reason in flags
            ],
            "under_reviewed": sorted(
                [{"project_id": str(sid), "title": title, "reviews": reviews.get(sid, 0)} for sid, title in eligible if reviews.get(sid, 0) < target],
                key=lambda r: r["reviews"],
            ),
            "shared_ip_ballots": shared_ip,
            "outlier_reviews": len(run.notes.get("outliers", [])) if run else 0,
        },
        "activity": [{"seq": r.seq, "summary": r.summary, "action": r.action, "at": iso(r.created_at)} for r in activity],
    }


# --- normalization and results -------------------------------------------------------------------


def _run_out(db: Session, run) -> dict:
    subs = {
        sid: (title, track, team)
        for sid, title, track, team in db.query(Submission.id, Submission.title, Track.name, Team.name)
        .join(Team, Team.id == Submission.team_id)
        .outerjoin(Track, Track.id == Submission.track_id)
        .filter(Submission.event_id == run.event_id)
    }
    ids = set(run.notes.get("judge_offsets", {})) | set(run.notes.get("excluded_judges", []))
    judges = {str(u.id): u for u in db.query(User).filter(User.id.in_([uuid.UUID(j) for j in ids]))}
    return {
        "id": str(run.id),
        "method": run.method,
        "params": run.params,
        "created_at": iso(run.created_at),
        "mu": run.notes.get("mu"),
        "sigma": run.notes.get("sigma"),
        "reviews_used": run.notes.get("reviews_used"),
        "cross_check": run.notes.get("cross_check"),
        "judge_offsets": [
            {"judge_id": j, "name": judges[j].display_name if j in judges else j, "offset": off, "excluded": j in run.notes.get("excluded_judges", [])}
            for j, off in run.notes.get("judge_offsets", {}).items()
        ],
        "excluded_judges": [
            {"judge_id": j, "name": judges[j].display_name if j in judges else j} for j in run.notes.get("excluded_judges", [])
        ],
        "outliers": [
            {
                "judge_id": o["judge"],
                "judge": judges[o["judge"]].display_name if o["judge"] in judges else o["judge"],
                "project_id": o["project"],
                "title": subs[uuid.UUID(o["project"])][0] if uuid.UUID(o["project"]) in subs else "",
                "residual": o["residual"],
                "z": o["z"],
            }
            for o in run.notes.get("outliers", [])
        ],
        "rows": [
            {
                "rank": r.rank,
                "raw_rank": r.raw_rank,
                "rank_delta": r.rank_delta,
                "project": {
                    "id": str(r.submission_id),
                    "title": subs.get(r.submission_id, ("", None, ""))[0],
                    "track": subs.get(r.submission_id, ("", None, ""))[1],
                    "team": subs.get(r.submission_id, ("", None, ""))[2],
                },
                "n_reviews": r.n_reviews,
                "raw_mean": r.raw_mean,
                "adjusted": r.adjusted,
                "std_error": r.std_error,
            }
            for r in run.rows
        ],
    }


@router.post("/events/{event_id}/normalization", summary="Run the judge-offset normalization (organizer)")
def normalize(body: NormalizeIn, actor: ActorDep, db: DB):
    user = actor.require_organizer()
    run = run_normalization(db, actor.event, user, body.lambda_judge, body.lambda_project, body.drop_constant_raters)
    audit(db, action="normalization.run", summary=f"{user.display_name} ran normalization on {run.notes['reviews_used']} reviews", actor=user, event_id=actor.event.id, resource=str(run.id), payload=run.params)
    db.commit()
    db.refresh(run)
    return _run_out(db, run)


@router.get("/events/{event_id}/normalization", summary="Latest normalization run (organizer)")
def latest_normalization(actor: ActorDep, db: DB):
    actor.require_organizer()
    run = latest_run(db, actor.event.id)
    if run is None:
        raise HTTPException(404, "No normalization run yet")
    return _run_out(db, run)


def vote_tally(db: Session, event: Event) -> list[dict]:
    counts: Counter = Counter()
    for v in db.query(Vote).join(Ballot, Ballot.id == Vote.ballot_id).filter(Vote.event_id == event.id, Ballot.confirmed.is_(True)):
        counts[v.submission_id] += v.units
    subs = {s.id: s.title for s in db.query(Submission).filter(Submission.event_id == event.id)}
    return [{"project_id": str(k), "title": subs.get(k, ""), "votes": n} for k, n in counts.most_common()]


@router.get("/events/{event_id}/results", summary="Final ranking. 403 until published and voting has closed (organizers always)")
def results(actor: ActorDep, db: DB):
    event = actor.event
    if not results_visible(event, actor):
        reason = "voting is still open" if voting_open(event) else "the organizer has not published them"
        raise HTTPException(403, f"Results are hidden: {reason}")
    out: dict = {"published": event.results_published, "judging_mode": event.judging_mode, "prizes": [p.name for p in event.prizes]}
    run = latest_run(db, event.id)
    out["judging"] = _run_out(db, run) if run else None
    if event.judging_mode == "pairwise":
        pr = db.query(PairwiseRun).filter(PairwiseRun.event_id == event.id).order_by(PairwiseRun.created_at.desc()).first()
        out["pairwise"] = {"ranking": pr.ranking, "params": pr.params} if pr else None
    out["popular_vote"] = vote_tally(db, event) if not voting_open(event) or actor.is_organizer else []
    if not actor.is_organizer and out["judging"]:
        # Public results show the ranking and the adjustment, never who gave what.
        out["judging"].pop("judge_offsets", None)
        out["judging"].pop("excluded_judges", None)
        out["judging"].pop("outliers", None)
    return out


# --- pairwise ------------------------------------------------------------------------------------


def _pairwise_items(db: Session, actor: Actor) -> list[str]:
    return [str(s.id) for s in eligible_submissions(db, actor.event.id) if actor.sees_track(s.track_id)]


@router.get("/events/{event_id}/pairwise/next", summary="Next pair: least-compared project vs one this judge has not paired it with (judge)")
def pairwise_next(actor: ActorDep, db: DB):
    user = actor.require_judge()
    items = _pairwise_items(db, actor)
    comps = (
        db.query(PairwiseComparison)
        .filter(PairwiseComparison.event_id == actor.event.id)
        .order_by(PairwiseComparison.created_at, PairwiseComparison.id)
        .all()
    )
    counts: Counter = Counter()
    for c in comps:
        counts[str(c.winner_id)] += 1
        counts[str(c.loser_id)] += 1
    mine = [c for c in comps if c.judge_id == user.id]
    seen = {tuple(sorted((str(c.winner_id), str(c.loser_id)))) for c in mine}
    pair = crowd_bt.choose_pair(items, counts, seen, random.Random())
    if pair is None:
        return {"done": True, "compared": len(mine)}
    subs = {str(s.id): s for s in db.query(Submission).filter(Submission.id.in_([uuid.UUID(p) for p in pair]))}

    def card(pid: str) -> dict:
        s = subs[pid]
        return {"id": pid, "title": s.title, "summary": s.summary, "track": s.track.name if s.track else None, "repo_url": s.repo_url}

    return {"done": False, "left": card(pair[0]), "right": card(pair[1]), "compared": len(mine), "possible": len(items) * (len(items) - 1) // 2}


@router.post("/events/{event_id}/pairwise", summary="Record a pairwise decision (judge)")
def pairwise_decide(body: PairwiseIn, actor: ActorDep, db: DB):
    user = actor.require_judge()
    items = set(_pairwise_items(db, actor))
    if str(body.winner_id) not in items or str(body.loser_id) not in items or body.winner_id == body.loser_id:
        raise HTTPException(422, "Both projects must be distinct and in your tracks")
    db.add(PairwiseComparison(event_id=actor.event.id, judge_id=user.id, winner_id=body.winner_id, loser_id=body.loser_id))
    audit(db, action="pairwise.decide", summary=f"{user.display_name} recorded a pairwise comparison", actor=user, event_id=actor.event.id)
    db.commit()
    return {"ok": True}


@router.post("/events/{event_id}/pairwise/fit", summary="Fit Bradley-Terry to all comparisons (organizer)")
def pairwise_fit(actor: ActorDep, db: DB):
    user = actor.require_organizer()
    run = fit_pairwise(db, actor.event)
    audit(db, action="pairwise.fit", summary=f"{user.display_name} fitted Bradley-Terry on {run.params['comparisons']} comparisons", actor=user, event_id=actor.event.id)
    db.commit()
    return {"id": str(run.id), "params": run.params, "ranking": run.ranking, "created_at": iso(run.created_at)}


@router.get("/events/{event_id}/pairwise", summary="Latest Bradley-Terry fit (organizer)")
def pairwise_latest(actor: ActorDep, db: DB):
    actor.require_organizer()
    run = db.query(PairwiseRun).filter(PairwiseRun.event_id == actor.event.id).order_by(PairwiseRun.created_at.desc()).first()
    if run is None:
        raise HTTPException(404, "No pairwise fit yet")
    return {"id": str(run.id), "params": run.params, "ranking": run.ranking, "created_at": iso(run.created_at)}
