# AGENTS.md

Shared constitution for Cursor, Claude Code, and any other coding agent working in this repository.

Read this file at session start. Then read `plans/00-north-star.md` before proposing or writing product code.

## What this repo is

A self-hostable hackathon **submission and judging portal** for Dogfood 2026 (https://dogfoodhack.com/). Hackathon Raptors will fork and run the winner. We are not building a demo.

Product code lives in `src/` and `docker-compose.yml`, built against the **public brief** until official `spec.md` / `fixtures.json` / the acceptance suite arrive. When those files drop, run `plans/13-kickoff-reconcile.md` and patch schema/API to the suite — do not invent passing `acceptance-report.txt`. Seed data is **synthetic**, labeled as such, not the official fixture.

## Stack (locked)

- Backend: FastAPI (Python)
- Frontend: Next.js (`output: 'standalone'`)
- Database: PostgreSQL 16
- Object storage: MinIO
- Cache / rate limits / webhook retry: Redis
- Local mail: Mailpit (email-gated voting, never an external mail vendor)
- Auth: our own sessions + Argon2. Not Clerk, Auth0, Keycloak, or Firebase.
- License: MIT
- Runtime: `docker compose up` on a laptop with the network off

## Banned at runtime

No paid or hosted dependency that an organizer would need an account for:

Neon, PlanetScale, Supabase hosted, AWS S3, Cloudinary, Clerk, Auth0, Firebase Auth, Okta, OpenAI/Anthropic/Gemini **in the product**, SendGrid, Postmark, Stripe, any staging URL as the submission.

AI tools are expected **while building**. The running portal must not call them.

## Role isolation (FIG.02 / T2.03)

Denied at the API, not in the UI. Curl is the test.

| Actor | Own scores | Peer scores | Other track | Aggregate | Audit log |
| --- | --- | --- | --- | --- | --- |
| Visitor | no | no | no | no | no |
| Participant | no | no | no | no | no |
| Judge | yes | no | no | no | no |
| Organizer | yes | yes | yes | yes | yes |
| Admin | yes | yes | yes | yes | yes |

## Scoring we optimize for

- 40% Tier completion: climb T1→T4; never claim a tier the suite did not pass
- 25% Judging integrity: isolation, weighted rubric, defended normalization, audit trail
- 20% Adoptability: one command, seed, docs a stranger can follow, import/export, MIT
- 15% Code quality / innovation: idiomatic stack, defensible schema, pairwise mode
- Bonuses: all four, each as a finished artifact (plans 07–10)

Correctness beats breadth. A clean T2 outranks a broken T4. Honest `.dogfood.toml` or we lose more than the tier was worth.

## Documentation contract

Treat docs as machine-readable infrastructure.

- Persistent facts live in `context/`
- Execution order lives in `plans/`
- Judge-facing docs later copy from `docs/templates/`
- Session notes go in `docs/journal/` (Write Up Quest fuel)
- ADRs go in `docs/decisions/`
- Every AI-generated doc or code block is **untrusted** until a human adds `Reviewed: <name> <date>`
- Prefer updating the matching plan/context/template over expanding scope

## Skills

Canonical workflows: `.skills/<name>/SKILL.md`

Load the matching skill before the matching work:

- `dogfood-spec` — any feature
- `role-isolation` — auth, list/get, exports
- `judging-maths` — scores, ranking, pairwise
- `docker-offline` — compose, dependencies
- `docs-sync` — after a mergeable change
- `writeup-capture` — session end / large decisions
- `acceptance-gate` — claiming a tier
- `schema-defense` — migrations

## Kickoff gate

Application code is allowed **now** (human decision 2026-09-21): build against `context/` and `plans/`. When `spec.md`, `fixtures.json`, and the acceptance suite appear, execute `plans/13-kickoff-reconcile.md` as a **diff against the running code** before claiming tiers. Do not invent passing test output.

## Product code

`src/api` (FastAPI), `src/web` (Next.js), `docker-compose.yml`. Keep runtime fully local. Prefer adapter-shaped seed loaders so official fixtures can replace synthetic seed without a rewrite.
