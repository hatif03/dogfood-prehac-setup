#!/usr/bin/env python3
"""Extended acceptance checks for T2-T4 behaviour that the official run.py does not probe.

Same rules as run.py: standard library only, plain HTTP against the running portal, the
headers from .dogfood.toml, nothing faked. Some checks need Mailpit (voting links) or a
webhook receiver on this machine; when those are unreachable the check prints SKIP, not PASS.

    python3 tests/acceptance/extended.py .dogfood.toml > acceptance-report-extended.txt

It writes a little data (a comment, a webhook, an API key, a signed record, an imported copy
of a tiny event). Run it against a demo portal, not a live event.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import http.server
import json
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "spec"))
from run import load_config  # noqa: E402  (the official TOML loader)

TIMEOUT = 15


def request(url, header=None, method="GET", body=None, extra=None):
    req = urllib.request.Request(url, method=method)
    if header:
        name, _, value = header.partition(":")
        req.add_header(name.strip(), value.strip())
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}"


def js(text):
    try:
        return json.loads(text)
    except ValueError:
        return None


class Check:
    def __init__(self, tier, label):
        self.tier, self.label, self.status, self.detail = tier, label, "FAIL", []

    def ok(self, cond, note=""):
        self.status = "PASS" if cond else "FAIL"
        if not cond and note:
            self.detail.append(note)
        return cond

    def skip(self, why):
        self.status, self.detail = "SKIP", [why]


class Receiver(http.server.BaseHTTPRequestHandler):
    got: list = []

    def do_POST(self):  # noqa: N802
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        Receiver.got.append((dict(self.headers), body))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


def mailpit_links(mailpit, address):
    status, text = request(f"{mailpit}/api/v1/search?query=to:{address}")
    msgs = (js(text) or {}).get("messages") or []
    links = []
    for m in msgs:
        _, body = request(f"{mailpit}/api/v1/message/{m['ID']}")
        found = re.search(r"ballot=([\w-]+)", (js(body) or {}).get("Text", ""))
        if found:
            links.append(found.group(1))
    return links


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--event", default="sample-hack-2026")
    ap.add_argument("--mailpit", default="http://localhost:8025")
    ap.add_argument("--webhook-host", default="host.docker.internal", help="how the API container reaches this machine")
    ap.add_argument("--fixtures", default=str(Path(__file__).resolve().parents[2] / "spec" / "fixtures.json"))
    args = ap.parse_args()

    cfg = load_config(args.config)
    base = cfg["portal"]["base_url"].rstrip("/")
    auth = cfg.get("auth", {})
    E = f"{base}/v1/events/{args.event}"
    org, ja, jb, prt = (auth.get(k) for k in ("organizer", "judge_a", "judge_b", "participant"))
    run_id = uuid.uuid4().hex[:8]
    checks: list[Check] = []

    def check(tier, label):
        c = Check(tier, label)
        checks.append(c)
        return c

    # --- T2 beyond run.py -------------------------------------------------------------------
    c = check("T2", "rubric weights are configurable and sum to 1")
    s, t = request(f"{E}/rubric")
    crit = (js(t) or {}).get("criteria") or []
    c.ok(s == 200 and crit and abs(sum(x["weight"] for x in crit) - 1) < 1e-6, f"GET rubric -> {s}")

    c = check("T2", "peer's review object is 404, not 200")
    s, t = request(f"{E}/scores", header=ja)
    own = js(t) or []
    if own:
        s2, _ = request(f"{E}/scores/{own[0]['id']}", header=jb)
        c.ok(s2 == 404, f"GET judge_a's score as judge_b -> {s2}")
    else:
        c.ok(False, "judge_a has no scores to probe with")

    c = check("T2", "judges cannot open the organizer dashboard")
    s, _ = request(f"{E}/dashboard", header=ja)
    c.ok(s == 403, f"GET dashboard as judge -> {s}")

    c = check("T2", "live organizer dashboard reports progress")
    s, t = request(f"{E}/dashboard", header=org)
    d = js(t) or {}
    c.ok(s == 200 and d.get("kpis", {}).get("judges", 0) > 0 and d.get("judges"), f"GET dashboard -> {s}")

    c = check("T2", "normalization runs and flags the constant rater")
    s, t = request(f"{E}/normalization", header=org, method="POST", body={})
    run = js(t) or {}
    c.ok(s == 200 and run.get("method") and run.get("excluded_judges"), f"POST normalization -> {s}")

    # --- T3 ---------------------------------------------------------------------------------
    c = check("T3", "results hidden while voting is open")
    s, _ = request(f"{E}/results")
    c.ok(s in (401, 403), f"GET results as visitor -> {s}")

    c = check("T3", "email-gated ballot never returns the token")
    a1, a2 = f"probe-{run_id}-a@example.org", f"probe-{run_id}-b@example.org"
    s, t = request(f"{E}/ballots", method="POST", body={"email": a1})
    c.ok(s == 200 and "token" not in (js(t) or {}), f"POST ballot -> {s} {t[:120]}")
    request(f"{E}/ballots", method="POST", body={"email": a2})

    c = check("T3", "each ballot has its own random order")
    time.sleep(1)
    t1, t2 = mailpit_links(args.mailpit, a1), mailpit_links(args.mailpit, a2)
    if not (t1 and t2):
        c.skip(f"no voting links found in Mailpit at {args.mailpit}")
    else:
        o1 = [p["id"] for p in (js(request(f"{base}/v1/ballots/{t1[0]}")[1]) or {}).get("projects", [])]
        o2 = [p["id"] for p in (js(request(f"{base}/v1/ballots/{t2[0]}")[1]) or {}).get("projects", [])]
        c.ok(o1 and sorted(o1) == sorted(o2) and o1 != o2, "two ballots came back in the same order")
        c2 = check("T3", "ballot enforces vote mode (1p1v moves vote, quadratic enforces credit budget)")
        ballot0 = js(request(f"{base}/v1/ballots/{t1[0]}")[1]) or {}
        mode = ballot0.get("vote_mode", "one_person_one_vote")
        if mode == "quadratic":
            s, _ = request(
                f"{base}/v1/ballots/{t1[0]}/votes",
                method="POST",
                body={"submission_id": o1[0], "units": 3},
            )
            over = request(
                f"{base}/v1/ballots/{t1[0]}/votes",
                method="POST",
                body={"submission_id": o1[1], "units": 5},
            )
            c2.ok(s == 200 and over[0] == 422, f"quadratic overspend -> {over[0]} {over[1][:120]}")
        else:
            s, _ = request(f"{base}/v1/ballots/{t1[0]}/votes", method="POST", body={"submission_id": o1[0]})
            s, t = request(f"{base}/v1/ballots/{t1[0]}/votes", method="POST", body={"submission_id": o1[1]})
            c2.ok(s == 200 and (js(t) or {}).get("votes") == {o1[1]: 1}, f"second vote -> {s} {t[:120]}")

    c = check("T3", "duplicate submission detected and kept out of the gallery")
    s, t = request(f"{E}/projects")
    ids = [p.get("external_id") for p in js(t) or []]
    s2, t2 = request(f"{E}/dashboard", header=org)
    dups = ((js(t2) or {}).get("integrity") or {}).get("duplicates") or []
    c.ok(s == 200 and "prj_41" not in ids and dups, "duplicate not flagged")

    c = check("T3", "comments need an account, then appear publicly")
    projects = js(t) or []
    pid = projects[0]["id"] if projects else ""
    s_anon, _ = request(f"{E}/projects/{pid}/comments", method="POST", body={"body": "anon"})
    s, _ = request(f"{E}/projects/{pid}/comments", header=prt, method="POST", body={"body": f"acceptance probe {run_id}"})
    _, t = request(f"{E}/projects/{pid}/comments")
    c.ok(s_anon == 401 and s == 200 and run_id in t, f"anon {s_anon}, participant {s}")

    c = check("T3", "audit trail is readable and its hash chain verifies")
    s, t = request(f"{E}/audit", header=org)
    s2, t2 = request(f"{E}/audit/verify", header=org)
    log = js(t) or []
    c.ok(s == 200 and log and log[0].get("summary") and (js(t2) or {}).get("ok") is True, f"audit {s}, verify {t2[:80]}")

    # --- T4 ---------------------------------------------------------------------------------
    c = check("T4", "OpenAPI document describes the REST API")
    s, t = request(f"{base}/openapi.json")
    c.ok(s == 200 and len((js(t) or {}).get("paths", {})) >= 50, f"GET openapi.json -> {s}")

    c = check("T4", "API key authenticates, revoke takes effect")
    s, t = request(f"{E}/api-keys", header=org, method="POST", body={"name": f"probe-{run_id}"})
    key = js(t) or {}
    s1, _ = request(f"{E}/dashboard", extra={"X-API-Key": key.get("secret", "")})
    request(f"{E}/api-keys/{key.get('id')}", header=org, method="DELETE")
    s2, _ = request(f"{E}/dashboard", extra={"X-API-Key": key.get("secret", "")})
    c.ok(s == 200 and s1 == 200 and s2 == 401, f"create {s}, use {s1}, after revoke {s2}")

    c = check("T4", "webhook delivered with a valid HMAC signature")
    sock = socket.socket()
    sock.bind(("0.0.0.0", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = http.server.HTTPServer(("0.0.0.0", port), Receiver)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    s, t = request(f"{E}/webhooks", header=org, method="POST", body={"url": f"http://{args.webhook_host}:{port}/hook", "actions": ["ping"]})
    hook = js(t) or {}
    request(f"{E}/webhooks/{hook.get('id')}/test", header=org, method="POST")
    for _ in range(20):
        if Receiver.got:
            break
        time.sleep(0.5)
    request(f"{E}/webhooks/{hook.get('id')}", header=org, method="DELETE")
    server.shutdown()
    if not Receiver.got:
        c.skip(f"no delivery reached http://{args.webhook_host}:{port}; pass --webhook-host if the API cannot reach this machine that way")
    else:
        headers, body = Receiver.got[0]
        h = {k.lower(): v for k, v in headers.items()}
        want = hmac.new(hook.get("secret", "").encode(), h.get("x-portal-timestamp", "").encode() + b"." + body, hashlib.sha256).hexdigest()
        c.ok(h.get("x-portal-signature") == f"sha256={want}", "signature mismatch")

    c = check("T4", "signed judge record verifies; a tampered copy does not")
    s, t = request(f"{E}/records", header=org, method="POST", body={"kind": "judge", "user_emails": []})
    recs = js(t) or []
    if s == 200 and recs:
        rec = js(request(f"{base}/v1/records/{recs[0]['id']}")[1]) or {}
        good = js(request(f"{base}/v1/records/verify", method="POST", body={"payload": rec.get("payload"), "signature": rec.get("signature")})[1]) or {}
        forged = dict(rec.get("payload") or {}, reviews_submitted=999)
        bad = js(request(f"{base}/v1/records/verify", method="POST", body={"payload": forged, "signature": rec.get("signature")})[1]) or {}
        s_pem, pem = request(f"{base}/.well-known/portal-signing-key.pem")
        s_cert, cert = request(f"{base}/v1/records/{recs[0]['id']}/certificate")
        c.ok(good.get("valid") is True and bad.get("valid") is False and "PUBLIC KEY" in pem and s_cert == 200, f"valid={good} forged={bad} pem={s_pem} cert={s_cert}")
    else:
        c.ok(False, f"POST records -> {s}")

    c = check("T4", "embeddable widget serves public gallery data")
    s, t = request(E, header=org)
    token = (js(t) or {}).get("widget_token", "")
    s1, t1 = request(f"{base}/v1/public/widget/{token}")
    s2, t2 = request(f"{base}/embed.js")
    c.ok(s1 == 200 and len((js(t1) or {}).get("projects", [])) > 0 and s2 == 200 and "iframe" in t2, f"widget {s1}, embed.js {s2}")

    c = check("T4", "bulk export round-trips the fixture exactly")
    fixture = json.loads(Path(args.fixtures).read_text(encoding="utf-8"))
    s, t = request(f"{E}/export.json", header=org)

    def canon(doc):
        out = {"event": doc["event"]}
        for k in ("tracks", "judges", "teams", "projects", "scores"):
            rows = [dict(r, **{x: sorted(r[x]) for x in ("tracks", "members") if x in r}) for r in doc.get(k, [])]
            out[k] = sorted(rows, key=lambda r: json.dumps(r, sort_keys=True))
        return out

    c.ok(s == 200 and canon(js(t) or {"event": None}) == canon(fixture), f"GET export.json -> {s}")

    c = check("T4", "bulk import creates a new event")
    tiny = {
        "event": {"id": f"evt_probe_{run_id}", "name": f"Import probe {run_id}", "submissions_close": "2026-01-01T00:00:00Z"},
        "tracks": [{"id": "t1", "name": "Only track"}],
        "judges": [{"id": "j1", "name": "Probe Judge", "email": f"j-{run_id}@example.org", "tracks": ["t1"]}],
        "teams": [{"id": "tm1", "name": "Probe Team", "members": [f"m-{run_id}@example.org"]}],
        "projects": [{"id": "p1", "team": "tm1", "track": "t1", "title": f"Probe {run_id}", "summary": "s", "repo_url": "", "submitted_at": "2025-12-31T00:00:00Z"}],
        "scores": [{"judge": "j1", "project": "p1", "criteria": {"functionality": 4}, "comment": ""}],
    }
    s, t = request(f"{base}/v1/import", header=org, method="POST", body=tiny)
    c.ok(s == 200 and (js(t) or {}).get("stats", {}).get("projects") == 1, f"POST import -> {s} {t[:120]}")

    c = check("T4", "every CSV export answers with CSV")
    bad = []
    for kind in ("results", "scores", "submissions", "teams", "judges", "assignments", "audit"):
        s, t = request(f"{E}/export/{kind}.csv", header=org)
        if s != 200 or "," not in (t.splitlines() or [""])[0]:
            bad.append(f"{kind}:{s}")
    c.ok(not bad, "failed: " + ", ".join(bad))

    # Last, because it rate-limits this IP for a minute.
    c = check("T3", "login attempts are rate limited")
    codes = [request(f"{base}/v1/auth/login", method="POST", body={"email": f"nobody-{run_id}@example.org", "password": "wrong-password"})[0] for _ in range(12)]
    c.ok(429 in codes, f"codes {codes}")

    print("DOGFOOD 2026 extended acceptance report (tests/acceptance/extended.py)")
    print(f"portal: {base}")
    print(f"event: {args.event}")
    print()
    width = max(len(x.label) for x in checks) + 2
    for x in checks:
        print(f"{x.tier}  {x.label} {'.' * (width - len(x.label))} {x.status}")
        for line in x.detail:
            print(f"       {line}")
    print()
    for tier in ("T2", "T3", "T4"):
        rows = [x for x in checks if x.tier == tier]
        passed = sum(x.status == "PASS" for x in rows)
        skipped = sum(x.status == "SKIP" for x in rows)
        print(f"{tier}: {passed}/{len(rows)} pass" + (f", {skipped} skipped" if skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
