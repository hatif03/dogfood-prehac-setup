"""FIG.02 as a curl matrix: every judging read and write, as every role. The UI is not involved."""

import pytest

from conftest import login

E = "/v1/events/test-hack"


def _score(client, email):
    """Log in as a judge and submit a review for their first assignment."""
    login(client, email)
    queue = client.get(f"{E}/assignments/mine").json()["items"]
    rubric = client.get(f"{E}/rubric").json()
    item = queue[0]
    r = client.put(
        f"{E}/assignments/{item['assignment_id']}/score",
        json={"cells": [{"criterion_id": c["id"], "value": 4} for c in rubric["criteria"]], "comment": "solid", "submitted": True},
    )
    assert r.status_code == 200, r.text
    return item["assignment_id"], r.json()["id"]


def test_judge_sees_only_own_scores_and_peer_is_refused(client, world):
    a_assignment, a_score = _score(client, "ja@example.com")
    ja_id = client.get("/v1/auth/me").json()["id"]
    own = client.get(f"{E}/scores")
    assert own.status_code == 200 and {s["judge"]["id"] for s in own.json()} == {ja_id}

    login(client, "jb@example.com")
    assert client.get(f"{E}/scores?judge={ja_id}").status_code == 403
    assert client.get(f"{E}/scores?judge=ja@example.com").status_code == 403
    assert all(s["judge"]["id"] != ja_id for s in client.get(f"{E}/scores").json())
    # Object-level: peer's score and peer's assignment answer like they do not exist.
    assert client.get(f"{E}/scores/{a_score}").status_code == 404
    rubric = client.get(f"{E}/rubric").json()
    put = client.put(
        f"{E}/assignments/{a_assignment}/score",
        json={"cells": [{"criterion_id": c["id"], "value": 1} for c in rubric["criteria"]], "submitted": True},
    )
    assert put.status_code == 404
    assert client.get(f"{E}/export/scores.csv").text.count("\n") == 1  # header only

    login(client, "org@example.com")
    assert client.get(f"{E}/scores?judge={ja_id}").status_code == 200
    assert client.get(f"{E}/scores/{a_score}").status_code == 200


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/scores"),
        ("get", "/assignments/mine"),
        ("get", "/dashboard"),
        ("get", "/normalization"),
        ("post", "/normalization"),
        ("post", "/assignments"),
        ("get", "/export/results.csv"),
        ("get", "/export/scores.csv"),
        ("get", "/export/audit.csv"),
        ("get", "/export.json"),
        ("get", "/audit"),
        ("get", "/people"),
        ("post", "/pairwise/fit"),
    ],
)
@pytest.mark.parametrize("who", [None, "p1@example.com"])
def test_visitors_and_participants_are_refused(client, world, method, path, who):
    client.cookies.clear()
    if who:
        login(client, who)
    r = getattr(client, method)(f"{E}{path}", **({"json": {}} if method == "post" else {}))
    assert r.status_code == (403 if who else 401), (path, r.status_code, r.text)


@pytest.mark.parametrize("path", ["/dashboard", "/export/results.csv", "/audit", "/people", "/normalization"])
def test_judges_cannot_reach_organizer_views(client, world, path):
    login(client, "ja@example.com")
    assert client.get(f"{E}{path}").status_code == 403


def test_organizer_cannot_forge_a_judges_review(client, world):
    login(client, "org@example.com")
    # Organizers read everything but write no scores: a review always belongs to its judge.
    login(client, "ja@example.com")
    aid = client.get(f"{E}/assignments/mine").json()["items"][0]["assignment_id"]
    login(client, "org@example.com")
    r = client.put(f"{E}/assignments/{aid}/score", json={"cells": [], "submitted": False})
    assert r.status_code == 403


def test_results_hidden_until_published_and_voting_closed(client, world):
    client.cookies.clear()
    assert client.get(f"{E}/results").status_code == 403
    login(client, "org@example.com")
    assert client.get(f"{E}/results").status_code == 200
    assert client.post(f"{E}/publish", json={"published": True}).status_code == 409  # voting still open
    client.patch(E, json={"voting_closes_at": "2020-01-01T00:00:00Z", "voting_opens_at": "2019-12-01T00:00:00Z"})
    client.post(f"{E}/normalization", json={})
    assert client.post(f"{E}/publish", json={"published": True}).status_code == 200
    client.cookies.clear()
    r = client.get(f"{E}/results")
    assert r.status_code == 200
    assert "judge_offsets" not in r.json()["judging"]  # public results never say who gave what


def test_api_key_is_scoped_to_its_event(client, world):
    login(client, "org@example.com")
    key = client.post(f"{E}/api-keys", json={"name": "ci"}).json()["secret"]
    other = client.post("/v1/events", json={"name": "Other", "slug": "other"}).json()
    client.cookies.clear()
    assert client.get(f"{E}/dashboard", headers={"X-API-Key": key}).status_code == 200
    assert client.get(f"/v1/events/{other['slug']}/dashboard", headers={"X-API-Key": key}).status_code == 401
    assert client.get(f"{E}/dashboard", headers={"X-API-Key": "pk_wrong"}).status_code == 401
