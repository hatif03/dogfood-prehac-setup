# Portal

**A self-hosted hackathon submission and judging platform.** Weighted rubrics, a documented and tested correction for lenient and harsh judges, role isolation enforced in the API, community voting that is hard to game, and a hash-chained audit log. It runs from one `docker compose up` with the network off.

Built for [Dogfood 2026](https://dogfoodhack.com/). MIT licensed.

| | |
| --- | --- |
| Tiers claimed | T1, T2, T3, T4 ([.dogfood.toml](.dogfood.toml)) |
| Official checker | [acceptance-report.txt](acceptance-report.txt): 7/7 checks pass, T1 and T2 verified. run.py has no T3/T4 checks, so it prints "claimed but not verified: T3 T4" for every team that claims them. |
| Our T2–T4 checks | [acceptance-report-extended.txt](acceptance-report-extended.txt): 21/21, from [tests/acceptance/extended.py](tests/acceptance/extended.py) (stdlib only, same style as run.py). Both reports come from a fresh `docker compose up`. |
| Seed data | the official [spec/fixtures.json](spec/fixtures.json), loaded through the same importer organizers use |
| Bonuses | [Normalization proof](docs/normalization-proof.md) · [Pairwise mode](docs/pairwise.md) · [Threat model](THREAT-MODEL.md) · [API first](docs/API.md) + [OpenAPI](docs/openapi.json) + [UI→API map](docs/UI-API-MAP.md) |
| Requirement by requirement | [docs/SPEC-COMPLIANCE.md](docs/SPEC-COMPLIANCE.md): every tier bullet, FIG.01 stage, deliverable and bonus → code → test |
| Load and races | [docs/PERFORMANCE.md](docs/PERFORMANCE.md): 2 000-project benchmark, concurrency invariants on Postgres |

## Run it

```bash
docker compose up --build
```

First build needs the network (images and packages). After that, nothing does.

| What | Where |
| --- | --- |
| Portal | http://localhost:8080 |
| API docs (OpenAPI, try-it-out) | http://localhost:8080/docs |
| Mail inbox (judge invites, voting links) | http://localhost:8025 |
| API directly, for curl | http://localhost:8000 |

On boot the API prints the demo session headers the acceptance checker uses:

```text
seeded. test logins (password for every seeded account: password):
  organizer    Cookie: portal_session=demo_org_7f2a9c41    (organizer@portal.local)
  judge_a      Cookie: portal_session=demo_jdg_a_91bc07    (diego.herrera@example.org)
  judge_b      Cookie: portal_session=demo_jdg_b_44de3e    (iva.petrova@example.org)
  participant  Cookie: portal_session=demo_prt_2e88f1      (priya1@example.org)
```

Then:

```bash
python3 spec/run.py .dogfood.toml                        # official checker
python3 tests/acceptance/extended.py .dogfood.toml       # our T2–T4 checks
```

Or run the full pre-freeze gate (health check, both reports, checker-parity pytest):

```powershell
.\scripts\verify-submission.ps1
```

```bash
./scripts/verify-submission.sh
```

### Verify judging isolation

The official checker and organizers expect peer scores to be denied in the API, not hidden in the UI. As **judge B** (`demo_jdg_b_44de3e`, fixture `jdg_07`), requesting another judge's scores must return **403**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Cookie: portal_session=demo_jdg_b_44de3e" \
  "http://localhost:8080/v1/events/sample-hack-2026/scores?judge=jdg_24"
```

Expect `403`. Implementation: [`Actor.may_read_judge`](src/api/app/rbac.py) and [`list_scores`](src/api/app/routers/judging.py). Organizers may pass any `judge=` ref; judges only see themselves.

### Sign in

Every seeded account's password is `password`. The sign-in page has one-click buttons for each.

| Account | Role |
| --- | --- |
| `organizer@portal.local` | Organizer of both events |
| `diego.herrera@example.org` | Judge A: fixture judge `jdg_24`, 11 reviews in two tracks |
| `iva.petrova@example.org` | Judge B: fixture judge `jdg_07`, the constant rater; also judges the Playground |
| `priya1@example.org` | Participant: captain of NorthKiln in the fixture |
| `admin@portal.local` | Platform admin |

### What is seeded

- **Sample Hack 2026** (`/events/sample-hack-2026`): the official fixture. 41 projects, 30 judges, 8 tracks, 126 reviews (4 of them on the duplicate, so 122 count). Submissions closed on 2026-03-01, so the portal refuses new ones. The duplicate (`prj_41`) is flagged and hidden. A normalization run exists. As demo configuration, a two-week **email-gated quadratic** community vote is open (25 credits, cost = units²), so results are hidden until an organizer closes voting and publishes.
- **Playground Hack** (`/events/playground`): synthetic and labelled as such. Submissions are open, so you can run the whole lifecycle: create a team, share the invite link, save a draft, submit, judge, publish.

## What it does

**T1 Core.** Accounts with Argon2id passwords and server-side sessions. Five roles (visitor, participant, judge, organizer, admin), one per person per event. Events with configurable dates, tracks, prizes and rubric, created through a wizard or by importing a `fixtures.json`. Teams form by invite link (rotatable, size-capped). Submissions autosave as drafts and can be edited until the deadline. The deadline is checked by the server on every write path. The public gallery has search, track filters and SSR pages.

**T2 Judging.** Judge invites by email with track scoping; accepting one claims the account. Assignment is automatic, track-aware, conflict-free and load-balanced, and re-running it only tops up. Organizers weight the rubric; changing weights recomputes every stored total and is audited. Judges see only their own scores and never another track, enforced in `rbac.py` and tested on 30+ role and route combinations and on every one of the fixture's 30 judges. The live organizer dashboard shows progress per judge, coverage, integrity flags and activity. Normalization adjusts for judge leniency with a documented additive model and flags outlier reviews (see [JUDGING.md](JUDGING.md)). There is a CSV for every stage of the event (registrations, teams, submissions, eligibility, judges, assignments, scores, normalization, results, votes, records, audit).

**T3 Public.** Community voting in four modes: open link (one ballot per browser), authenticated, email-gated with magic links (aliases collapsed), and single-use links. Votes are one per person or quadratic. Every ballot gets its own stored random order. Results and tallies stay hidden until voting closes and the organizer publishes. Comments are signed-in, rate-limited and moderatable. Anti-abuse covers Redis rate limits, duplicate submission detection, shared-IP ballot flagging and a hash-chained audit log with a verify button. See [THREAT-MODEL.md](THREAT-MODEL.md).

**T4 Stretch.** A documented REST API ([docs/API.md](docs/API.md), OpenAPI at `/docs`) with scoped API keys. HMAC-signed webhooks for every audited action, with retries and a delivery log. Printable certificates and Ed25519-signed judge participation records, verifiable in the browser at `/verify`, by the API, or offline with `python -m app.signing`. An embeddable gallery (`<script src=".../embed.js" data-token="...">`). Bulk import and export in the `fixtures.json` shape, proven lossless by a round-trip test, plus a projects CSV import. Archiving an event makes it read-only, and `archive.zip` holds every stage, the audit chain and the public key.

**Pairwise mode.** Judges compare two projects at a time. The ranking is Crowd-BT fitted by EM, so each judge's reliability is estimated and random or contrarian judges stop counting. Gavel's pairing rule is implemented and measured as a baseline ([docs/pairwise.md](docs/pairwise.md)).

**Interface.** Built on Radix Themes and Primitives, light and dark. Signing in lands on "Your work": each event you belong to, your role in it and the one next step. Organizers get a lifecycle rail (setup → submissions → judging → voting → results → archive) with the next action on it. Each view has one primary action. Motion follows Amicro's rules: short entrances, feedback on every action, nothing moving on its own while you work, and reduced motion respected. axe-core reports no serious or critical violations on any screen in either theme, and nothing scrolls sideways at 390 px.

## Production checklist

Use this when the portal faces real participants (not the hackathon demo seed).

1. `cp .env.example .env` — set `SESSION_SECRET` to a long random string; set `DEMO_SESSIONS=false` so acceptance cookies are disabled.
2. Set `PUBLIC_URL` on the API service (see `docker-compose.yml`) to the HTTPS origin people use; judge invites and voting links are built from it.
3. Terminate TLS in front of port **8080** (Caddy, nginx, etc.). Do not expose port **8000** on the public internet.
4. Back up Postgres volume and MinIO data before upgrades. On Postgres, `docker compose up` runs `alembic upgrade head` (see `src/api/alembic/`). Existing volumes created before Alembic may need `alembic stamp head` once inside the API container, or export JSON and start fresh.
5. Run `.\scripts\verify-submission.ps1` (or `.sh`) after deploy and before freeze; keep `acceptance-report.txt` honest (7/7 official, T1+T2 verified only).
6. Sign in as organizer → create event or `POST /v1/import` → invite judges (Organize → Judging) → set submission questions if needed (Organize → Settings).
7. Export: Organize → Integrations → `export.json` (lossless round-trip per tests).
8. Before submission deadline, add `Reviewed: <name> <date>` to [JUDGING.md](JUDGING.md), [THREAT-MODEL.md](THREAT-MODEL.md), and regenerated proof docs if you changed scoring code.

Demo video: follow [docs/demo-script.md](docs/demo-script.md) when you record the five-minute lifecycle clip.

## Honest limitations

- **Schema on Postgres uses Alembic; pytest still uses SQLite `create_all`.** Export JSON per event remains the safe escape hatch if a migration ever disagrees with your volume.
- **Unit tests run on SQLite.** The pytest suite uses in-memory SQLite for speed. Both acceptance reports were produced against the full `docker compose` stack (Postgres 16, Redis, MinIO, Mailpit), so the Postgres path is exercised end to end, but not by pytest.
- **No email verification at registration.** Authenticated voting trusts accounts; use email-gated or link voting when the popular prize matters.
- **Leniency is additive.** A judge who uses a narrower or wider range of the scale is not modelled (JUDGING.md, Limits).
- **One host.** The API runs several workers on one machine (`API_WORKERS`, default 4), coordinated through Postgres and Redis. Running several API containers works for requests, but each runs a webhook poller; deliveries are claimed with `SKIP LOCKED`, so they are not duplicated.
- **Demo sessions** are on by default so the checker works. Turn them off for real use (above).

## Documentation

[ARCHITECTURE.md](ARCHITECTURE.md) · [DATA-MODEL.md](DATA-MODEL.md) · [JUDGING.md](JUDGING.md) · [THREAT-MODEL.md](THREAT-MODEL.md) · [docs/API.md](docs/API.md) · [docs/normalization-proof.md](docs/normalization-proof.md) · [docs/pairwise.md](docs/pairwise.md) · [docs/SPEC-COMPLIANCE.md](docs/SPEC-COMPLIANCE.md) · [docs/PERFORMANCE.md](docs/PERFORMANCE.md) · [docs/decisions/](docs/decisions/) · [docs/journal/](docs/journal/)

## Layout

The repository follows the layout on dogfoodhack.com:

```text
README.md  ARCHITECTURE.md  DATA-MODEL.md  JUDGING.md  THREAT-MODEL.md  LICENSE
docker-compose.yml          one command to a seeded, running portal
.dogfood.toml               tiers claimed, pitch, where things are
acceptance-report.txt       spec/run.py output
src/api/                    FastAPI service (app/)
src/web/                    Next.js app (app/, components/, lib/)
tests/api/                  pytest suite (unit, isolation matrix, fixture, voting, integrity)
tests/acceptance/           black-box checks against the running portal (T2-T4)
tests/perf/                 benchmark and concurrency drivers
spec/                       the organisers' files, unmodified
docs/                       API guide, OpenAPI, proofs, decisions, journal
```

## Develop

```bash
# API on SQLite, no other services needed
cd src/api && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # bin/ on macOS/Linux
MINIO_ENDPOINT= .venv/Scripts/python -m uvicorn app.main:app --port 8000

# tests, from the repo root
src/api/.venv/Scripts/python -m pytest -q
python tests/acceptance/extended.py .dogfood.toml      # needs the stack running

# regenerate the proofs and the UI -> API map
cd src/api && .venv/Scripts/python -m app.proof > ../../docs/normalization-proof.md
.venv/Scripts/python -m app.pairwise_proof > ../../docs/pairwise.md
cd ../.. && src/api/.venv/Scripts/python tests/api/test_api_first.py > docs/UI-API-MAP.md

# web, proxies /v1 to localhost:8000
cd src/web && npm install && npx next dev -p 8080
```

## License

MIT. See [LICENSE](LICENSE).
