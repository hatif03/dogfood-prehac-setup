# 06 — T4 Stretch

## Goal

Operator completeness: REST + webhooks for every UI action, certificates, signed judge participation records, embeddable gallery widget, bulk import/export.

## Score impact

Tier 40% at the top of the ladder. Adoptability 20% (leave as easily as you arrived). API First bonus is plan 10 on top of this.

## Gate

- OpenAPI lists the UI actions (gap list = P0).
- Export then import of fixture-shaped data does not lose teams/submissions/scores.
- Certificate PDF or printable HTML generates for winners.
- Participation record verifies with a public key (script in repo).
- Gallery widget loads in a local static HTML file without organizer cookies.

Depends on: [05-t3-public.md](05-t3-public.md). Do not start if T2.03 is red.

## In scope

- REST API covering every action the UI can take
- Webhooks on those actions (at-least-once via Redis retry)
- Certificate and record generation
- Signed, publicly verifiable judge participation records (ed25519 key in a compose volume, verify CLI)
- Embeddable gallery widget (iframe + public token)
- Bulk import and export (JSON and CSV)

## Out of scope

- SaaS certificate vendors
- Cloud KMS
- Third-party webhook relays
- Widget that requires our admin session

## Data-model

`api_keys`, `webhooks`, `webhook_deliveries`, `certificates`, `participation_records`, `import_jobs`

## API/UI

**API:** CRUD webhooks, rotate keys, export/import jobs, issue certificates, issue/verify participation, public widget feed.

**UI:** organizer integrations page, certificate download, embed snippet copy, import wizard.

## Acceptance hypotheses

- Unsigned participation record fails verify
- Widget token cannot list scores
- Import of exported zip is idempotent or documented

## Docs to update

ARCHITECTURE (integrations), DATA-MODEL (import/export paths), README embed snippet.

## Bonus linkage

Plan 10 raises this API to "documented OpenAPI + examples + webhook catalog." Plan 11 is the stranger-runnable checklist.
