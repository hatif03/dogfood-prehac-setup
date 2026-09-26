import os
import tempfile

os.environ.update(
    DATABASE_URL="sqlite+pysqlite:///:memory:",
    SEED_ON_BOOT="false",
    MINIO_ENDPOINT="",
    SMTP_PORT="1",
    WEBHOOK_WORKER="false",
    REDIS_URL="",
    SIGNING_KEY_PATH=os.path.join(tempfile.mkdtemp(), "ed25519.pem"),
)

import logging  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import rate_limit  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.seed import DEMO_TOKENS, seed_if_empty  # noqa: E402

PW = "password1"
logging.getLogger("httpx").setLevel(logging.WARNING)


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    rate_limit.reset()


@pytest.fixture
def client():
    reset_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def seeded():
    """The real boot seed: fixtures.json through the importer, demo sessions on. Treat as read-mostly."""
    reset_db()
    with SessionLocal() as db:
        seed_if_empty(db)
    with TestClient(app) as c:
        yield c


def as_(token_role: str) -> dict:
    return {"Cookie": f"portal_session={DEMO_TOKENS[token_role]}"}


def register(client, email, name=None):
    r = client.post("/v1/auth/register", json={"email": email, "password": PW, "display_name": name or email.split("@")[0]})
    assert r.status_code == 200, r.text


def login(client, email, password=PW):
    client.cookies.clear()
    r = client.post("/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text


def future(days=1):
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def past(days=1):
    return (datetime.now(UTC) - timedelta(days=days)).isoformat()


@pytest.fixture
def world(client):
    """A fresh open event: organizer, two judges, two participant teams with submitted projects."""
    register(client, "org@example.com", "Org")
    ev = client.post(
        "/v1/events",
        json={
            "name": "Test Hack",
            "slug": "test-hack",
            "submissions_deadline": future(),
            "voting_opens_at": past(),
            "voting_closes_at": future(3),
            "tracks": [{"name": "Web"}, {"name": "Climate"}],
            "reviews_per_project": 2,
            "rubric": {"scale_min": 1, "scale_max": 5, "criteria": [{"name": "Impact", "weight": 3}, {"name": "Craft", "weight": 1}]},
        },
    )
    assert ev.status_code == 200, ev.text
    event = ev.json()
    for email in ("ja@example.com", "jb@example.com", "p1@example.com", "p2@example.com", "voter@example.com"):
        register(client, email)
    login(client, "org@example.com")
    for email in ("ja@example.com", "jb@example.com"):
        assert client.post("/v1/events/test-hack/roles", json={"user_email": email, "role": "judge"}).status_code == 200
    projects = {}
    for email, team, title, track in (("p1@example.com", "Alpha", "Alpha Tool", 0), ("p2@example.com", "Beta", "Beta Map", 1)):
        login(client, email)
        assert client.post("/v1/events/test-hack/teams", json={"name": team}).status_code == 200
        sub = client.post(
            "/v1/events/test-hack/projects",
            json={"title": title, "summary": "does things", "track_id": event["tracks"][track]["id"]},
        )
        assert sub.status_code == 200, sub.text
        assert client.post(f"/v1/events/test-hack/projects/{sub.json()['id']}/submit").status_code == 200
        projects[title] = sub.json()["id"]
    login(client, "org@example.com")
    assert client.post("/v1/events/test-hack/assignments", json={}).status_code == 200
    client.cookies.clear()
    return {"event": event, "projects": projects}
