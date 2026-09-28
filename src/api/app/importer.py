"""Bulk import and export in the Dogfood fixtures.json shape.

The seed uses this exact code path, so what organizers import is what judges saw in the demo.
Round trip: export_fixture(import_fixture(x)) == x, up to list order (tests/api/test_import_export.py).
"""

from __future__ import annotations

import csv
import io
import re
import secrets
import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    Assignment,
    AssignmentBatch,
    Criterion,
    EligibilityFlag,
    Event,
    EventRole,
    ImportJob,
    InviteLink,
    JudgeTrack,
    Membership,
    Rubric,
    Score,
    ScoreCell,
    Submission,
    SubmissionStatus,
    Team,
    Track,
    User,
)
from app.scoring import weighted
from app.security import UNCLAIMED
from app.timeutil import iso, now


class FixtureError(ValueError):
    pass


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:70] or "event"


def unique_slug(db: Session, base: str) -> str:
    slug, n = base, 2
    while db.query(Event.id).filter(Event.slug == slug).first():
        slug, n = f"{base}-{n}", n + 1
    return slug


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _require(data: dict, key: str, kind: type) -> object:
    value = data.get(key)
    if not isinstance(value, kind):
        raise FixtureError(f"fixture field '{key}' must be a {kind.__name__}")
    return value


def _user(db: Session, email: str, name: str, password_hash: str, external_id: str | None = None) -> User:
    email = email.strip().lower()
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None:
        user = User(
            id=uuid.uuid4(),
            email=email,
            display_name=name,
            password_hash=password_hash,
            external_id=external_id,
            email_verified_at=now(),
        )
        db.add(user)
        db.flush()  # later rows look this user up by email
    elif external_id and not user.external_id:
        user.external_id = external_id
    if user.email_verified_at is None:
        user.email_verified_at = now()
    return user


def _role(db: Session, event_id: uuid.UUID, user_id: uuid.UUID, role: str) -> EventRole:
    row = db.query(EventRole).filter(EventRole.event_id == event_id, EventRole.user_id == user_id).one_or_none()
    if row is None:
        row = EventRole(event_id=event_id, user_id=user_id, role=role)
        db.add(row)
        db.flush()
    return row


class People:
    """Users and roles for one import, looked up once instead of one query per person."""

    def __init__(self, db: Session, event_id: uuid.UUID, emails: set[str], password_hash: str):
        self.db, self.event_id, self.password_hash = db, event_id, password_hash
        emails = {e.strip().lower() for e in emails}
        self.users: dict[str, User] = {}
        chunk = sorted(emails)
        for k in range(0, len(chunk), 500):
            for u in db.query(User).filter(User.email.in_(chunk[k : k + 500])):
                self.users[u.email] = u
        self.roles = {r.user_id: r for r in db.query(EventRole).filter(EventRole.event_id == event_id)}

    def user(self, email: str, name: str, external_id: str | None = None) -> User:
        email = email.strip().lower()
        u = self.users.get(email)
        if u is None:
            u = User(
                id=uuid.uuid4(),
                email=email,
                display_name=name,
                password_hash=self.password_hash,
                external_id=external_id,
                email_verified_at=now(),
            )
            self.db.add(u)
            self.users[email] = u
        elif external_id and not u.external_id:
            u.external_id = external_id
        if u.email_verified_at is None:
            u.email_verified_at = now()
        return u

    def role(self, user: User, role: str) -> EventRole:
        r = self.roles.get(user.id)
        if r is None:
            r = EventRole(id=uuid.uuid4(), event_id=self.event_id, user_id=user.id, role=role)
            self.db.add(r)
            self.roles[user.id] = r
        return r


def normalize_url(url: str) -> str:
    return re.sub(r"(\.git)?/*$", "", url.strip().lower().replace("http://", "https://").replace("www.", ""))


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]", "", title.lower())


