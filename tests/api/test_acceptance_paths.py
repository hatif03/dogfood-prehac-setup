"""The seven run.py checks, against the real boot seed, through the same routes as .dogfood.toml."""

import json
from pathlib import Path

from conftest import as_

E = "/v1/events/sample-hack-2026"
FIXTURE = json.loads((Path(__file__).parents[2] / "spec" / "fixtures.json").read_text(encoding="utf-8"))


def test_gallery_is_public_and_shows_fixture_titles(seeded):
    seeded.cookies.clear()
    r = seeded.get(f"{E}/projects")
    assert r.status_code == 200
    for p in FIXTURE["projects"][:3]:
        assert p["title"] in r.text


def test_gallery_hides_the_duplicate(seeded):
    ids = [p["external_id"] for p in seeded.get(f"{E}/projects").json()]
    assert "prj_41" not in ids and "prj_07" in ids
    assert len(ids) == len(FIXTURE["projects"]) - 1


def test_closed_event_refuses_submission(seeded):
    r = seeded.post(f"{E}/projects", json={"title": "dogfood-late-submission-probe", "summary": "probe"}, headers=as_("participant"))
    assert r.status_code == 403
    assert "closed" in r.json()["detail"]


def test_judge_reads_own_scores(seeded):
    r = seeded.get(f"{E}/scores", headers=as_("judge_a"))
    assert r.status_code == 200
    assert r.json() and {s["judge"]["external_id"] for s in r.json()} == {"jdg_24"}


def test_judge_cannot_read_peer_scores(seeded):
    for ref in ("jdg_24", "diego.herrera@example.org"):
        assert seeded.get(f"{E}/scores?judge={ref}", headers=as_("judge_b")).status_code == 403


def test_participant_is_not_a_judge(seeded):
    assert seeded.get(f"{E}/scores", headers=as_("participant")).status_code == 403
    seeded.cookies.clear()
    assert seeded.get(f"{E}/scores").status_code == 401


def test_organizer_exports_csv(seeded):
    r = seeded.get(f"{E}/export/results.csv", headers=as_("organizer"))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "," in r.text.splitlines()[0]
    assert len(r.text.splitlines()) == 41  # header + 40 ranked projects (duplicate excluded)


def test_results_csv_matches_the_api_to_four_decimals(seeded):
    import csv
    import io

    run = seeded.get(f"{E}/normalization", headers=as_("organizer")).json()
    rows = list(csv.DictReader(io.StringIO(seeded.get(f"{E}/export/results.csv", headers=as_("organizer")).text)))
    by_id = {r["project"]["title"]: r for r in run["rows"]}
    for row in rows:
        api = by_id[row["title"]]
        assert int(row["rank"]) == api["rank"] and int(row["raw_rank"]) == api["raw_rank"]
        assert abs(float(row["adjusted_score"]) - api["adjusted"]) < 5e-5
        assert abs(float(row["raw_mean"]) - api["raw_mean"]) < 5e-5


def test_home_screen_work_list(seeded):
    judge = {w["event"]["slug"]: w for w in seeded.get("/v1/auth/work", headers=as_("judge_a")).json()}
    assert judge["sample-hack-2026"]["role"] == "judge" and judge["sample-hack-2026"]["judge"] == {"assigned": 11, "done": 11}
    org = {w["event"]["slug"]: w for w in seeded.get("/v1/auth/work", headers=as_("organizer")).json()}
    kpis = seeded.get("/v1/events/sample-hack-2026/dashboard", headers=as_("organizer")).json()["kpis"]
    # Home and dashboard count the same reviews: the duplicate prj_41's 4 reviews are out of judging.
    assert org["sample-hack-2026"]["organizer"] == {"reviews_assigned": kpis["reviews_assigned"], "reviews_submitted": kpis["reviews_submitted"]}
    assert kpis["reviews_submitted"] == 122
    part = seeded.get("/v1/auth/work", headers=as_("participant")).json()
    assert part[0]["participant"]["title"] == "Glass Signal"
