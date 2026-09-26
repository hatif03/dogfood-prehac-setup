"""T1: teams by invite link, draft -> edit -> submit, and a deadline that holds on every write path."""

from conftest import login, past, register

E = "/v1/events/test-hack"


def test_invite_link_draft_edit_submit_then_deadline_locks(client, world):
    login(client, "p1@example.com")
    team = client.get(f"{E}/team").json()
    token = team["invite_token"]
    register(client, "friend@example.com")
    preview = client.get(f"/v1/invites/{token}").json()
    assert preview["team"] == "Alpha" and not preview["full"]
    assert client.post(f"/v1/invites/{token}/accept").status_code == 200
    mine = client.get(f"{E}/team").json()
    assert {m["email"] for m in mine["members"]} == {"p1@example.com", "friend@example.com"}

    sid = mine["submission"]["id"]
    edit = client.post(f"{E}/projects", json={"title": "Alpha Tool v2", "summary": "better", "track_id": world["event"]["tracks"][0]["id"]})
    assert edit.status_code == 200 and edit.json()["id"] == sid and edit.json()["title"] == "Alpha Tool v2"

    login(client, "org@example.com")
    assert client.patch(E, json={"submissions_deadline": past()}).status_code == 200

    login(client, "friend@example.com")
    assert client.post(f"{E}/projects", json={"title": "late"}).status_code == 403
    assert client.post(f"{E}/projects/{sid}/submit").status_code == 403
    assert client.post(f"{E}/projects/{sid}/unsubmit").status_code == 403
    img = client.post(f"{E}/projects/{sid}/images", files={"file": ("a.png", b"\x89PNG", "image/png")})
    assert img.status_code == 403
    login(client, "org@example.com")
    assert client.get(f"{E}/projects/{sid}").json()["title"] == "Alpha Tool v2"


def test_judge_cannot_join_a_team_and_teams_have_a_size_cap(client, world):
    login(client, "ja@example.com")
    assert client.post(f"{E}/teams", json={"name": "Sneaky"}).status_code == 409
    login(client, "org@example.com")
    client.patch(E, json={"max_team_size": 1})
    login(client, "p1@example.com")
    token = client.get(f"{E}/team").json()["invite_token"]
    login(client, "voter@example.com")
    assert client.post(f"/v1/invites/{token}/accept").status_code == 409


def test_submit_requires_title_summary_and_track(client, world):
    register(client, "p3@example.com")
    client.post(f"{E}/teams", json={"name": "Gamma"})
    sid = client.post(f"{E}/projects", json={"title": "Only a title"}).json()["id"]
    r = client.post(f"{E}/projects/{sid}/submit")
    assert r.status_code == 422 and "summary" in r.json()["detail"] and "track" in r.json()["detail"]
    client.cookies.clear()
    assert client.get(f"{E}/projects/{sid}").status_code == 404  # drafts are not public


def test_resubmitting_a_copy_is_flagged_as_duplicate(client, world):
    register(client, "copycat@example.com")
    client.post(f"{E}/teams", json={"name": "Copycats"})
    sid = client.post(f"{E}/projects", json={"title": "alpha tool!", "summary": "same", "track_id": world["event"]["tracks"][0]["id"]}).json()["id"]
    r = client.post(f"{E}/projects/{sid}/submit")
    assert r.status_code == 200 and r.json()["warnings"]
    client.cookies.clear()
    assert sid not in [p["id"] for p in client.get(f"{E}/projects").json()]


def test_organizer_can_clear_a_false_duplicate(client, world):
    register(client, "copycat@example.com")
    client.post(f"{E}/teams", json={"name": "Copycats"})
    sid = client.post(f"{E}/projects", json={"title": "Alpha Tool", "summary": "different idea", "track_id": world["event"]["tracks"][0]["id"]}).json()["id"]
    client.post(f"{E}/projects/{sid}/submit")
    login(client, "org@example.com")
    assert client.post(f"{E}/projects/{sid}/flags/clear").json()["cleared"] == ["duplicate"]
    login(client, "copycat@example.com")
    client.post(f"{E}/projects/{sid}/submit")  # re-running detection must not re-flag it
    client.cookies.clear()
    assert sid in [p["id"] for p in client.get(f"{E}/projects").json()]


def test_event_dates_must_be_in_order(client, world):
    login(client, "org@example.com")
    r = client.patch(E, json={"voting_opens_at": "2030-01-02T00:00:00Z", "voting_closes_at": "2030-01-01T00:00:00Z"})
    assert r.status_code == 422 and "voting opens at" in r.json()["detail"]
