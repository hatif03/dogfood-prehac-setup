"""Every record in spec/fixtures.json, checked through the API as the person it belongs to.

Runs against the real boot seed (the same importer an organizer uses), not a hand-built copy.
"""

import json
from collections import Counter
from pathlib import Path

import pytest

from app import rate_limit
from conftest import as_

E = "/v1/events/sample-hack-2026"
FIXTURE = json.loads((Path(__file__).parents[2] / "spec" / "fixtures.json").read_text(encoding="utf-8"))
PROJECTS = {p["id"]: p for p in FIXTURE["projects"]}
TRACK_NAMES = {t["id"]: t["name"] for t in FIXTURE["tracks"]}


def _sign_in(client, email):
    rate_limit.reset()  # 150 sign-ins from one test IP would otherwise trip the real limiter
    client.cookies.clear()
    r = client.post("/v1/auth/login", json={"email": email, "password": "password"})
    assert r.status_code == 200, (email, r.text)


def test_event_tracks_and_deadline(seeded):
    ev = seeded.get(E).json()
    assert ev["external_id"] == FIXTURE["event"]["id"] and ev["name"] == FIXTURE["event"]["name"]
    assert ev["submissions_deadline"] == FIXTURE["event"]["submissions_close"]
    assert sorted(t["name"] for t in ev["tracks"]) == sorted(TRACK_NAMES.values())
    assert [c["key"] for c in ev["rubric"]["criteria"]] == ["functionality", "quality", "innovation"]
    assert (ev["rubric"]["scale_min"], ev["rubric"]["scale_max"]) == (1, 5)


@pytest.mark.parametrize("judge", FIXTURE["judges"], ids=lambda j: j["id"])
def test_every_judge_sees_exactly_their_reviews(seeded, judge):
    _sign_in(seeded, judge["email"])
    mine = seeded.get(f"{E}/scores").json()
    expected = {s["project"]: s for s in FIXTURE["scores"] if s["judge"] == judge["id"]}
    got = {r["project"]["external_id"]: r for r in mine}
    assert set(got) == set(expected)
    crit = {c["id"]: c["key"] for c in seeded.get(f"{E}/rubric").json()["criteria"]}
    for pid, score in expected.items():
        cells = {crit[c["criterion_id"]]: c["value"] for c in got[pid]["cells"]}
        assert cells == {k: float(v) for k, v in score["criteria"].items()}
        assert got[pid]["comment"] == score["comment"]
        assert abs(got[pid]["weighted"] - sum(score["criteria"].values()) / 3) < 1e-9
        assert PROJECTS[pid]["track"] in judge["tracks"]
    queue = seeded.get(f"{E}/assignments/mine").json()["items"]
    allowed = {TRACK_NAMES[t] for t in judge["tracks"]}
    assert {i["project"]["track"] for i in queue} <= allowed
    others = [j for j in FIXTURE["judges"] if j["id"] != judge["id"]][:3]
    for other in others:
        assert seeded.get(f"{E}/scores?judge={other['id']}").status_code == 403


@pytest.mark.parametrize("team", FIXTURE["teams"], ids=lambda t: t["id"])
def test_every_team_member_is_on_their_team_and_locked_out(seeded, team):
    _sign_in(seeded, team["members"][0])
    mine = seeded.get(f"{E}/team").json()
    assert mine["name"] == team["name"]
    assert sorted(m["email"] for m in mine["members"]) == sorted(team["members"])
    submitted = [p for p in FIXTURE["projects"] if p["team"] == team["id"]]
    assert mine["submission"]["title"] == submitted[0]["title"]
    assert seeded.post(f"{E}/projects", json={"title": "late"}).status_code == 403
    assert seeded.get(f"{E}/scores").status_code == 403


def test_coverage_constant_rater_and_duplicate(seeded):
    dash = seeded.get(f"{E}/dashboard", headers=as_("organizer")).json()
    counts = Counter(s["project"] for s in FIXTURE["scores"] if s["project"] != "prj_41")
    expected = Counter(counts.values())
    assert {h["reviews"]: h["projects"] for h in dash["coverage"]["histogram"]} == dict(expected)
    assert dash["kpis"]["reviews_submitted"] == sum(counts.values())
    assert [j["external_id"] for j in dash["integrity"]["constant_raters"]] == ["jdg_07"]
    assert [d["title"] for d in dash["integrity"]["duplicates"]] == ["Dry Harbour"]
    run = seeded.get(f"{E}/normalization", headers=as_("organizer")).json()
    assert [j["name"] for j in run["excluded_judges"]] == ["Iva Petrova"]
    assert len(run["rows"]) == len(FIXTURE["projects"]) - 1


def test_gallery_lists_every_project_once(seeded):
    seeded.cookies.clear()
    listed = [p["external_id"] for p in seeded.get(f"{E}/projects").json()]
    assert sorted(listed) == sorted(p for p in PROJECTS if p != "prj_41")
    for pid in ("prj_01", "prj_07", "prj_40"):
        one = seeded.get(f"{E}/projects").json()
        p = next(x for x in one if x["external_id"] == pid)
        assert p["title"] == PROJECTS[pid]["title"] and p["repo_url"] == PROJECTS[pid]["repo_url"]
        assert p["track"]["name"] == TRACK_NAMES[PROJECTS[pid]["track"]]
