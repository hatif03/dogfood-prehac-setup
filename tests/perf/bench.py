#!/usr/bin/env python3
"""Scalability benchmark against a running portal. Standard library only.

Imports a synthetic event shaped like the fixture but N times bigger (through the public
POST /v1/import), then times the endpoints organizers and visitors hit hardest.

    python3 tests/perf/bench.py .dogfood.toml --projects 2000 --judges 300 --reviews 5 > docs/perf-bench.txt
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "spec"))
from run import load_config  # noqa: E402


def request(url, header=None, method="GET", body=None, timeout=600):
    req = urllib.request.Request(url, method=method)
    if header:
        k, _, v = header.partition(":")
        req.add_header(k.strip(), v.strip())
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
            return r.status, data, time.perf_counter() - t
    except urllib.error.HTTPError as e:
        return e.code, e.read(), time.perf_counter() - t


def synthetic(projects: int, judges: int, reviews: int, seed: int = 1) -> dict:
    rng = random.Random(seed)
    tag = uuid.uuid4().hex[:6]
    tracks = [{"id": f"t{i}", "name": f"Track {i}"} for i in range(max(8, projects // 50))]
    judge_rows = [
        {"id": f"j{i}", "name": f"Judge {i}", "email": f"bench-{tag}-j{i}@example.org", "tracks": [tracks[i % len(tracks)]["id"], tracks[(i + 3) % len(tracks)]["id"]]}
        for i in range(judges)
    ]
    by_track = {t["id"]: [j for j in judge_rows if t["id"] in j["tracks"]] for t in tracks}
    teams, projs, scores = [], [], []
    quality = {}
    for i in range(projects):
        track = tracks[i % len(tracks)]["id"]
        teams.append({"id": f"tm{i}", "name": f"Team {i}", "members": [f"bench-{tag}-m{i}-{k}@example.org" for k in range(3)]})
        projs.append({"id": f"p{i}", "team": f"tm{i}", "track": track, "title": f"Project {i}", "summary": "Synthetic benchmark project.", "repo_url": f"https://example.org/{i}", "submitted_at": "2026-01-01T00:00:00Z"})
        quality[f"p{i}"] = rng.gauss(0, 0.7)
        for j in rng.sample(by_track[track], min(reviews, len(by_track[track]))):
            v = lambda: min(5, max(1, round(3 + quality[f"p{i}"] + rng.gauss(0, 0.6))))  # noqa: E731
            scores.append({"judge": j["id"], "project": f"p{i}", "criteria": {"functionality": v(), "quality": v(), "innovation": v()}, "comment": ""})
    return {
        "event": {"id": f"bench_{tag}", "name": f"Benchmark {tag}", "submissions_close": "2026-01-02T00:00:00Z"},
        "tracks": tracks, "judges": judge_rows, "teams": teams, "projects": projs, "scores": scores,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--projects", type=int, default=2000)
    ap.add_argument("--judges", type=int, default=300)
    ap.add_argument("--reviews", type=int, default=5)
    ap.add_argument("--repeat", type=int, default=5)
    args = ap.parse_args()
    cfg = load_config(args.config)
    base = cfg["portal"]["base_url"].rstrip("/")
    org = cfg["auth"]["organizer"]

    doc = synthetic(args.projects, args.judges, args.reviews)
    print("Portal scalability benchmark (tests/perf/bench.py)")
    print(f"portal: {base}")
    print(f"synthetic event: {len(doc['projects'])} projects, {len(doc['judges'])} judges, {len(doc['tracks'])} tracks, {len(doc['teams']) * 3} participants, {len(doc['scores'])} reviews")
    print()
    status, body, secs = request(f"{base}/v1/import", org, "POST", doc)
    if status != 200:
        print(f"import failed: {status} {body[:300]!r}")
        return 1
    slug = json.loads(body)["event"]["slug"]
    print(f"{'POST /v1/import (whole event, then a normalization run)':<58} {secs:8.2f} s")
    print()
    E = f"{base}/v1/events/{slug}"
    cases = [
        ("GET gallery (public, all projects)", f"{E}/projects", None, "GET"),
        ("GET event detail", E, None, "GET"),
        ("GET dashboard (organizer, live view)", f"{E}/dashboard", org, "GET"),
        ("GET scores (organizer, every review)", f"{E}/scores", org, "GET"),
        ("POST normalization (fit + store a run)", f"{E}/normalization", org, "POST"),
        ("GET results.csv", f"{E}/export/results.csv", org, "GET"),
        ("GET scores.csv", f"{E}/export/scores.csv", org, "GET"),
        ("GET export.json (whole event)", f"{E}/export.json", org, "GET"),
        ("GET audit/verify (recompute the hash chain)", f"{E}/audit/verify", org, "GET"),
    ]
    print(f"{'endpoint':<48} {'p50':>9} {'p95':>9} {'max':>9} {'size':>10}")
    for label, url, header, method in cases:
        times, size = [], 0
        for _ in range(args.repeat):
            status, body, secs = request(url, header, method, {} if method == "POST" else None)
            if status != 200:
                print(f"{label:<48} FAILED {status} {body[:120]!r}")
                break
            times.append(secs)
            size = len(body)
        if times:
            times.sort()
            p95 = times[min(len(times) - 1, int(round(0.95 * (len(times) - 1))))]
            print(f"{label:<48} {statistics.median(times) * 1000:7.0f}ms {p95 * 1000:7.0f}ms {times[-1] * 1000:7.0f}ms {size / 1024:8.0f}KB")
    print()
    print(f"{args.repeat} requests per endpoint, sequential, measured from the client.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
