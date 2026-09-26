# 00 — North star

## Goal

Ship a self-hostable hackathon **submission and judging portal** that Hackathon Raptors can fork, run with one Docker command, and use in production. Everyone in Dogfood builds the same product; score is how far and how cleanly we climb T1→T4, plus judging integrity.

One-liner: **offline compose, backend-enforced isolation, weighted rubric, documented normalization, public API.**

## Score impact

Optimizes all four criteria and all four bonuses. Strategy: correctness inside breadth. We plan the whole ladder, but a red T2 gate blocks T3/T4 claims.

Winning looks like: an organizer runs Monday without calling us; a judge curls peer scores and gets 404; a statistician can reproduce ranking from `JUDGING.md` + CSVs.

## Gate (before any later plan's code)

- Human has read this file, `AGENTS.md`, and `context/brief.md`.
- Stack remains FastAPI + Next.js + Postgres + MinIO + Redis + Mailpit, MIT.
- No application code until [13-kickoff-reconcile.md](13-kickoff-reconcile.md).

## In scope

- T1–T4 as specified on dogfoodhack.com
- All four bonuses as finished artifacts
- Judge-facing docs from templates
- Write-up journal

## Out of scope

- Hosted services, staging-URL submissions
- Frontend-only RBAC
- Rewrites of Gavel / JunctionApp / Dribdat / Quill / Hibiscus
- Design-only or slideshow deliverables
- Timeline anxiety (ignored by policy)

## Data-model

See [02-data-model-and-pipeline.md](02-data-model-and-pipeline.md). All ten FIG.01 stages have tables.

## API/UI

One product: participant gallery + judge console + organizer dashboard + public API. Not four apps.

## Acceptance hypotheses

Official suite unpublished. We assume tests for: T1 deadline, T1 gallery, T2.03 isolation, weighted scores, hidden results, OpenAPI presence. Reconcile IDs in plan 13.

## Docs to update

This file only changes if the official spec contradicts the north star. Then patch `context/` first.

## Bonus linkage

07–10 hang off T2–T4. None start as the first product commit.
