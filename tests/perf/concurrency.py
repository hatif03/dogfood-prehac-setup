#!/usr/bin/env python3
"""Concurrency checks against a running portal. Standard library only.

Fires simultaneous requests at every path where a race could corrupt state, then checks the
invariants. Needs abuse limits raised, because it registers users and votes from one IP:

    LOGIN_RATE_LIMIT=100000 VOTE_RATE_LIMIT=100000 docker compose up -d
    python3 tests/perf/concurrency.py .dogfood.toml > docs/perf-concurrency.txt

It creates its own event; the seeded events are not touched.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "spec"))
from run import load_config  # noqa: E402


class Client:
    """One browser: its own cookie jar."""

    def __init__(self, base: str, header: str | None = None):
        self.base = base
        self.header = header
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method: str, path: str, body=None):
        req = urllib.request.Request(self.base + path, method=method)
        if self.header:
            k, _, v = self.header.partition(":")
            req.add_header(k.strip(), v.strip())
        if body is not None:
            req.data = json.dumps(body).encode()
            req.add_header("Content-Type", "application/json")
        try:
            with self.opener.open(req, timeout=60) as r:
                raw = r.read()
                return r.status, json.loads(raw) if raw[:1] in b"[{" else raw
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw)
            except ValueError:
                return e.code, raw


def burst(n: int, fn) -> list:
    """Run fn(i) n times at once (released by one barrier) and return the results in order."""
    out: list = [None] * n
    gate = threading.Barrier(n)

    def run(i):
        gate.wait()
        out[i] = fn(i)

    threads = [threading.Thread(target=run, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return out


class Report:
    def __init__(self):
        self.rows = []

    def check(self, label: str, ok: bool, detail: str = ""):
        self.rows.append((label, ok, detail))

    def print(self):
        width = max(len(r[0]) for r in self.rows) + 2
        for label, ok, detail in self.rows:
            print(f"{label} {'.' * (width - len(label))} {'PASS' if ok else 'FAIL'}")
            if detail:
                print(f"       {detail}")
        print()
        print(f"{sum(r[1] for r in self.rows)}/{len(self.rows)} invariants hold")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--n", type=int, default=24, help="parallel requests per burst")
    args = ap.parse_args()
    cfg = load_config(args.config)
    base = cfg["portal"]["base_url"].rstrip("/")
    org = Client(base, cfg["auth"]["organizer"])
    tag = uuid.uuid4().hex[:6]
    slug = f"race-{tag}"
    E = f"/v1/events/{slug}"
    rep = Report()
    n = args.n

    status, ev = org.call("POST", "/v1/events", {
        "name": f"Race {tag}", "slug": slug, "submissions_deadline": "2030-01-01T00:00:00Z",
        "voting_access": "authenticated", "vote_mode": "quadratic", "quadratic_budget": 9, "max_team_size": 4,
        "reviews_per_project": 1, "tracks": [{"name": "All"}],
    })
    assert status == 200, ev
    track = ev["tracks"][0]["id"]

    def user(i: int, prefix: str) -> Client:
        c = Client(base)
        s, body = c.call("POST", "/v1/auth/register", {"email": f"{prefix}-{tag}-{i}@example.org", "password": "password1", "display_name": f"{prefix} {i}"})
        assert s == 200, body
        return c

    started = time.perf_counter()

    # 1. One person, many simultaneous "create team" clicks -> exactly one team.
    solo = user(0, "solo")
    codes = burst(n, lambda i: solo.call("POST", f"{E}/teams", {"name": f"Team {i}"})[0])
    s, team = solo.call("GET", f"{E}/team")
    rep.check("parallel team creation by one user leaves one team", codes.count(200) == 1 and set(codes) <= {200, 409} and team is not None, f"codes {Counter(codes)}")

    # 2. Many people join a 4-seat team at once -> never more than 4 members.
    joiners = [user(i, "join") for i in range(n)]
    codes = burst(n, lambda i: joiners[i].call("POST", f"/v1/invites/{team['invite_token']}/accept")[0])
    s, after = solo.call("GET", f"{E}/team")
    rep.check("parallel joins never exceed the team size cap", len(after["members"]) == 4 and 500 not in codes, f"members {len(after['members'])}, codes {Counter(codes)}")

    # 3. Two tabs saving the same draft at once -> one submission, no 500.
    codes = burst(n, lambda i: solo.call("POST", f"{E}/projects", {"title": f"Race project {i}", "summary": "s", "track_id": track})[0])
    s, team = solo.call("GET", f"{E}/team")
    rep.check("parallel draft saves keep one submission per team", team["submission"] is not None and 500 not in codes, f"codes {Counter(codes)}")
    solo.call("POST", f"{E}/projects/{team['submission']['id']}/submit")

    # A second project and a judge for the scoring race.
    other = user(1, "solo")
    other.call("POST", f"{E}/teams", {"name": "Other"})
    s, sub = other.call("POST", f"{E}/projects", {"title": "Other project", "summary": "s", "track_id": track})
    other.call("POST", f"{E}/projects/{sub['id']}/submit")
    judge = user(0, "judge")
    org.call("POST", f"{E}/roles", {"user_email": f"judge-{tag}-0@example.org", "role": "judge"})
    org.call("POST", f"{E}/assignments", {})

    # 4. A judge double-submitting the same review -> one review, no 500.
    s, queue = judge.call("GET", f"{E}/assignments/mine")
    aid = queue["items"][0]["assignment_id"]
    s, rubric = judge.call("GET", f"{E}/rubric")
    cells = [{"criterion_id": c["id"], "value": 4} for c in rubric["criteria"]]
    codes = burst(n, lambda i: judge.call("PUT", f"{E}/assignments/{aid}/score", {"cells": cells, "submitted": True})[0])
    s, mine = judge.call("GET", f"{E}/scores")
    rep.check("parallel review saves leave one review", len(mine) == 1 and 500 not in codes, f"reviews {len(mine)}, codes {Counter(codes)}")

    # 5. Organizer opens voting; one voter hammers "open ballot" -> one ballot.
    org.call("PATCH", E, {"voting_opens_at": "2020-01-01T00:00:00Z", "voting_closes_at": "2030-01-01T00:00:00Z"})
    voter = user(0, "voter")
    results = burst(n, lambda i: voter.call("POST", f"{E}/ballots", {}))
    tokens = {r[1]["token"] for r in results if r[0] == 200}
    rep.check("parallel ballot creation gives one ballot per voter", len(tokens) == 1 and all(r[0] in (200, 409) for r in results), f"distinct ballots {len(tokens)}, codes {Counter(r[0] for r in results)}")

    # 6. Quadratic budget under concurrency: budget 9, many parallel 2-vote (4 credit) casts.
    token = tokens.pop()
    projects = [team["submission"]["id"], sub["id"]]
    burst(n, lambda i: voter.call("POST", f"/v1/ballots/{token}/votes", {"submission_id": projects[i % 2], "units": 2}))
    s, ballot = voter.call("GET", f"/v1/ballots/{token}")
    rep.check("parallel quadratic votes never overspend the budget", ballot["spent"] <= ballot["budget"], f"spent {ballot['spent']} of {ballot['budget']}")

    # 7. Many voters at once; the tally equals the sum of ballots.
    voters = [user(i + 1, "voter") for i in range(n)]
    s_codes = burst(n, lambda i: voters[i].call("POST", f"{E}/ballots", {}))
    toks = [r[1]["token"] for r in s_codes if r[0] == 200]
    burst(len(toks), lambda i: voters[i].call("POST", f"/v1/ballots/{toks[i]}/votes", {"submission_id": projects[0], "units": 1}))
    org.call("PATCH", E, {"voting_closes_at": "2021-01-01T00:00:00Z"})
    s, csv_body = org.call("GET", f"{E}/export/votes.csv")
    text = csv_body.decode() if isinstance(csv_body, bytes) else str(csv_body)
    tally = {line.split(",")[0]: int(line.rsplit(",", 1)[1]) for line in text.strip().splitlines()[1:]}
    expected = len(toks) + sum(v for k, v in ballot["votes"].items() if k == projects[0])
    rep.check("tally equals the sum of concurrent ballots", tally.get(projects[0]) == expected, f"tally {tally.get(projects[0])}, expected {expected}")

    # 8. The audit chain survived every concurrent writer.
    s, chain = org.call("GET", f"{E}/audit/verify")
    rep.check("audit hash chain verifies after the bursts", chain.get("ok") is True, json.dumps(chain))

    print("Portal concurrency checks (tests/perf/concurrency.py)")
    print(f"portal: {base}   bursts of {n} simultaneous requests   {time.perf_counter() - started:.1f}s")
    print()
    rep.print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
