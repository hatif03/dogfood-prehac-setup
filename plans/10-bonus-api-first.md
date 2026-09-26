# 10 — Bonus: API First (+3, Medium)

## Goal

Every action available in the UI is available through a documented API, with a published OpenAPI spec. Nobody else in the category has one. Be first.

## Score impact

+3 bonus. T4 REST requirement done to the bonus bar. Adoptability (integrations without scrapers).

## Gate

- `/openapi.json` and a human page (FastAPI `/docs` allowed locally).
- Gap spreadsheet: each UI action → operationId. Zero gaps or documented "UI-only none".
- Examples for auth (session cookie and/or API key), submission, score, vote, export.
- Webhook catalog: event names equal to those actions.

Depends on: [06-t4-stretch.md](06-t4-stretch.md).

## In scope

- FastAPI native OpenAPI
- API keys for organizers (hashed at rest)
- Webhooks with signed payloads (local secret, not a SaaS)
- README "API" section

## Out of scope

- GraphQL-only without REST
- Undocumented RPC
- Cloud API gateways

## Data-model

`api_keys`, `webhooks`, `webhook_deliveries`

## API/UI

The API *is* the surface. Organizer schema download button.

## Acceptance hypotheses

Suite may hit documented routes. Bonus judges will diff UI clicks vs OpenAPI.

## Docs to update

ARCHITECTURE, README, OpenAPI committed or generated at compose boot (prefer generated so it cannot drift — if committed, CI checks diff).

## Bonus linkage

This is bonus 4. Mark toml only when the gap list is empty.
