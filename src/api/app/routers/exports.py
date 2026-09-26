"""CSV and JSON export, bulk import, and the readable, verifiable audit log."""

from __future__ import annotations

import csv
import io
import json
import uuid
import zipfile

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import Response

from app import signing
from app.audit import audit, verify_chain
from app.config import settings
from app.deps import DB, ActorDep, RequiredUser, actor_for
from app.importer import FixtureError, export_fixture, import_fixture, import_projects_csv
from app.models import Assignment, AuditEvent, EligibilityFlag, EventRole, JudgeTrack, Membership, NormalizationRun, Score, SignedRecord, Submission, Team, Track, User
from app.rbac import Actor
from app.routers.judging import _run_out as run_out, vote_tally
from app.scoring import latest_run, review_rows, run_normalization
from app.timeutil import iso, now
from app.views import event_detail, results_visible

router = APIRouter(prefix="/v1", tags=["Import and export"])

# One CSV per FIG.01 stage: registration, teams, submissions, eligibility, assignment, scoring,
# normalization, results (+ votes), certificates, and the audit trail that spans them all.
KINDS = (
    "registrations", "teams", "submissions", "eligibility", "judges", "assignments", "scores",
    "normalization", "results", "votes", "records", "audit",
)


def _csv(rows: list[list]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(rows)
    return buf.getvalue()


def _fmt(v: float | None) -> str:
    return "" if v is None else f"{v:.4f}"


def _rows(db, actor: Actor, kind: str) -> list[list]:
    event = actor.event
    subs = {s.id: s for s in db.query(Submission).filter(Submission.event_id == event.id)}
    ref = lambda row: row.external_id or str(row.id)  # noqa: E731
    if kind == "results":
        run = latest_run(db, event.id)
        rows = [["rank", "project_id", "title", "team", "track", "reviews", "raw_mean", "adjusted_score", "std_error", "raw_rank", "rank_change"]]
        for r in run.rows if run else []:
            s = subs[r.submission_id]
            rows.append([r.rank, ref(s), s.title, s.team.name, s.track.name if s.track else "", r.n_reviews, _fmt(r.raw_mean), _fmt(r.adjusted), _fmt(r.std_error), r.raw_rank, r.rank_delta])
        return rows
    if kind == "scores":
        criteria = event.rubric.criteria if event.rubric else []
        rows = [["judge_id", "judge", "project_id", "title", *[c.key for c in criteria], "weighted", "submitted", "comment"]]
        for r in review_rows(db, event.id, None if actor.is_organizer else actor.user.id):
            cells = {c["criterion_id"]: c["value"] for c in r["cells"]}
            rows.append([
                r["judge_external_id"] or str(r["judge_id"]), r["judge_name"], r["project_external_id"] or str(r["project_id"]), r["title"],
                *[cells.get(str(c.id), "") for c in criteria], _fmt(r["weighted"]), r["submitted"], r["comment"],
            ])
        return rows
    if kind == "submissions":
        rows = [["project_id", "title", "summary", "team", "track", "status", "repo_url", "live_link", "demo_video_url", "submitted_at", "flags"]]
        for s in subs.values():
            rows.append([ref(s), s.title, s.summary, s.team.name, s.track.name if s.track else "", s.status, s.repo_url, s.live_link, s.demo_video_url, iso(s.submitted_at) or "", ";".join(f.code for f in s.flags)])
        return rows
    if kind == "teams":
        rows = [["team_id", "name", "members"]]
        for t in db.query(Team).filter(Team.event_id == event.id):
            rows.append([ref(t), t.name, ";".join(m.user.email for m in t.memberships)])
        return rows
    if kind == "judges":
        tracks = {t.id: t.name for t in db.query(Track).filter(Track.event_id == event.id)}
        rows = [["judge_id", "name", "email", "tracks", "assigned", "submitted"]]
        for role, u in db.query(EventRole, User).join(User, User.id == EventRole.user_id).filter(EventRole.event_id == event.id, EventRole.role == "judge"):
            jt = [tracks.get(t.track_id, "") for t in db.query(JudgeTrack).filter(JudgeTrack.role_id == role.id)]
            assigned = db.query(Assignment).filter(Assignment.event_id == event.id, Assignment.judge_id == u.id).count()
            done = db.query(Score).filter(Score.event_id == event.id, Score.judge_id == u.id, Score.submitted.is_(True)).count()
            rows.append([u.external_id or str(u.id), u.display_name, u.email, ";".join(jt), assigned, done])
        return rows
    if kind == "assignments":
        rows = [["assignment_id", "judge_id", "project_id", "batch_kind", "created_at"]]
        for a in db.query(Assignment).filter(Assignment.event_id == event.id):
            judge = db.get(User, a.judge_id)
            rows.append([str(a.id), judge.external_id or str(judge.id), ref(subs[a.submission_id]), a.batch.kind, iso(a.created_at)])
        return rows
    if kind == "registrations":
        rows = [["user_id", "name", "email", "role", "team", "tracks", "account_claimed"]]
        teams = {m.user_id: m.team.name for m in db.query(Membership).join(Team, Team.id == Membership.team_id).filter(Team.event_id == event.id)}
        tracks = {t.id: t.name for t in db.query(Track).filter(Track.event_id == event.id)}
        for role, u in db.query(EventRole, User).join(User, User.id == EventRole.user_id).filter(EventRole.event_id == event.id).order_by(EventRole.role, User.display_name):
            jt = ";".join(tracks.get(t.track_id, "") for t in role.judge_tracks)
            rows.append([u.external_id or str(u.id), u.display_name, u.email, role.role, teams.get(u.id, ""), jt, u.password_hash != "!"])
        return rows
    if kind == "eligibility":
        rows = [["project_id", "title", "flag", "reason", "duplicate_of", "blocks_judging", "flagged_at"]]
        for f in db.query(EligibilityFlag).join(Submission, Submission.id == EligibilityFlag.submission_id).filter(Submission.event_id == event.id):
            dup = subs.get(f.duplicate_of_id)
            rows.append([ref(f.submission), f.submission.title, f.code, f.reason, ref(dup) if dup else "", f.blocks_judging, iso(f.created_at)])
        return rows
    if kind == "normalization":
        run = latest_run(db, event.id)
        rows = [["run_id", "created_at", "method", "lambda_judge", "lambda_project", "drop_constant_raters", "mu", "sigma", "judge_id", "judge", "offset", "excluded"]]
        if run:
            names = {str(u.id): u for u in db.query(User).filter(User.id.in_([uuid.UUID(j) for j in {*run.notes.get("judge_offsets", {}), *run.notes.get("excluded_judges", [])}]))}
            excluded = set(run.notes.get("excluded_judges", []))
            p = run.params
            head = [str(run.id), iso(run.created_at), run.method, p.get("lambda_judge"), p.get("lambda_project"), p.get("drop_constant_raters"), _fmt(run.notes.get("mu")), _fmt(run.notes.get("sigma"))]
            for j, off in run.notes.get("judge_offsets", {}).items():
                rows.append([*head, names[j].external_id or j, names[j].display_name, _fmt(off), False])
            for j in excluded:
                rows.append([*head, names[j].external_id or j, names[j].display_name, "", True])
        return rows
    if kind == "records":
        rows = [["record_id", "kind", "subject", "email_sha256", "issued_at", "key_id", "revoked", "verify_url"]]
        for r in db.query(SignedRecord).filter(SignedRecord.event_id == event.id).order_by(SignedRecord.created_at):
            rows.append([str(r.id), r.kind, r.payload["subject"]["name"], r.payload["subject"]["email_sha256"], r.payload["issued_at"], r.key_id, r.revoked, f"{settings.public_url}/verify?record={r.id}"])
        return rows
    if kind == "votes":
        return [["project_id", "title", "votes"]] + [[t["project_id"], t["title"], t["votes"]] for t in vote_tally(db, event)]
    rows = [["seq", "created_at", "actor", "action", "summary", "resource", "hash"]]
    for r in db.query(AuditEvent).filter(AuditEvent.event_id == event.id).order_by(AuditEvent.seq):
        rows.append([r.seq, iso(r.created_at), r.actor_name, r.action, r.summary, r.resource, r.hash])
    return rows


@router.get(
    "/events/{event_id}/export/{kind}.csv",
    summary="CSV export: results, scores, submissions, teams, judges, assignments, votes, audit",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}},
)
def export_csv(kind: str, actor: ActorDep, db: DB):
    if kind not in KINDS:
        raise HTTPException(404, f"Unknown export. Try one of: {', '.join(KINDS)}")
    if kind == "scores":
        actor.require_score_reader()  # judges export only their own rows
    elif kind == "votes" and not results_visible(actor.event, actor):
        raise HTTPException(403, "Vote tallies are hidden until results are published")
    elif kind != "votes":
        actor.require_organizer()
    body = _csv(_rows(db, actor, kind))
    return Response(
        body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{actor.event.slug}-{kind}.csv"'},
    )


