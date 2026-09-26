# 01 — Stack and runtime

## Goal

A laptop-only runtime: `docker compose up` starts web, api, postgres, minio, redis, mailpit, and (after kickoff) seeds fixtures. No vendor account.

## Score impact

Adoptability 20% lives or dies here. Also unblocks every tier.

## Gate

- Compose file exists with only local services.
- API health and web home load on localhost.
- Restarting compose does not require extra CLI except the one command (migrations run on api boot).
- Network can be unplugged after images exist.

Depends on: [13-kickoff-reconcile.md](13-kickoff-reconcile.md) (so seed matches official fixtures). Skeleton compose may be drafted in the same kickoff session, not before.

## In scope

- `src/api` FastAPI + Uvicorn
- `src/web` Next.js `output: 'standalone'`
- Postgres 16
- MinIO (thumbnails, gallery)
- Redis (rate limit, webhook retry)
- Mailpit (SMTP catcher for email-gated votes)
- Session auth + Argon2 (not Keycloak)
- Seed job
- Later CI (land with first app commit): ruff, mypy, eslint, prettier, compose config test

## Out of scope

- Traefik Cloud, nginx cloud, Caddy with external DNS requirements
- Keycloak / Dex / Authentik (extra moving parts for 72h)
- Hosted object storage
- Vercel-only Next features that break standalone

## Data-model

No domain tables in this plan except a `health` smoke. Schema is plan 02.

## API/UI

- `GET /health` (api)
- Web root placeholder until T1 screens exist

## Acceptance hypotheses

Suite likely starts compose or hits a base URL. README must list the single command. Ports documented.

## Docs to update

Copy `docs/templates/ARCHITECTURE.md` to root `ARCHITECTURE.md` once compose is real. ADR: session auth vs Keycloak.

## Bonus linkage

API First (10) needs FastAPI OpenAPI from day one — enable `/openapi.json` here even if routes are few.

## CI to land with first app commit (not this planning repo)

- Python: ruff + mypy
- Web: eslint + prettier
- GitHub Action: `docker compose config` and lint. No cloud deploy.