def detect_duplicates(db: Session, event: Event) -> list[EligibilityFlag]:
    """Same repo URL or same title (ignoring case/punctuation) within an event.

    The earliest submission is canonical; later ones get a blocking `duplicate` flag that
    points at it. Nothing is deleted: the organizer can clear the flag if it is a false positive.
    """
    subs = (
        db.query(Submission)
        .filter(Submission.event_id == event.id, Submission.status == SubmissionStatus.submitted.value)
        .order_by(Submission.submitted_at, Submission.created_at)
        .all()
    )
    flagged = {f.submission_id for s in subs for f in s.flags if f.code in ("duplicate", "cleared:duplicate")}
    seen: dict[str, Submission] = {}
    created = []
    for s in subs:
        keys = [f"title:{normalize_title(s.title)}"] + ([f"repo:{normalize_url(s.repo_url)}"] if s.repo_url else [])
        original = next((seen[k] for k in keys if k in seen), None)
        if original is not None and s.id not in flagged:
            why = [k.split(":")[0] for k in keys if seen.get(k) is original]
            flag = EligibilityFlag(
                submission_id=s.id,
                code="duplicate",
                duplicate_of_id=original.id,
                reason=f"Same {' and '.join(why)} as '{original.title}' submitted earlier",
                blocks_judging=True,
            )
            db.add(flag)
            created.append(flag)
        for k in keys:
            seen.setdefault(k, s)
    db.flush()
    return created


