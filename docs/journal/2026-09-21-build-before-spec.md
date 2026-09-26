# 2026-09-21 — Build before official spec

Status: draft  
## 2026-09-21 — Application scaffold against public brief

- Human: build most of the app before official spec/fixtures.
- ADR 0001. Compose + FastAPI T1–T4 APIs + Next.js UI + synthetic seed.
- Tests: 7 passed (isolation, deadline, normalization, openapi).
- `.dogfood.toml` remains unclaimed.

Reviewed: pending

## Purpose

Human decision: implement most of the portal against the public Dogfood brief before fixtures and the acceptance suite exist.

## What shipped

- Policy update in `AGENTS.md` and core Cursor rule
- ADR 0001
- Application scaffold (compose, API, web) in the same session

## What we would redo

- Any column names the official spec renames — isolate in Pydantic schemas

## Bugs found

- None yet

## Normalization / ranking notes

- Still robust z-score + pairwise as documented

## Features cut (and why we do not regret it)

- Waiting for kickoff to write the first model

## Spec vs plan diffs

- Plan 13 gate changed from "no apps/" to "reconcile when files drop"

## Open questions

- Official fixture JSON shape
