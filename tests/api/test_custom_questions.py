"""Organizer-defined submission questions: PUT, save answers, required on submit."""

from conftest import future, login, past, register

E = "/v1/events/custom-q"


def test_required_question_blocks_submit(client):
    register(client, "oq@example.com", "Org")
    ev = client.post(
        "/v1/events",
        json={
            "name": "Custom Q",
            "slug": "custom-q",
            "submissions_deadline": future(),
            "voting_opens_at": past(),
            "voting_closes_at": future(3),
        },
    )
    assert ev.status_code == 200
    login(client, "oq@example.com")
    qs = client.put(
        f"{E}/questions",
        json=[{"prompt": "License?", "required": True}, {"prompt": "Optional note", "required": False}],
    )
    assert qs.status_code == 200
    q_required = qs.json()[0]["id"]

    register(client, "cap@example.com")
    client.post(f"{E}/teams", json={"name": "Caps"})
    sub = client.post(f"{E}/projects", json={"title": "Ship", "summary": "go"}).json()
    assert client.post(f"{E}/projects/{sub['id']}/submit").status_code == 422

    saved = client.post(
        f"{E}/projects",
        json={"title": "Ship", "summary": "go", "answers": [{"question_id": q_required, "body": "MIT"}]},
    ).json()
    assert client.post(f"{E}/projects/{saved['id']}/submit").status_code == 200

    detail = client.get(E).json()
    assert len(detail["questions"]) == 2
