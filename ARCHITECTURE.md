# Architecture

## Shape

```text
browser ──► web  (Next.js 15, standalone, :8080) ── rewrites /v1/*, /docs, /openapi.json, /.well-known/* ──► api (FastAPI, :8000)
              │ server components fetch the API directly, forwarding the session cookie          │
              │                                                                                    ├──► postgres 16   all state
              │                                                                                    ├──► redis 7       rate limits
              │                                                                                    ├──► minio         screenshots
              │                                                                                    └──► mailpit       invites, voting links
              └── api also runs a webhook delivery thread (DB-backed queue, retries with backoff)
```

`docker compose up` builds two images and pulls four. After the first build nothing touches the network: fonts are bundled (`geist`), mail goes to Mailpit, files go to MinIO, and no code calls a hosted service.

## One origin

The browser only ever talks to `http://localhost:8080`. Next.js proxies API paths to the API container, so:

- the session cookie is first-party, `HttpOnly`, `SameSite=Lax`, with no CORS in the browser path;
- `.dogfood.toml` has a single `base_url`, and the checker's requests go through the same proxy real users do;
- the API is also published on :8000 for curl and scripts.

## API (`src/api`)

FastAPI with SQLAlchemy 2, sync sessions (a hackathon is dozens of requests a second at peak, not thousands).

| Module | Responsibility |
| --- | --- |
| `routers/` | HTTP only: parse, authorize, call a service, shape the response. `auth`, `events`, `projects` (gallery, teams, submissions), `judging`, `votes`, `exports`, `integrations` |
| `deps.py` | Resolves the caller (cookie, bearer token or API key), the event (UUID or slug) and the **Actor** |
| `rbac.py` | `Actor`: the caller's role in this event, their tracks and team. Every route asks it: `require_organizer()`, `require_judge()`, `require_score_reader()`, `may_read_judge()`, `sees_track()` |
| `judging_math.py` | Pure functions: weighted score, additive normalization, Bradley–Terry, rank-breaking, active pair selection, Kendall τ. No I/O, directly unit-tested |
| `scoring.py`, `assignment.py` | Glue between the maths and the database |
| `importer.py` | fixtures.json and CSV in, fixtures.json out, duplicate detection |
| `audit.py` | Hash-chained append-only log with readable summaries |
| `signing.py` | Ed25519 key, canonical JSON, sign and verify, offline verifier CLI |
| `webhooks.py` | Transactional enqueue, background delivery, HMAC signatures, exponential backoff |
| `rate_limit.py` | Redis fixed-window counters, in-memory fallback when Redis is not configured |
| `seed.py` | Imports `spec/fixtures.json`, creates the playground, mints and prints demo sessions |
| `proof.py` | Regenerates `docs/normalization-proof.md` |

### Why the Actor

Role isolation is the check that most often goes missing, so it is built in once rather than repeated. A route cannot get event data without resolving an `Actor` for that event, and the Actor's methods are the only place role rules live. The rules are small enough to read in one screen (`rbac.py`), and `tests/api/test_isolation.py` runs every sensitive route as every role.

Two refusal styles, on purpose:

- **403** when the caller asks for something by *name* they are not allowed (`?judge=<peer>`, the organizer dashboard). The checker expects this, and it is honest.
- **404** when the caller asks for an *object by id* that belongs to someone else (a peer's review or assignment). That answers exactly like a missing row, so ids cannot be probed.

### Transactions

Each request is one transaction. Audit rows and webhook deliveries are written inside it, so a failed request leaves no audit entry for something that did not happen and never fires a webhook for it. On Postgres the audit chain takes a transaction-scoped advisory lock, so concurrent writers cannot fork the chain.

## Web (`src/web`)

Next.js App Router, React 19, **Radix Themes** as the design system (with Radix Primitives where Themes has no component), Tailwind CSS v4 for layout, `motion` for animation, `lucide-react` icons. `components/ui` wraps Radix with the portal's props; Tailwind's colour tokens map onto Radix's 12-step scales, so light and dark themes and text contrast come from Radix. Motion follows Amicro's rules (ease `[0.16, 1, 0.3, 1]`, 250–400 ms entrances, feedback on every action), with a few of its MIT components vendored in `components/amicro/` (the npm package is not used: it depends on an AI SDK and a server framework at runtime). Credits are in `THIRD_PARTY_NOTICES.md`.

- **One primary action per view.** The lime accent marks the thing to do next; everything else is gray.
- **A home that knows the viewer.** Signed in, `/` lists each event with the viewer's role and next action (`GET /v1/auth/work`); signed out, it is the landing page.

- **Server components** render public, data-first pages (home, gallery, project pages, the event shell) so the HTML carries real content and first paint does not wait for JavaScript.
- **Client components** handle interactive screens: the judge console (keyboard-driven scoring), the organizer console (live-polling dashboard, rubric editor, charts drawn in SVG), the submission editor (autosave), ballots.
- `lib/types.ts` holds the API's response shapes in one place. `lib/api.ts` is the only fetch wrapper in the browser; `lib/server-api.ts` is the only one on the server.
- Motion respects `prefers-reduced-motion` globally (`MotionConfig reducedMotion="user"` plus a CSS kill switch for keyframes).
- The UI never decides who may see what. It renders whatever the API returns, and shows a designed refusal when the API says 401/403.

## Workers, concurrency and background work

The API runs several uvicorn workers (`API_WORKERS`, default 4) against one Postgres and one Redis:

- **Startup** takes a Postgres advisory lock, so exactly one worker creates tables and seeds; the signing key is created with an exclusive file open, so all workers sign with the same key.
- **Races are closed in the database.** One ballot per voter, one review per (judge, project), one team per person per event and one vote per (ballot, project) are unique constraints. Paths that check then write lock the row first (`FOR UPDATE`: the ballot when voting, the team when joining or saving, the assignment when scoring), so a quadratic budget or a team-size cap cannot be overrun by simultaneous requests. A request that loses a race gets 409, never 500. `tests/perf/concurrency.py` checks all of this with bursts of simultaneous requests (see docs/PERFORMANCE.md).
- **The audit chain** takes a transaction-scoped advisory lock, so concurrent writers cannot fork it.
- **Webhooks.** Each worker runs a daemon thread that drains `webhook_deliveries` every two seconds; rows are claimed with `FOR UPDATE SKIP LOCKED`, so a delivery goes to exactly one worker. Delivery is at-least-once: receivers should dedupe on `X-Portal-Delivery`.

## Configuration

Everything is an environment variable with a safe local default (`src/api/app/config.py`). The ones an organizer changes for a real event are `SESSION_SECRET`, `DEMO_SESSIONS=false` and `PUBLIC_URL`. See `.env.example`.

## Testing

- `tests/api`: 70+ pytest tests against an in-memory SQLite database, including the real fixture import and the seven official checks.
- `spec/run.py` (official) and `tests/acceptance/extended.py` (ours, same style, T2–T4) against the running stack; both reports are committed.
- `python -m app.judging_math` runs the maths self-check with no dependencies.

## Decisions

- **Python and TypeScript, not one language.** The judging maths reads best in Python, and FastAPI generates the OpenAPI document the API-first bonus asks for. The UI reads best in React.
- **Pure-Python maths, no numpy.** A reviewer can read every estimator in one file. Backfitting converges in under 100 sweeps on the fixture and in about 200 on a 2 000-project event. Bradley–Terry is solved by Newton's method with a conjugate-gradient inner solve (its Hessian is a graph Laplacian), because the textbook MM iteration needed thousands of sweeps on the weakly connected comparison graphs that track-scoped judging produces: 160 s against 1 s at 400 projects.
- **Sync SQLAlchemy.** Simpler to reason about for transactional audit and webhook writes; the load does not need async.
- **Polling over websockets** for the live dashboard (every 4 s). It survives proxies and restarts and is plenty for an organizer watching progress.
