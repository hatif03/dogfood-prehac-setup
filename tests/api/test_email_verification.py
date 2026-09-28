"""Registration email verification and authenticated voting gate."""

from conftest import PW, confirm_email, future, login, past, register


def test_unverified_user_cannot_vote_authenticated(client, world):
    register(client, "newvoter@example.com", verify=False)
    login(client, "newvoter@example.com")
    r = client.post("/v1/events/test-hack/ballots", json={})
    assert r.status_code == 403
    assert "email" in r.json()["detail"].lower()
    confirm_email(client)
    assert client.post("/v1/events/test-hack/ballots", json={}).status_code == 200


def test_verify_and_resend(client):
    register(client, "verifyme@example.com", verify=False)
    login(client, "verifyme@example.com")
    assert client.get("/v1/auth/me").json()["email_verified"] is False
    assert client.post("/v1/auth/verify-email/resend").status_code == 200
    confirm_email(client)
    assert client.get("/v1/auth/me").json()["email_verified"] is True


def test_event_can_disable_requirement(client):
    register(client, "org2@example.com")
    login(client, "org2@example.com")
    ev = client.post(
        "/v1/events",
        json={
            "name": "Loose vote",
            "slug": "loose-vote",
            "submissions_deadline": future(),
            "voting_opens_at": past(),
            "voting_closes_at": future(3),
            "voting_access": "authenticated",
            "require_verified_email": False,
        },
    ).json()
    register(client, "anonv@example.com", verify=False)
    login(client, "anonv@example.com")
    assert client.post("/v1/events/loose-vote/ballots", json={}).status_code == 200


def test_seeded_accounts_are_verified(seeded):
    seeded.cookies.clear()
    login(seeded, "priya1@example.org", password="password")
    assert seeded.get("/v1/auth/me").json()["email_verified"] is True
