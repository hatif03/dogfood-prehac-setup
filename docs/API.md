# REST API

Every screen in the portal is a call to this API; there is no private backend for the UI. The machine-readable contract is the OpenAPI 3.1 document:

- live: `http://localhost:8080/openapi.json`, interactive docs at `http://localhost:8080/docs`
- committed: [docs/openapi.json](openapi.json) (regenerate with `curl -s localhost:8000/openapi.json > docs/openapi.json`)

Every operation has a summary, and `tests/api/test_integrity.py::test_openapi_documents_every_route` fails if one is added without it. `tests/api/test_api_first.py` scans the web app for every `/v1/...` call and fails if any is not a documented operation; [docs/UI-API-MAP.md](UI-API-MAP.md) is the generated map from each UI call to its operation.

## Conventions

- **Base path** `/v1`. The web origin (`:8080`) proxies it; the API also listens on `:8000`.
- **Events** are addressed by UUID or slug: `/v1/events/sample-hack-2026/...`.
- **JSON** in and out, except CSV exports and the CSV import (`text/csv`).
- **Timestamps** are ISO 8601 UTC (`2026-03-01T18:00:00Z`).
- **Errors** are `{"detail": "<readable sentence>"}` (validation errors: `{"detail": [ {loc, msg, ...} ]}`).

| Status | Meaning here |
| --- | --- |
| 401 | Not signed in |
| 403 | Signed in, not allowed (wrong role, a peer's scores, submissions closed, results hidden) |
| 404 | Not found, or an object that belongs to someone else (deliberately indistinguishable) |
| 409 | Conflicts with current state (slug taken, already on a team, voting still open) |
| 422 | Invalid input |
| 429 | Rate limited |

## Authentication

Three ways, checked in this order:

1. `X-API-Key: pk_...` minted by an organizer; acts as that organizer, inside that event only.
2. `Cookie: portal_session=<token>`, set by `POST /v1/auth/login` (`HttpOnly`, `SameSite=Lax`).
3. `Authorization: Bearer <session token>`.

```bash
# sign in, keep the cookie
curl -c jar -X POST localhost:8080/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"organizer@portal.local","password":"password"}'

# who am I, and what am I in each event
curl -b jar localhost:8080/v1/auth/me

# mint an API key for a script (the secret is shown once)
curl -b jar -X POST localhost:8080/v1/events/sample-hack-2026/api-keys \
  -H 'content-type: application/json' -d '{"name":"results-bot"}'
curl -H 'X-API-Key: pk_...' localhost:8080/v1/events/sample-hack-2026/dashboard
```

The seed prints fixed demo session tokens on boot (`DEMO_SESSIONS=true`), which is what `.dogfood.toml` hands to the acceptance checker:

```bash
curl -H 'Cookie: portal_session=demo_jdg_a_91bc07' localhost:8080/v1/events/sample-hack-2026/scores
```

## Resources

| Area | Main operations |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/work` (each of your events with your role and next action) |
| Events | `GET/POST /events`, `GET/PATCH /events/{e}`, `PUT /events/{e}/tracks`, `PUT /events/{e}/prizes`, `GET/PUT /events/{e}/rubric`, `GET /events/{e}/people`, `POST /events/{e}/roles`, `POST /events/{e}/publish`, `POST /events/{e}/archive` (read-only forever) |
| Gallery and submissions | `GET /events/{e}/projects` (`?q=&track=&tag=`), `GET /events/{e}/projects/{id}`, `POST /events/{e}/projects` (save draft), `POST .../submit`, `POST .../unsubmit`, `POST .../images`, `POST .../flags/clear` |
| Teams | `POST /events/{e}/teams`, `GET /events/{e}/team`, `POST /events/{e}/teams/rotate-invite`, `GET /invites/{token}`, `POST /invites/{token}/accept` |
| Judging | `POST/GET /events/{e}/judge-invites`, `GET /judge-invites/{token}`, `POST /judge-invites/{token}/accept`, `POST /events/{e}/assignments`, `GET /events/{e}/assignments/mine`, `PUT /events/{e}/assignments/{a}/score`, `GET /events/{e}/scores` (`?judge=&project=`), `GET /events/{e}/scores/{id}`, `GET /events/{e}/dashboard` |
| Results | `POST/GET /events/{e}/normalization`, `GET /events/{e}/results` |
| Pairwise | `GET /events/{e}/pairwise/next`, `POST /events/{e}/pairwise`, `POST /events/{e}/pairwise/fit`, `GET /events/{e}/pairwise` |
| Voting | `POST /events/{e}/ballots` (modes: `open`, `authenticated`, `email_gated`, `link`), `GET /ballots/{token}`, `POST /ballots/{token}/votes`, `POST /events/{e}/vote-links` |
| Comments | `GET/POST /events/{e}/projects/{id}/comments`, `POST /events/{e}/comments/{id}/hide` |
| Import and export | `POST /import`, `POST /events/{e}/import/projects.csv`, `GET /events/{e}/export.json`, `GET /events/{e}/export/{kind}.csv` (one per stage: `registrations`, `teams`, `submissions`, `eligibility`, `judges`, `assignments`, `scores`, `normalization`, `results`, `votes`, `records`, `audit`), `GET /events/{e}/archive.zip` (all of it, plus the audit chain and public key) |
| Audit | `GET /events/{e}/audit` (`?action=&before=&limit=`), `GET /events/{e}/audit/verify` |
| Integrations | `POST/GET/DELETE /events/{e}/api-keys`, `POST/GET/DELETE /events/{e}/webhooks`, `POST .../webhooks/{id}/test`, `GET .../webhooks/{id}/deliveries`, `GET /webhook-actions` |
| Records | `POST/GET /events/{e}/records`, `GET /records/{id}`, `GET /records/{id}/certificate`, `POST /records/verify`, `GET /.well-known/portal-signing-key.pem`, `GET /.well-known/portal-signing-key.json` |
| Widget | `GET /public/widget/{token}`, and `<script src="http://localhost:8080/embed.js" data-token="...">` on any page |

## Walkthrough: one event, end to end, with curl

```bash
B=localhost:8080/v1; J='content-type: application/json'
# organizer creates an event
curl -b org -c org -X POST $B/auth/login -H "$J" -d '{"email":"organizer@portal.local","password":"password"}'
curl -b org -X POST $B/events -H "$J" -d '{"name":"Curl Hack","slug":"curl-hack",
  "submissions_deadline":"2030-01-01T00:00:00Z","tracks":[{"name":"Tools"}],
  "rubric":{"criteria":[{"name":"Impact","weight":2},{"name":"Craft","weight":1}]}}'

