# 14 — Polish master plan (spec landed)

Reviewed: pending

The official `spec/spec.md`, `spec/fixtures.json`, `spec/run.py` and `spec/example.dogfood.toml` are in the repo. This plan is the kickoff diff (plan 13) plus the execution order to take the portal from "synthetic prototype" to "fork-and-run on Monday", with a rebuilt, animated UI.

## 1. Kickoff diff: spec vs running code

| Our assumption / current code | Official | Action |
| --- | --- | --- |
| `.dogfood.toml` has `t1 = false` booleans | `[portal] base_url`, `[tiers] claimed`, `[auth]` headers, `[routes]` | Rewrite in official shape |
| Synthetic seed (40 × "Project NN") | Seed from `fixtures.json` (41 projects, 30 judges, 8 tracks, 126 scores) | Fixture importer; seed calls it; synthetic data only in a labelled "Playground" event |
| Rubric scale 1–10, criteria Technical/Design/... | Criteria `functionality`, `quality`, `innovation`, integer 1–5 | Rubric gets `scale_min/scale_max`; criteria get a stable `key` |
| Submission fields `name`, `tagline` | Fixture `title`, `summary` | Rename columns to `title`, `summary` |
| One track per judge (`event_roles.track_id`) | Judges have 1–2 tracks | New `judge_tracks` table |
| One submission per team | `tm_07` has `prj_07` and `prj_41` (same title + repo) | Allow both rows; duplicate detector flags `prj_41 → prj_07`, blocks judging, hides from gallery |
| Checker logs in | Checker never logs in; attaches a header | Seed mints fixed demo session tokens (env-gated), prints them at boot |
| Peer score by id → 404 | `peer_scores` must return 401/403 | `?judge=<ref>` for a peer → 403 (object-by-id stays 404, no existence leak) |
| Event deadline relative to boot | Fixture `submissions_close = 2026-03-01T18:00Z` (past) | Use fixture date verbatim → submissions refused with 403 |
| Two origins (web :3000, api :8000) | One `base_url` | Next.js on :8080 proxies `/v1/*`, `/docs`, `/openapi.json`, `/.well-known/*` to the API; one origin, no CORS |
| Constant rater, unfinished batches | `jdg_07` scored 3 projects all 4s; `jdg_01` 1 score (all 2s); coverage 2–5 reviews/project | Integrity report surfaces them; estimator handles them (section 4) |
| Z-score per judge (median/MAD) | Must be "documented and defensible" on sparse, track-scoped data | Replace with additive judge-offset model (ridge / BLUP); z-score kept only as a baseline in the proof |

Checker mapping:

| run.py check | Route in `.dogfood.toml` | Behaviour |
| --- | --- | --- |
| T1 gallery is public | `GET /v1/events/sample-hack-2026/projects` | 200, JSON, all 40 non-duplicate projects, no pagination on page one |
| T1 fixture project shown | same | titles `Glass Signal`, `Small Meadow`, `Deep Compass` in body |
| T1 closed event refuses | `POST /v1/events/sample-hack-2026/projects` as participant | 403 `submissions closed at 2026-03-01T18:00:00Z` (checked before body shape) |
| T2 judge sees own | `GET /v1/events/sample-hack-2026/scores` as judge_a | 200, own rows only |
| T2 judge not peer | `GET /v1/events/sample-hack-2026/scores?judge=jdg_24` as judge_b | 403 |
| T2 participant blocked | `GET /v1/events/sample-hack-2026/scores` as participant | 403 |
| T2 csv export | `GET /v1/events/sample-hack-2026/export/results.csv` as organizer | 200, `text/csv`, header row with commas |

`run.py` has no T3/T4 checks, so claiming T3/T4 always prints "claimed but not verified". We claim only what our own black-box suite (`tests/acceptance_extended.py`, same style as run.py) passes, commit its report next to the official one, and explain the difference in README.

## 2. Target architecture

```
browser ──► web (Next.js standalone, :8080) ──rewrite /v1/*──► api (FastAPI, :8000)
                 │  server components fetch api directly          │
                 └────────────────────────────────────────────────┼─► postgres 16
                                                                  ├─► redis (rate limits, vote dedupe)
                                                                  ├─► minio (submission images)
                                                                  └─► mailpit (judge invites, vote confirm)
api background thread: webhook delivery retries (exponential backoff, DB-backed queue)
```

`spec/fixtures.json` is bind-mounted read-only into the api container; the seed imports it through the same importer organizers use (`POST /v1/import`).

## 3. Backend work (apps/api)

Order matters: B1–B6 are the checker path.