def import_fixture(
    db: Session,
    data: dict,
    *,
    organizer: User | None = None,
    password_hash: str = UNCLAIMED,
    slug: str | None = None,
) -> tuple[Event, dict]:
    ev = _require(data, "event", dict)
    tracks_in = data.get("tracks") or []
    judges_in = data.get("judges") or []
    teams_in = data.get("teams") or []
    projects_in = data.get("projects") or []
    scores_in = data.get("scores") or []
    ext = str(ev.get("id") or "")
    if ext and db.query(Event.id).filter(Event.external_id == ext).first():
        raise FixtureError(f"event {ext} was already imported")

    event = Event(
        slug=unique_slug(db, slug or slugify(ev.get("name", "event"))),
        external_id=ext or None,
        name=ev.get("name", "Imported event"),
        tagline=ev.get("tagline", ""),
        submissions_deadline=_dt(ev.get("submissions_close")),
    )
    db.add(event)
    db.flush()
    people = People(
        db,
        event.id,
        {j["email"] for j in judges_in} | {m for t in teams_in for m in (t.get("members") or [])},
        password_hash,
    )
    if organizer is not None:
        people.role(organizer, "organizer")

    tracks = {}
    for t in tracks_in:
        row = Track(event_id=event.id, external_id=t["id"], slug=slugify(t["name"]), name=t["name"])
        db.add(row)
        tracks[t["id"]] = row
    db.flush()

    keys: list[str] = []
    top = 5
    for s in scores_in:
        for k, v in (s.get("criteria") or {}).items():
            if k not in keys:
                keys.append(k)
            top = max(top, int(v))
    rubric = Rubric(event_id=event.id, name="Imported rubric", scale_min=1, scale_max=top)
    db.add(rubric)
    db.flush()
    criteria = {}
    for i, k in enumerate(keys or ["overall"]):
        c = Criterion(rubric_id=rubric.id, key=k, name=k.replace("_", " ").title(), weight=1 / max(len(keys), 1), sort_order=i)
        db.add(c)
        criteria[k] = c
    db.flush()

    judges = {}
    for j in judges_in:
        user = people.user(j["email"], j.get("name") or j["email"], j["id"])
        role = people.role(user, "judge")
        for tid in j.get("tracks") or []:
            if tid in tracks:
                db.add(JudgeTrack(role_id=role.id, track_id=tracks[tid].id))
        judges[j["id"]] = user

    teams = {}
    for t in teams_in:
        team = Team(id=uuid.uuid4(), event_id=event.id, external_id=t["id"], name=t["name"])
        db.add(team)
        for i, email in enumerate(t.get("members") or []):
            user = people.user(email, email.split("@")[0].replace(".", " ").title())
            db.add(Membership(event_id=event.id, team_id=team.id, user_id=user.id, is_captain=i == 0))
            role = people.role(user, "participant")
            if role.role == "judge":
                raise FixtureError(f"{email} is both a judge and on team {t['id']}")
        db.add(InviteLink(team_id=team.id, token=secrets.token_urlsafe(12)))
        teams[t["id"]] = team
    db.flush()

    projects = {}
    for p in projects_in:
        team = teams.get(p.get("team"))
        if team is None:
            raise FixtureError(f"project {p.get('id')} references unknown team {p.get('team')}")
        sub = Submission(
            id=uuid.uuid4(),
            event_id=event.id,
            team_id=team.id,
            track_id=tracks[p["track"]].id if p.get("track") in tracks else None,
            external_id=p["id"],
            status=SubmissionStatus.submitted.value,
            title=p.get("title", ""),
            summary=p.get("summary", ""),
            repo_url=p.get("repo_url", ""),
            submitted_at=_dt(p.get("submitted_at")),
        )
        db.add(sub)
        projects[p["id"]] = sub
    db.flush()

    batch = AssignmentBatch(event_id=event.id, reviews_per_project=0, kind="imported")
    db.add(batch)
    db.flush()
    skipped = 0
    for s in scores_in:
        judge, sub = judges.get(s.get("judge")), projects.get(s.get("project"))
        if judge is None or sub is None:
            skipped += 1
            continue
        # Client-side ids: no flush per row, so a 10 000-score import is one round of inserts.
        a = Assignment(id=uuid.uuid4(), batch_id=batch.id, event_id=event.id, judge_id=judge.id, submission_id=sub.id)
        db.add(a)
        score = Score(
            id=uuid.uuid4(),
            assignment_id=a.id,
            judge_id=judge.id,
            submission_id=sub.id,
            event_id=event.id,
            submitted=True,
            comment=s.get("comment") or "",
        )
        db.add(score)
        cells = {}
        for k, v in (s.get("criteria") or {}).items():
            score.cells.append(ScoreCell(criterion_id=criteria[k].id, value=float(v)))
            cells[criteria[k].id] = float(v)
        score.raw_weighted = weighted(cells, list(criteria.values()))
    counts = defaultdict(int)
    for s in scores_in:
        counts[s.get("project")] += 1
    event.reviews_per_project = max(3, round(sum(counts.values()) / max(len(counts), 1)))
    dupes = detect_duplicates(db, event)
    stats = {
        "tracks": len(tracks),
        "judges": len(judges),
        "teams": len(teams),
        "projects": len(projects),
        "scores": len(scores_in) - skipped,
        "scores_skipped": skipped,
        "duplicates_flagged": len(dupes),
        "criteria": keys,
    }
    db.add(ImportJob(event_id=event.id, kind="fixture_json", stats=stats, created_by=organizer.id if organizer else None))
    db.flush()
    return event, stats


def _num(v: float) -> float | int:
    return int(v) if float(v).is_integer() else v