# a hacker registers, forms a team, submits
curl -c me -X POST $B/auth/register -H "$J" -d '{"email":"me@example.com","password":"password1","display_name":"Me"}'
curl -b me -X POST $B/events/curl-hack/teams -H "$J" -d '{"name":"Team Me"}'      # returns invite_token
TRACK=$(curl -s $B/events/curl-hack | python -c "import json,sys;print(json.load(sys.stdin)['tracks'][0]['id'])")
ID=$(curl -s -b me -X POST $B/events/curl-hack/projects -H "$J" \
  -d "{\"title\":\"Thing\",\"summary\":\"Does a thing\",\"track_id\":\"$TRACK\"}" | python -c "import json,sys;print(json.load(sys.stdin)['id'])")
curl -b me -X POST $B/events/curl-hack/projects/$ID/submit

# organizer adds a judge and assigns
curl -b org -X POST $B/events/curl-hack/roles -H "$J" -d '{"user_email":"diego.herrera@example.org","role":"judge"}'
curl -b org -X POST $B/events/curl-hack/assignments -H "$J" -d '{}'

# the judge scores (by criterion key)
curl -c j -X POST $B/auth/login -H "$J" -d '{"email":"diego.herrera@example.org","password":"password"}'
A=$(curl -s -b j $B/events/curl-hack/assignments/mine | python -c "import json,sys;print(json.load(sys.stdin)['items'][0]['assignment_id'])")
curl -b j -X PUT $B/events/curl-hack/assignments/$A/score -H "$J" \
  -d '{"cells":[{"key":"impact","value":5},{"key":"craft","value":4}],"comment":"Great","submitted":true}'

# organizer normalizes, publishes, exports
curl -b org -X POST $B/events/curl-hack/normalization -H "$J" -d '{}'
curl -b org -X POST $B/events/curl-hack/publish -H "$J" -d '{"published":true}'
curl $B/events/curl-hack/results
curl -b org $B/events/curl-hack/export/results.csv
```

## Webhooks

Webhooks cover every UI action: every audited, event-scoped action (the same entries the organizer sees in the audit log) is also a webhook action. Register with `POST /v1/events/{e}/webhooks {"url": "...", "actions": [...]}`. Leave `actions` empty for everything, give exact names, or use prefixes such as `"score.*"`. `GET /v1/webhook-actions` lists them all, currently: event (`event.create`, `event.update`, `event.tracks`, `event.prizes`, `event.archive`, `role.assign`), teams (`team.create`, `team.join`), submissions (`submission.save`, `submission.submit`, `flag.clear`, `import.fixture`, `import.csv`), judging (`judge.invite`, `judge.join`, `assignment.generate`, `rubric.update`, `score.draft`, `score.submit`, `normalization.run`, `pairwise.decide`, `pairwise.fit`, `results.published`, `results.unpublished`), community (`ballot.open`, `ballot.email`, `ballot.links`, `vote.cast`, `comment.create`, `comment.hide`, `comment.restore`), integrations (`apikey.create`, `apikey.revoke`, `webhook.create`, `records.issue`) and `ping`. The payload carries the audit sequence number, the readable summary, the actor and the resource.

Each delivery is a `POST` with:

```text
Content-Type: application/json
X-Portal-Event: submission.submitted
X-Portal-Delivery: <uuid>          dedupe on this; delivery is at-least-once
X-Portal-Timestamp: <unix seconds>
X-Portal-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + raw body)>

{"id": "<delivery id>", "action": "submission.submitted", "event_id": "<uuid>", "payload": {...}}
```

Verify in Python:

```python
import hashlib, hmac
expected = "sha256=" + hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
assert hmac.compare_digest(expected, request.headers["X-Portal-Signature"])
```

A non-2xx answer or a network error is retried after 10 s, 40 s, 160 s, 640 s and 2560 s, then marked failed. `GET .../webhooks/{id}/deliveries` shows every attempt.

## Signed records

`GET /v1/records/{id}` returns `payload`, `canonical` (the exact UTF-8 string that was signed: sorted keys, no whitespace), a hex Ed25519 `signature`, and the public key as PEM and JWK. Verify without trusting the portal:

```bash
curl -s localhost:8080/v1/records/<id> > record.json
curl -s localhost:8080/.well-known/portal-signing-key.pem > key.pem
cd src/api && python -m app.signing ../../record.json ../../key.pem    # prints "valid"
```

The `/verify` page does the same check in the browser with WebCrypto.

## Rate limits

Per minute unless noted: login and register 10 per IP and per email; ballot creation and vote casting 30 per IP; open-link ballots 20 per IP per day; voting-link emails 3 per address per hour; comments 5 per user. Exceeding a limit returns 429. Limits live in Redis; if Redis is configured but unreachable, limited routes fail closed.