- **B1 Event refs.** Every `/v1/events/{event}` accepts a UUID or slug. One dependency `get_event`.
- **B2 Schema.** `external_id` on events/tracks/users/teams/submissions (round-trip + idempotent re-import); `submissions.title/summary`; `rubrics.scale_min/scale_max`; `criteria.key`; `scores.comment`; `judge_tracks`; `eligibility_flags.duplicate_of_id`; `ballots.token`; `audit_events.prev_hash/hash/summary`; `webhook_deliveries.next_attempt_at`; `api_keys.user_id`; `certificates.signature`.
- **B3 Importer** (`app/importer.py`): fixture JSON → event, tracks, users (one shared Argon2 hash for seeded logins), judges + tracks, teams, submissions, imported assignment batch (one assignment per fixture score), scores with cells + comments, duplicate detection, then a normalization run. Idempotent by `external_id`.
- **B4 Seed**: admin + organizer accounts, fixture import, fixed demo session tokens when `DEMO_SESSIONS=true` (default in compose, documented as "turn off in production"), printed at boot in the spec's format. A small "Playground" event (open deadline, clearly synthetic) so the full create → submit → judge → publish loop can be shown live.
- **B5 Isolation**: `GET /scores?judge=` (self 200, peer 403, participant/visitor 403/401); assignments/mine; score get/put; judges only see their own rows and only projects in their tracks; exports gated; results 403 while hidden. One `authz` module, one curl matrix test.
- **B6 Exports**: `export/{kind}.csv` for results, scores (long: one row per criterion), submissions, teams, judges, assignments, votes, audit. `export.json` in fixture shape (round-trips through `POST /v1/import`).
- **B7 Judging**: judge invites by email (Mailpit) with accept link + track scope; assignment generator: track-aware, conflict-of-interest (no judging your own team), load-balanced, `top_up` mode that only fills projects below N reviews; rubric editor (`PUT /rubric`, weights normalized to 1, existing scores recomputed, audited); live dashboard aggregate (`GET /dashboard`: KPIs, per-judge progress, coverage histogram, integrity report, activity feed).
- **B8 Normalization** (section 4), persisted runs, `GET /results` computed from the latest run; publish/unpublish.
- **B9 Pairwise**: Bradley–Terry via MM (Hunter 2004) with a weak prior, standard errors, active pair selection (closest μ, fewest comparisons); pairwise judging endpoints; rubric→pairwise rank-breaking cross-check.
- **B10 Voting (T3)**: three access modes on one ballot model — authenticated, email-gated (magic link via Mailpit), link-based (organizer mints single-use tokens). Per-ballot randomized order (stored), 1p1v or quadratic, results + tallies hidden until voting closes and organizer publishes. Anti-abuse: Redis rate limits (vote, comment, login, ballot creation), email canonicalization (dots/plus aliases), one ballot per canonical email/user/token (DB unique), IP-hash velocity flagging, hash-chained audit log.
- **B11 Comments**: authenticated, rate-limited, length-capped, organizer can hide; author display name.
- **B12 T4**: webhooks with HMAC signature + retry worker + delivery log + test ping; API keys that authenticate as their creator; certificates (printable HTML, signed, verify URL); signed judge participation records (Ed25519 over canonical JSON, public key at `/.well-known/portal-signing-key.pem`, verify endpoint + in-browser WebCrypto verify + CLI); embeddable widget (`/embed.js` → iframe, JSON widget API); bulk import (fixture JSON, projects CSV) and export.
- **B13 Hygiene**: `PATCH /events` partial; logout kills only the current session (not the demo tokens); login rate limit; upload size/type limits; `/v1/auth/me` returns per-event roles.

## 4. Normalization method (defended)

Weighted score per review: `y = Σ_c w_c · x_c`, `Σ w_c = 1`, on the rubric scale (1–5).

Additive judge-leniency model on the incomplete judge × project design:

```
y_jp = μ + θ_p + b_j + ε_jp,   ε ~ N(0, σ²),  b_j ~ N(0, τ_b²),  θ_p ~ N(0, τ_θ²)
```

Fit by penalized least squares (the BLUP of a crossed random-effects model), λ_b = σ²/τ_b², λ_θ = σ²/τ_θ², solved by Gauss–Seidel backfitting (converges; strictly convex). Reported score: `μ + θ_p` on the original 1–5 scale, plus an approximate standard error and review count. Why this and not per-judge z-scores: judges are track-scoped, so a judge's batch is not a random sample of quality; z-scoring punishes a judge who happened to get a strong track. The additive model compares judges only through projects they share. Constant raters (≥3 reviews, zero variance) are flagged and down-weighted (weight 0 by default, toggle in the run params); judges with one review contribute only through the offset prior. Shrinkage on θ keeps a two-review project from outranking a five-review project on noise.

