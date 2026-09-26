"""Website requirements beyond the brief: track isolation, every-stage CSV, archive, open voting,
webhooks for every action, and a deadline that also locks team changes."""

import io
import zipfile

from app.database import SessionLocal
from app.models import WebhookDelivery
from conftest import login, past, register

E = "/v1/events/test-hack"


def _track_judge(client, world):
    """A judge scoped to the Web track only, with assignments generated."""
    register(client, "track@example.com")
    login(client, "org@example.com")
    web = next(t["id"] for t in world["event"]["tracks"] if t["name"] == "Web")
    assert client.post(f"{E}/roles", json={"user_email": "track@example.com", "role": "judge", "track_ids": [web]}).status_code == 200
    client.post(f"{E}/assignments", json={"reviews_per_project": 3})
    return web


def test_a_track_judge_never_sees_another_track(client, world):
    _track_judge(client, world)
    login(client, "org@example.com")
    by_track = {p["track"]["name"]: p["id"] for p in client.get(f"{E}/projects").json()}
    climate_project = by_track["Climate"]
    login(client, "track@example.com")
    queue = client.get(f"{E}/assignments/mine").json()["items"]
    assert queue and {i["project"]["track"] for i in queue} == {"Web"}
    assert client.get(f"{E}/scores?project={climate_project}").json() == []
    # Other judges' reviews of the other track stay invisible too.
    login(client, "jb@example.com")
    item = next(i for i in client.get(f"{E}/assignments/mine").json()["items"] if i["project"]["id"] == climate_project)
    crit = client.get(f"{E}/rubric").json()["criteria"]
    sid = client.put(f"{E}/assignments/{item['assignment_id']}/score", json={"cells": [{"criterion_id": c["id"], "value": 4} for c in crit], "submitted": True}).json()["id"]
    login(client, "track@example.com")
    assert client.get(f"{E}/scores/{sid}").status_code == 404


def test_track_judge_pairwise_items_stay_in_track(client, world):
    _track_judge(client, world)
    login(client, "track@example.com")
    # Only one project in the Web track: no pair can be formed, so the judge is simply done.
    assert client.get(f"{E}/pairwise/next").json()["done"] is True


def test_every_stage_has_a_csv(client, world):
    login(client, "org@example.com")
    client.post(f"{E}/normalization", json={})
    for kind in ("registrations", "teams", "submissions", "eligibility", "judges", "assignments", "scores", "normalization", "results", "votes", "records", "audit"):
        r = client.get(f"{E}/export/{kind}.csv")
        assert r.status_code == 200, (kind, r.text)
        assert "," in r.text.splitlines()[0], kind
    regs = client.get(f"{E}/export/registrations.csv").text
    assert "ja@example.com,judge" in regs and "p1@example.com,participant,Alpha" in regs


def test_archive_is_read_only_and_exportable(client, world):
    login(client, "org@example.com")
    assert client.post(f"{E}/archive", json={"archived": True}).status_code == 409  # voting still open
    client.patch(E, json={"voting_opens_at": "2020-01-01T00:00:00Z", "voting_closes_at": "2020-01-02T00:00:00Z"})
    assert client.post(f"{E}/archive", json={"archived": True}).json() == {"archived": True}
    assert client.get(E).json()["phase"] == "archived"
    assert client.patch(E, json={"name": "renamed"}).status_code == 403
    assert client.post(f"{E}/normalization", json={}).status_code == 403
    login(client, "p1@example.com")
    assert client.post(f"{E}/projects", json={"title": "x"}).status_code == 403
    login(client, "org@example.com")
    z = zipfile.ZipFile(io.BytesIO(client.get(f"{E}/archive.zip").content))
    names = set(z.namelist())
    assert {"README.txt", "export.json", "audit.jsonl", "signing-key.pem", "csv/results.csv", "csv/registrations.csv"} <= names
    assert z.read("audit.jsonl").decode().count("\n") > 5
    assert client.post(f"{E}/archive", json={"archived": False}).json() == {"archived": False}


def test_open_link_voting_one_ballot_per_browser(client, world):
    login(client, "org@example.com")
    client.patch(E, json={"voting_access": "open"})
    client.cookies.clear()
    first = client.post(f"{E}/ballots", json={})
    assert first.status_code == 200
    again = client.post(f"{E}/ballots", json={})
    assert again.json()["token"] == first.json()["token"]  # same browser, same ballot
    client.cookies.clear()
    assert client.post(f"{E}/ballots", json={}).json()["token"] != first.json()["token"]


def test_every_audited_action_fires_a_webhook(client, world):
    login(client, "org@example.com")
    client.post(f"{E}/webhooks", json={"url": "https://hooks.example/all", "actions": []})
    client.post(f"{E}/normalization", json={})
    client.patch(E, json={"tagline": "new"})
    login(client, "voter@example.com")
    client.post(f"{E}/projects/{world['projects']['Alpha Tool']}/comments", json={"body": "nice"})
    with SessionLocal() as db:
        actions = {d.action for d in db.query(WebhookDelivery)}
    assert {"normalization.run", "event.update", "comment.create"} <= actions


def test_deadline_also_locks_teams(client, world):
    login(client, "p1@example.com")
    token = client.get(f"{E}/team").json()["invite_token"]
    login(client, "org@example.com")
    client.patch(E, json={"submissions_deadline": past()})
    login(client, "voter@example.com")
    assert client.post(f"{E}/teams", json={"name": "Late"}).status_code == 403
    assert client.post(f"/v1/invites/{token}/accept").status_code == 403
    login(client, "p1@example.com")
    assert client.post(f"{E}/teams/rotate-invite").status_code == 403
