"""Gallery search and filters on the boot seed (read-only)."""

from conftest import future, login, past, register

E = "/v1/events/sample-hack-2026"


def test_gallery_search_q(seeded):
    seeded.cookies.clear()
    r = seeded.get(f"{E}/projects?q=Quiet")
    assert r.status_code == 200
    titles = [p["title"] for p in r.json()]
    assert titles and all("quiet" in f"{p['title']} {p['summary']} {p['description']}".lower() for p in r.json())


def test_gallery_filter_track(seeded):
    seeded.cookies.clear()
    all_projects = seeded.get(f"{E}/projects").json()
    slug = all_projects[0]["track"]["slug"]
    filtered = seeded.get(f"{E}/projects", params={"track": slug}).json()
    assert filtered
    assert all(p["track"] and p["track"]["slug"] == slug for p in filtered)


def test_gallery_filter_tag(client):
    register(client, "gal@example.com")
    ev = client.post(
        "/v1/events",
        json={
            "name": "Gallery filters",
            "slug": "gallery-filters",
            "submissions_deadline": future(),
            "voting_opens_at": past(),
            "voting_closes_at": future(3),
            "tracks": [{"name": "Solo"}],
        },
    ).json()
    login(client, "gal@example.com")
    client.post(f"/v1/events/gallery-filters/teams", json={"name": "Solo"})
    sub = client.post(
        "/v1/events/gallery-filters/projects",
        json={"title": "Tagged demo", "summary": "x", "tech_tags": ["Rust", "wasm"], "track_id": ev["tracks"][0]["id"]},
    ).json()
    client.post(f"/v1/events/gallery-filters/projects/{sub['id']}/submit")
    client.cookies.clear()
    hit = client.get("/v1/events/gallery-filters/projects", params={"tag": "rust"}).json()
    miss = client.get("/v1/events/gallery-filters/projects", params={"tag": "python"}).json()
    assert len(hit) == 1 and hit[0]["title"] == "Tagged demo"
    assert miss == []
