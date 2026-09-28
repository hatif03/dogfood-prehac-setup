"""Local anti-abuse: honeypot fields on register and ballots."""


def test_register_honeypot_rejects(client):
    r = client.post(
        "/v1/auth/register",
        json={"email": "bot@example.com", "password": "password1", "display_name": "Bot", "website": "http://spam"},
    )
    assert r.status_code == 400


def test_gallery_rate_limit(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "gallery_rate_limit", 2)
    monkeypatch.setattr(settings, "gallery_rate_window_seconds", 60)
    register = client.post(
        "/v1/auth/register",
        json={"email": "g@example.com", "password": "password1", "display_name": "G"},
    )
    assert register.status_code == 200
    ev = client.post(
        "/v1/events",
        json={"name": "Gal", "slug": "gal-rate", "submissions_deadline": "2099-01-01T00:00:00Z"},
    )
    assert ev.status_code == 200
    client.cookies.clear()
    assert client.get("/v1/events/gal-rate/projects").status_code == 200
    assert client.get("/v1/events/gal-rate/projects").status_code == 200
    assert client.get("/v1/events/gal-rate/projects").status_code == 429
