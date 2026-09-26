"""Boot seed: the official fixtures.json through the public importer, plus a labelled playground.

Every seeded account's password is `password`. Demo session tokens (DEMO_SESSIONS=true) are
fixed so .dogfood.toml can hand them to the acceptance checker; turn them off in production.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.audit import audit
from app.config import settings
from app.importer import import_fixture
from app.models import Criterion, Event, EventRole, Prize, Rubric, Session as AuthSession, Track, User
from app.scoring import run_normalization
from app.security import hash_password, hash_token, session_expiry
from app.timeutil import now

log = logging.getLogger("portal.seed")

PASSWORD = "password"
ORGANIZER = "organizer@portal.local"
ADMIN = "admin@portal.local"
FIXTURE_SLUG = "sample-hack-2026"
JUDGE_A, JUDGE_B = "jdg_24", "jdg_07"  # jdg_24 reviewed the most; jdg_07 is the constant rater
PARTICIPANT = "priya1@example.org"  # captain of tm_01 in the fixture

# role -> token. Printed at boot; copy into .dogfood.toml [auth].
DEMO_TOKENS = {
    "organizer": "demo_org_7f2a9c41",
    "judge_a": "demo_jdg_a_91bc07",
    "judge_b": "demo_jdg_b_44de3e",
    "participant": "demo_prt_2e88f1",
    "admin": "demo_adm_c0ffee",
}


def _fixture_path() -> Path | None:
    here = Path(__file__).resolve()
    repo_copy = [here.parents[3] / "spec" / "fixtures.json"] if len(here.parents) > 3 else []  # dev checkout
    for p in [Path(settings.fixtures_path), Path("/app/fixtures.json"), *repo_copy]:
        if p.is_file():
            return p
    return None


def seed_if_empty(db: Session) -> None:
    if db.query(User.id).first() is None:
        _seed(db)
    if settings.demo_sessions:
        print_demo_logins(ensure_demo_sessions(db))


def _seed(db: Session) -> None:
    pw = hash_password(PASSWORD)
    admin = User(email=ADMIN, display_name="Ada Admin", password_hash=pw, is_platform_admin=True)
    organizer = User(email=ORGANIZER, display_name="Olu Organizer", password_hash=pw)
    db.add_all([admin, organizer])
    db.flush()

    path = _fixture_path()
    if path is None:
        log.warning("fixtures.json not found (FIXTURES_PATH=%s); only the playground is seeded", settings.fixtures_path)
    else:
        data = json.loads(path.read_text(encoding="utf-8"))
        event, stats = import_fixture(db, data, organizer=organizer, password_hash=pw, slug=FIXTURE_SLUG)
        # Demo configuration, not fixture data: open a community vote so T3 is visible on boot.
        event.tagline = "The official Dogfood 2026 fixture: 41 submissions (one a duplicate), 30 judges, 8 tracks"
        event.voting_access = "email_gated"
        event.voting_opens_at = now() - timedelta(days=1)
        event.voting_closes_at = now() + timedelta(days=14)
        run_normalization(db, event, organizer)
        audit(db, action="import.fixture", summary=f"Seed imported {path.name}: {stats['projects']} projects, {stats['scores']} scores, {stats['duplicates_flagged']} duplicate flagged", event_id=event.id, payload=stats)

    _playground(db, organizer)
    db.commit()
    log.info("seed complete")


def _playground(db: Session, organizer: User) -> None:
    """Synthetic and labelled: an event that is still open, for the create-submit-judge-publish demo."""
    event = Event(
        slug="playground",
        name="Playground Hack (synthetic, open)",
        tagline="A live event for trying the full lifecycle. Synthetic, not fixture data.",
        description="Submissions are open. Create a team, invite someone with the link, save a draft, submit.",
        starts_at=now() - timedelta(days=1),
        submissions_deadline=now() + timedelta(days=14),
        judging_deadline=now() + timedelta(days=21),
        voting_access="authenticated",
        vote_mode="quadratic",
        reviews_per_project=2,
    )
    db.add(event)
    db.flush()
    db.add(EventRole(event_id=event.id, user_id=organizer.id, role="organizer"))
    for name in ("Developer tools", "Climate", "Open hardware"):
        db.add(Track(event_id=event.id, slug=name.lower().replace(" ", "-"), name=name))
    for i, (name, desc) in enumerate([("Grand prize", "$800 and the fork"), ("Runner up", "$500"), ("Best judging engine", "$100")]):
        db.add(Prize(event_id=event.id, name=name, description=desc, sort_order=i))
    rubric = Rubric(event_id=event.id, name="Playground rubric", scale_min=1, scale_max=5)
    db.add(rubric)
    db.flush()
    for i, (key, name, w) in enumerate([("functionality", "Functionality", 0.5), ("quality", "Quality", 0.3), ("innovation", "Innovation", 0.2)]):
        db.add(Criterion(rubric_id=rubric.id, key=key, name=name, weight=w, sort_order=i))
    judge_b = db.query(User).filter(User.external_id == JUDGE_B).one_or_none()
    if judge_b:
        db.add(EventRole(event_id=event.id, user_id=judge_b.id, role="judge"))


def ensure_demo_sessions(db: Session) -> dict[str, tuple[str, str]]:
    people = {
        "organizer": db.query(User).filter(User.email == ORGANIZER).one_or_none(),
        "admin": db.query(User).filter(User.email == ADMIN).one_or_none(),
        "judge_a": db.query(User).filter(User.external_id == JUDGE_A).one_or_none(),
        "judge_b": db.query(User).filter(User.external_id == JUDGE_B).one_or_none(),
        "participant": db.query(User).filter(User.email == PARTICIPANT).one_or_none(),
    }
    out = {}
    for role, user in people.items():
        if user is None:
            continue
        token = DEMO_TOKENS[role]
        row = db.query(AuthSession).filter(AuthSession.token_hash == hash_token(token)).one_or_none()
        if row is None:
            row = AuthSession(user_id=user.id, token_hash=hash_token(token), label="demo")
            db.add(row)
        row.expires_at = session_expiry(24 * 365)
        out[role] = (token, user.email)
    db.commit()
    return out


def print_demo_logins(sessions: dict[str, tuple[str, str]]) -> None:
    lines = ["", "seeded. test logins (password for every seeded account: password):"]
    for role, (token, email) in sessions.items():
        lines.append(f"  {role:<12} Cookie: portal_session={token}    ({email})")
    lines.append("  set DEMO_SESSIONS=false to disable these fixed tokens in production")
    print("\n".join(lines), flush=True)