Proof artifacts (bonus 1): `docs/normalization-proof.md` generated by `python -m app.proof` from the real fixture: raw vs adjusted table, rank movement, judge offsets, flags; plus a seeded Monte-Carlo study (lenient/harsh judges, track-scoped sparse design matching the fixture's shape) reporting Kendall τ to ground truth for raw mean, per-judge z, and the additive model, and a λ sensitivity table. Pairwise BT on rank-broken rubric pairs is reported as an independent cross-check.

## 5. Frontend rebuild (apps/web)

Stack: Next.js 15 App Router, React 19, Tailwind CSS v4, `motion` (Framer Motion), `lucide-react`, `canvas-confetti`, `geist` (fonts bundled locally, works offline), `clsx` + `tailwind-merge`. Magic UI–style components written in-repo (`components/magic/*`), modeled on magicui.design patterns: BlurFade, NumberTicker, BorderBeam, ShimmerButton, MagicCard (cursor spotlight), AnimatedGridPattern, Marquee, AnimatedList, AnimatedGradientText, ProgressRing, Confetti, Meteors. remocn is a Remotion video kit, so it is for the demo video, not the app. amicro is noted as inspiration for micro-interactions; we do not depend on it.

Motion rules: every list staggers in (BlurFade), buttons press-scale, cards hover-lift + spotlight, tabs use shared `layoutId` pills, filters animate with `layout` + `AnimatePresence`, numbers count up, progress bars and rings spring, saving shows an SVG check drawing itself, completion fires confetti, results podium rises. `MotionConfig reducedMotion="user"` everywhere. Dark theme, lime accent (`#d4ff4f`), Geist Sans/Mono.

Pages:

| Route | Who | Content |
| --- | --- | --- |
| `/` | all | hero (animated grid, gradient text, marquee of project titles), event cards with live phase + countdown, KPI tickers |
| `/login`, `/register` | all | forms + one-click demo logins (organizer, judge A, judge B, participant) |
| `/events/new` | signed-in | stepper wizard: basics → dates → tracks & prizes → rubric weights → create |
| `/events/[slug]` | public | SSR gallery: search, track chips, animated filtering, duplicate-free |
| `/events/[slug]/projects/[id]` | public | project page, comments, vote CTA |
| `/events/[slug]/submit` | participant | team create / invite link copy, draft → submit, deadline countdown, locked state |
| `/invite/[token]`, `/judge-invite/[token]` | signed-in | accept team / judge invite |
| `/events/[slug]/judge` | judge | queue sidebar, rubric sliders with weights and live weighted total, comment, keyboard shortcuts, progress ring, confetti at 100% |
| `/events/[slug]/judge/pairwise` | judge | two-card duel, keyboard ←/→ |
| `/events/[slug]/organize` | organizer | tabs: Overview (live KPIs, judge progress, coverage, activity) · Judging (invites, assignments, rubric editor) · Results (normalization, rank-shift slope chart, integrity flags, publish) · Voting · Settings (dates, tracks, prizes) · Integrations (webhooks, API keys, widget, import/export, certificates, signed records) · Audit (chain status, filterable log) |
| `/events/[slug]/vote` | public | ballot in randomized order, email-gated / link / auth flows |
| `/events/[slug]/results` | public after publish | podium, full table, method link |
| `/verify` | public | verify a signed record in-browser (WebCrypto Ed25519) and via API |
| `/widget/[token]`, `/embed.js` | embed | compact animated gallery for iframes |

## 6. Deliverables

`.dogfood.toml` (official shape), `acceptance-report.txt` (real run.py output, never hand-written), `acceptance-report-extended.txt`, `docker-compose.yml` (one command, seeded), `README.md` (run, logins, honest limits), `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `THREAT-MODEL.md` (bonus 3), `docs/API.md` + committed `docs/openapi.json` (bonus 4), `docs/normalization-proof.md` (bonus 1), `docs/pairwise.md` (bonus 2), `LICENSE` (MIT), `tests/` (root black-box suite) + `apps/api/tests` (pytest), `docs/demo-script.md` (5-minute video shot list; remocn optional for titles), journal entry.

## 7. Execution order

1. B1–B6 + tests (checker path). Run run.py locally → must be 7/7.
2. B7–B13 + tests.
3. Frontend foundation (design tokens, layout, nav, API client, auth context, magic components). This runs in parallel with 1–2.
4. Frontend pages in four parallel slices: public, participant, judge, organizer.
5. Proof generation, docs, OpenAPI export, extended acceptance suite, reports.
6. Full verification: pytest, `next build`, run.py, extended suite, `docker compose up` if Docker is available.

## 8. Risks

- Docker Desktop is stopped on the build machine: verify with local uvicorn + SQLite + `next start`, and say so in the report if compose was not run here.
- The rules say project code starts at kickoff (Fri 25 Sep 18:00 UTC). The human overrode the timeline (ADR 0001). That is a rules risk the team owns, recorded here.
- Next rewrites must forward the `Cookie` header and status codes unchanged: covered by running run.py through :8080.

## 9. Execution status (2026-09-24)

- [x] B1–B13 backend: fixture importer, demo sessions, Actor isolation, exports, judging, normalization, pairwise, voting, comments, T4 integrations. 76 pytest tests.
- [x] Frontend foundation + four page slices (public, participant, judge, organizer). `next build` clean.
- [x] `spec/run.py` through :8080: 7/7, verified T1 T2 (`acceptance-report.txt`).
- [x] `tests/acceptance_extended.py` through :8080 with Mailpit: 21/21 (`acceptance-report-extended.txt`).
- [x] Docs: README, ARCHITECTURE, DATA-MODEL, JUDGING, THREAT-MODEL, docs/API.md, docs/openapi.json, docs/normalization-proof.md, docs/pairwise.md, ADR 0002, journal.
- [ ] Demo video (5 minutes, create → submit → judge → publish). Human task; remocn can supply title cards.
- [ ] Alembic migrations (documented limitation).
