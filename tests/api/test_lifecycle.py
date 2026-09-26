"""One full event lifecycle through the public API, the story the demo video tells:
create -> invite -> team -> draft -> edit -> submit -> assign -> judge -> normalize -> vote ->
close -> publish -> certificates -> archive."""

import re

from app.routers import judging as judging_router
from conftest import PW, future, login, past, register

E = "/v1/events/demo-day"


def test_full_lifecycle(client, monkeypatch):
    sent = []
    monkeypatch.setattr(judging_router, "send_mail", lambda to, subject, body: sent.append((to, body)))

    # 1. Organizer creates the event: dates, tracks, prizes, weighted rubric.
    register(client, "boss@example.com", "Boss")
    ev = client.post("/v1/events", json={
        "name": "Demo Day", "slug": "demo-day",
        "submissions_deadline": future(2), "voting_opens_at": past(1), "voting_closes_at": future(3),
        "voting_access": "authenticated", "vote_mode": "quadratic", "quadratic_budget": 9, "reviews_per_project": 2,
        "tracks": [{"name": "Tools"}, {"name": "Games"}],
        "prizes": [{"name": "Grand prize"}, {"name": "Runner up"}],
        "rubric": {"scale_min": 1, "scale_max": 5, "criteria": [{"name": "Impact", "weight": 2}, {"name": "Craft", "weight": 1}]},
    })
    assert ev.status_code == 200, ev.text
    tracks = {t["name"]: t["id"] for t in ev.json()["tracks"]}

    # 2. Judges are invited by email and claim their accounts from the link.
    r = client.post(f"{E}/judge-invites", json={"emails": ["j1@example.com", "j2@example.com"]})
    assert r.status_code == 200
    for to, body in sent:
        token = re.search(r"judge-invite/([\w-]+)", body).group(1)
        client.cookies.clear()
        assert client.post(f"/v1/judge-invites/{token}/accept", json={"password": PW, "display_name": to.split("@")[0]}).status_code == 200

    # 3. Hackers form teams by invite link, draft, edit and submit before the deadline.
    projects = {}
    for i, (title, track) in enumerate([("Lint Fox", "Tools"), ("Pixel Moss", "Games"), ("Shell Kite", "Tools")]):
        register(client, f"cap{i}@example.com")
        team = client.post(f"{E}/teams", json={"name": f"Team {i}"}).json()
        register(client, f"mate{i}@example.com")
        assert client.post(f"/v1/invites/{team['invite_token']}/accept").status_code == 200
        draft = client.post(f"{E}/projects", json={"title": title, "summary": "draft"}).json()
        assert draft["status"] == "draft"
        edited = client.post(f"{E}/projects", json={"title": title, "summary": "final", "track_id": tracks[track]}).json()
        assert edited["id"] == draft["id"]
        assert client.post(f"{E}/projects/{draft['id']}/submit").json()["status"] == "submitted"
        projects[title] = draft["id"]

    # 4. Deadline passes; late edits are refused.
    login(client, "boss@example.com")
    client.patch(E, json={"submissions_deadline": past()})
    login(client, "cap0@example.com")
    assert client.post(f"{E}/projects", json={"title": "late"}).status_code == 403

    # 5. Assignment, then judges score against the weighted rubric.
    login(client, "boss@example.com")
    assert client.post(f"{E}/assignments", json={}).json()["created"] == 6  # 3 projects x 2 judges
    quality = {"Lint Fox": 5, "Pixel Moss": 3, "Shell Kite": 4}
    for judge, leniency in (("j1@example.com", 0), ("j2@example.com", -1)):
        login(client, judge)
        crit = client.get(f"{E}/rubric").json()["criteria"]
        for item in client.get(f"{E}/assignments/mine").json()["items"]:
            v = max(1, quality[item["project"]["title"]] + leniency)
            r = client.put(f"{E}/assignments/{item['assignment_id']}/score", json={"cells": [{"criterion_id": c["id"], "value": v} for c in crit], "submitted": True})
            assert r.status_code == 200

    # 6. Live dashboard shows everything done; normalization ranks by adjusted score.
    login(client, "boss@example.com")
    dash = client.get(f"{E}/dashboard").json()
    assert dash["kpis"]["completion"] == 1.0
    run = client.post(f"{E}/normalization", json={}).json()
    assert [r["project"]["title"] for r in run["rows"]] == ["Lint Fox", "Shell Kite", "Pixel Moss"]

    # 7. Community votes (quadratic); results stay hidden while voting is open.
    register(client, "fan@example.com")
    ballot = client.post(f"{E}/ballots", json={}).json()
    assert client.post(f"/v1/ballots/{ballot['token']}/votes", json={"submission_id": projects["Pixel Moss"], "units": 3}).json()["spent"] == 9
    client.cookies.clear()
    assert client.get(f"{E}/results").status_code == 403

    # 8. Organizer closes voting, publishes, issues certificates, archives.
    login(client, "boss@example.com")
    assert client.post(f"{E}/publish", json={"published": True}).status_code == 409
    client.patch(E, json={"voting_closes_at": past(0.01)})
    assert client.post(f"{E}/publish", json={"published": True}).status_code == 200
    client.cookies.clear()
    results = client.get(f"{E}/results").json()
    assert results["judging"]["rows"][0]["project"]["title"] == "Lint Fox"
    assert results["popular_vote"][0] == {"project_id": projects["Pixel Moss"], "title": "Pixel Moss", "votes": 3}
    login(client, "boss@example.com")
    certs = client.post(f"{E}/records", json={"kind": "winner"}).json()
    assert {c["payload"]["project"] for c in certs} == {"Lint Fox", "Shell Kite", "Pixel Moss"}
    judges = client.post(f"{E}/records", json={"kind": "judge"}).json()
    assert len(judges) == 2
    assert client.post(f"{E}/archive", json={"archived": True}).json() == {"archived": True}
    assert client.get(f"{E}/archive.zip").status_code == 200
    assert client.get(f"{E}/audit/verify").json()["ok"] is True