ARCHIVE_README = """Portal event archive: {name} ({slug})
Exported {at}. Every stage of the event, in files that need no Portal to read.

export.json            the event in Dogfood fixtures.json shape; re-import with POST /v1/import
csv/<stage>.csv        one CSV per stage: {kinds}
normalization-runs.json every normalization run, parameters and rows (results cite a run)
audit.jsonl            the hash-chained audit log, one entry per line; recompute with the rule in audit.py
signing-key.pem        public key for every signed record in csv/records.csv (Ed25519)
"""


@router.get("/events/{event_id}/archive.zip", summary="Everything about the event in one zip: every stage as CSV, JSON, audit chain, key (organizer)", response_class=Response, responses={200: {"content": {"application/zip": {}}}})
def archive_zip(actor: ActorDep, db: DB):
    actor.require_organizer()
    event = actor.event
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.txt", ARCHIVE_README.format(name=event.name, slug=event.slug, at=iso(now()), kinds=", ".join(KINDS)))
        z.writestr("export.json", json.dumps(export_fixture(db, event), indent=2, ensure_ascii=False))
        for kind in KINDS:
            z.writestr(f"csv/{kind}.csv", _csv(_rows(db, actor, kind)))
        runs = db.query(NormalizationRun).filter(NormalizationRun.event_id == event.id).order_by(NormalizationRun.created_at)
        z.writestr("normalization-runs.json", json.dumps([run_out(db, r) for r in runs], indent=2, ensure_ascii=False))
        audit_rows = db.query(AuditEvent).filter(AuditEvent.event_id == event.id).order_by(AuditEvent.seq)
        entries = (
            {"seq": r.seq, "at": iso(r.created_at), "actor": r.actor_name, "action": r.action, "summary": r.summary,
             "resource": r.resource, "payload": r.payload, "prev_hash": r.prev_hash, "hash": r.hash}
            for r in audit_rows
        )
        z.writestr("audit.jsonl", "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in entries))
        z.writestr("signing-key.pem", signing.public_pem())
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{event.slug}-archive.zip"'})


@router.get("/events/{event_id}/export.json", summary="Whole event in fixtures.json shape (organizer)")
def export_json(actor: ActorDep, db: DB):
    actor.require_organizer()
    return export_fixture(db, actor.event)


@router.post("/import", summary="Create an event from a fixtures.json-shaped document; you become its organizer")
def import_json(request: Request, db: DB, user: RequiredUser, data: dict = Body(...)):
    try:
        event, stats = import_fixture(db, data, organizer=user)
    except (FixtureError, KeyError, TypeError, ValueError) as exc:
        db.rollback()
        raise HTTPException(422, f"Import failed: {exc}") from exc
    run_normalization(db, event, user)
    audit(db, action="import.fixture", summary=f"{user.display_name} imported {event.name}: {stats['projects']} projects, {stats['scores']} scores", actor=user, event_id=event.id, payload=stats)
    db.commit()
    return {"event": event_detail(db, event, actor_for(db, user, event)), "stats": stats}


@router.post("/events/{event_id}/import/projects.csv", summary="Bulk add projects from CSV (organizer)")
def import_csv(actor: ActorDep, db: DB, body: str = Body(..., media_type="text/csv")):
    user = actor.require_organizer()
    try:
        stats = import_projects_csv(db, actor.event, body)
    except (FixtureError, KeyError, ValueError) as exc:
        db.rollback()
        raise HTTPException(422, f"Import failed: {exc}") from exc
    audit(db, action="import.csv", summary=f"{user.display_name} imported {stats['projects']} projects from CSV", actor=user, event_id=actor.event.id, payload=stats)
    db.commit()
    return stats


@router.get("/events/{event_id}/audit", summary="Readable audit log, newest first (organizer)")
def audit_log(actor: ActorDep, db: DB, action: str | None = None, before: int | None = None, limit: int = 100):
    actor.require_organizer()
    q = db.query(AuditEvent).filter(AuditEvent.event_id == actor.event.id)
    if action:
        q = q.filter(AuditEvent.action.startswith(action))
    if before:
        q = q.filter(AuditEvent.seq < before)
    rows = q.order_by(AuditEvent.seq.desc()).limit(min(limit, 500)).all()
    return [
        {
            "seq": r.seq,
            "at": iso(r.created_at),
            "actor": r.actor_name,
            "action": r.action,
            "summary": r.summary,
            "resource": r.resource,
            "payload": r.payload,
            "hash": r.hash,
            "prev_hash": r.prev_hash,
        }
        for r in rows
    ]


@router.get("/events/{event_id}/audit/verify", summary="Recompute the audit hash chain (organizer)")
def audit_verify(actor: ActorDep, db: DB):
    actor.require_organizer()
    return verify_chain(db)

