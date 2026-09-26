"""Migration path in and out: fixtures.json -> portal -> fixtures.json is lossless."""

import json
from pathlib import Path

from app.database import SessionLocal
from app.importer import export_fixture, import_fixture

FIXTURE = json.loads((Path(__file__).parents[2] / "spec" / "fixtures.json").read_text(encoding="utf-8"))


def _canon(doc):
    key = lambda d: json.dumps(d, sort_keys=True)  # noqa: E731
    out = {"event": doc["event"]}
    for k in ("tracks", "judges", "teams", "projects", "scores"):
        rows = []
        for r in doc[k]:
            r = dict(r)
            for listy in ("tracks", "members"):
                if listy in r:
                    r[listy] = sorted(r[listy])
            rows.append(r)
        out[k] = sorted(rows, key=key)
    return out


def test_round_trip_is_lossless(client):
    with SessionLocal() as db:
        event, stats = import_fixture(db, FIXTURE)
        db.commit()
        assert stats["duplicates_flagged"] == 1
        assert _canon(export_fixture(db, event)) == _canon(FIXTURE)


def test_import_endpoint_and_json_export(client):
    from conftest import register

    register(client, "org@example.com")
    r = client.post("/v1/import", json=FIXTURE)
    assert r.status_code == 200, r.text
    slug = r.json()["event"]["slug"]
    assert r.json()["stats"]["projects"] == 41
    again = client.post("/v1/import", json=FIXTURE)
    assert again.status_code == 422 and "already imported" in again.text
    exported = client.get(f"/v1/events/{slug}/export.json").json()
    assert _canon(exported) == _canon(FIXTURE)


def test_bad_fixture_is_rejected_cleanly(client):
    from conftest import register

    register(client, "org@example.com")
    bad = {"event": {"id": "e"}, "projects": [{"id": "p", "team": "nope", "title": "x"}]}
    r = client.post("/v1/import", json=bad)
    assert r.status_code == 422 and "unknown team" in r.text
    assert client.get("/v1/events").json() == []


def test_projects_csv_import(client, world):
    from conftest import login

    login(client, "org@example.com")
    csv_body = "title,summary,team,track,repo_url,members\nGamma Grid,grid thing,Gamma,Web,https://x.org/g,g1@example.com;g2@example.com\n"
    r = client.post("/v1/events/test-hack/import/projects.csv", content=csv_body, headers={"Content-Type": "text/csv"})
    assert r.status_code == 200, r.text
    assert r.json()["projects"] == 1
    assert "Gamma Grid" in client.get("/v1/events/test-hack/projects").text