def export_fixture(db: Session, event: Event) -> dict:
    """The event in fixtures.json shape. Rows without an external id use their UUID."""
    ref = lambda row: row.external_id or str(row.id)  # noqa: E731
    tracks = {t.id: t for t in db.query(Track).filter(Track.event_id == event.id)}
    subs = db.query(Submission).filter(Submission.event_id == event.id, Submission.status != "draft").all()
    sub_ref = {s.id: ref(s) for s in subs}
    teams = db.query(Team).filter(Team.event_id == event.id).all()
    judge_roles = db.query(EventRole).filter(EventRole.event_id == event.id, EventRole.role == "judge").all()
    judge_tracks = defaultdict(list)
    for jt in db.query(JudgeTrack).filter(JudgeTrack.role_id.in_([r.id for r in judge_roles])):
        judge_tracks[jt.role_id].append(ref(tracks[jt.track_id]))
    users = {u.id: u for u in db.query(User).filter(User.id.in_([r.user_id for r in judge_roles]))}
    criteria = {c.id: c.key for c in (event.rubric.criteria if event.rubric else [])}
    return {
        "event": {"id": ref(event), "name": event.name, "submissions_close": iso(event.submissions_deadline)},
        "tracks": [{"id": ref(t), "name": t.name} for t in tracks.values()],
        "judges": [
            {
                "id": users[r.user_id].external_id or str(r.user_id),
                "name": users[r.user_id].display_name,
                "email": users[r.user_id].email,
                "tracks": sorted(judge_tracks[r.id]),
            }
            for r in judge_roles
        ],
        "teams": [{"id": ref(t), "name": t.name, "members": [m.user.email for m in t.memberships]} for t in teams],
        "projects": [
            {
                "id": ref(s),
                "team": ref(s.team),
                "track": ref(tracks[s.track_id]) if s.track_id in tracks else None,
                "title": s.title,
                "summary": s.summary,
                "repo_url": s.repo_url,
                "submitted_at": iso(s.submitted_at),
            }
            for s in subs
        ],
        "scores": [
            {
                "judge": s.judge.external_id or str(s.judge_id),
                "project": sub_ref[s.submission_id],
                "criteria": {criteria[c.criterion_id]: _num(c.value) for c in s.cells},
                "comment": s.comment,
            }
            for s in db.query(Score).filter(Score.event_id == event.id, Score.submitted.is_(True))
            if s.submission_id in sub_ref
        ],
    }


PROJECT_CSV_COLUMNS = ["title", "summary", "team", "track", "repo_url", "members"]


def import_projects_csv(db: Session, event: Event, text: str, password_hash: str = UNCLAIMED) -> dict:
    """Columns: title, summary, team, track (name or slug), repo_url, members (;-separated emails)."""
    reader = csv.DictReader(io.StringIO(text))
    missing = [c for c in ("title", "team") if c not in (reader.fieldnames or [])]
    if missing:
        raise FixtureError(f"CSV is missing columns: {', '.join(missing)}")
    tracks = {t.slug: t for t in db.query(Track).filter(Track.event_id == event.id)}
    tracks.update({t.name.lower(): t for t in tracks.values()})
    created = 0
    for i, row in enumerate(reader, start=2):
        if not row.get("title"):
            raise FixtureError(f"row {i}: title is empty")
        team = db.query(Team).filter(Team.event_id == event.id, Team.name == row["team"]).one_or_none()
        if team is None:
            team = Team(event_id=event.id, name=row["team"])
            db.add(team)
            db.flush()
            db.add(InviteLink(team_id=team.id, token=secrets.token_urlsafe(12)))
        for email in filter(None, (e.strip() for e in (row.get("members") or "").split(";"))):
            user = _user(db, email, email.split("@")[0].title(), password_hash)
            if not db.query(Membership).filter(Membership.team_id == team.id, Membership.user_id == user.id).first():
                db.add(Membership(event_id=event.id, team_id=team.id, user_id=user.id))
            _role(db, event.id, user.id, "participant")
        track = tracks.get((row.get("track") or "").strip().lower())
        db.add(
            Submission(
                event_id=event.id,
                team_id=team.id,
                track_id=track.id if track else None,
                status=SubmissionStatus.submitted.value,
                title=row["title"],
                summary=row.get("summary", ""),
                repo_url=row.get("repo_url", ""),
                submitted_at=datetime.now().astimezone(),
            )
        )
        created += 1
    db.flush()
    dupes = detect_duplicates(db, event)
    stats = {"projects": created, "duplicates_flagged": len(dupes)}
    db.add(ImportJob(event_id=event.id, kind="projects_csv", stats=stats))
    db.flush()
    return stats
