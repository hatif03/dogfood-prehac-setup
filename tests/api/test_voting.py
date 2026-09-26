"""T3: email-gated ballots, randomized stored order, 1p1v and quadratic rules, abuse limits, comments."""

import re

import pytest

from app import rate_limit
from app.routers import votes
from app.security import canonical_email
from conftest import login, register

E = "/v1/events/test-hack"


@pytest.fixture
def inbox(monkeypatch):
    sent = []
    monkeypatch.setattr(votes, "send_mail", lambda to, subject, body: sent.append((to, body)))
    return sent


def _gate(client, mode, vote_mode="one_person_one_vote"):
    login(client, "org@example.com")
    assert client.patch(E, json={"voting_access": mode, "vote_mode": vote_mode, "quadratic_budget": 10}).status_code == 200
    client.cookies.clear()


def test_email_gated_ballot_only_travels_by_email(client, world, inbox):
    _gate(client, "email_gated")
    r = client.post(f"{E}/ballots", json={"email": "Voter+alt@Example.com"})
    assert r.status_code == 200 and "token" not in r.json()
    token = re.search(r"ballot=([\w-]+)", inbox[-1][1]).group(1)
    # The same person with an alias gets the same ballot, not a second one.
    client.post(f"{E}/ballots", json={"email": "voter@example.com"})
    assert re.search(r"ballot=([\w-]+)", inbox[-1][1]).group(1) == token
    ballot = client.get(f"/v1/ballots/{token}").json()
    assert ballot["confirmed"] and len(ballot["projects"]) == 2
    first, second = (p["id"] for p in ballot["projects"])
    assert client.post(f"/v1/ballots/{token}/votes", json={"submission_id": first}).status_code == 200
    after = client.post(f"/v1/ballots/{token}/votes", json={"submission_id": second}).json()
    assert after["votes"] == {second: 1}  # one person, one vote: changing moves it
    assert [p["id"] for p in client.get(f"/v1/ballots/{token}").json()["projects"]] == [first, second]


def test_quadratic_budget(client, world):
    _gate(client, "authenticated", "quadratic")
    login(client, "voter@example.com")
    b = client.post(f"{E}/ballots", json={}).json()
    p1, p2 = (p["id"] for p in b["projects"])
    assert client.post(f"/v1/ballots/{b['token']}/votes", json={"submission_id": p1, "units": 3}).status_code == 200
    over = client.post(f"/v1/ballots/{b['token']}/votes", json={"submission_id": p2, "units": 2})
    assert over.status_code == 422 and "credits" in over.json()["detail"]
    assert client.post(f"/v1/ballots/{b['token']}/votes", json={"submission_id": p2, "units": 1}).json()["spent"] == 10


def test_authenticated_mode_requires_login_and_link_mode_requires_a_link(client, world):
    _gate(client, "authenticated")
    assert client.post(f"{E}/ballots", json={}).status_code == 401
    _gate(client, "link")
    assert client.post(f"{E}/ballots", json={"link_token": "guess"}).status_code == 403
    login(client, "org@example.com")
    link = client.post(f"{E}/vote-links", json={"count": 2}).json()["links"][0]
    client.cookies.clear()
    token = link.split("ballot=")[1]
    assert client.post(f"{E}/ballots", json={"link_token": token}).status_code == 200


def test_ballots_are_shuffled_per_voter(client, world):
    _gate(client, "authenticated")
    orders = set()
    for i in range(12):
        rate_limit.reset()
        register(client, f"v{i}@example.com")
        orders.add(tuple(p["id"] for p in client.post(f"{E}/ballots", json={}).json()["projects"]))
    assert len(orders) == 2  # both orders of two projects appear


def test_vote_rate_limit(client, world, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "vote_rate_limit", 3)
    _gate(client, "authenticated")
    login(client, "voter@example.com")
    b = client.post(f"{E}/ballots", json={}).json()
    codes = [client.post(f"/v1/ballots/{b['token']}/votes", json={"submission_id": b["projects"][0]["id"]}).status_code for _ in range(4)]
    assert codes[-1] == 429


def test_voting_closed_refuses_votes(client, world):
    login(client, "org@example.com")
    client.patch(E, json={"voting_opens_at": "2020-01-01T00:00:00Z", "voting_closes_at": "2020-01-02T00:00:00Z"})
    login(client, "voter@example.com")
    assert client.post(f"{E}/ballots", json={}).status_code == 403


def test_canonical_email_collapses_aliases():
    assert canonical_email("J.Doe+x@GMail.com") == canonical_email("jdoe@gmail.com") == "jdoe@gmail.com"
    assert canonical_email("a.b@corp.io") == "a.b@corp.io"


def test_comments_need_login_rate_limit_and_moderation(client, world):
    pid = world["projects"]["Alpha Tool"]
    assert client.post(f"{E}/projects/{pid}/comments", json={"body": "hi"}).status_code == 401
    login(client, "voter@example.com")
    assert client.post(f"{E}/projects/{pid}/comments", json={"body": "love it"}).status_code == 200
    assert client.post(f"{E}/projects/{pid}/comments", json={"body": "love it"}).status_code == 409
    cid = client.get(f"{E}/projects/{pid}/comments").json()[0]["id"]
    login(client, "org@example.com")
    assert client.post(f"{E}/comments/{cid}/hide").status_code == 200
    client.cookies.clear()
    assert client.get(f"{E}/projects/{pid}/comments").json() == []
