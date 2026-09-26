# ADR: Build against the public brief before official spec

Status: accepted  
Date: 2026-09-21  
Reviewed: pending

## Purpose

Record why we started `apps/` before `spec.md`, `fixtures.json`, and the acceptance suite exist.

## Non-goals

Replacing plan 13. Official files still win when they arrive.

## Context

Plans originally gated all product code on kickoff files. The public website already specifies T1–T4, the submission field set, FIG.02 isolation, assignment shape, and bonuses. Waiting idles the only work we can finish early: schema, RBAC, judging maths, compose, UI.

## Decision

Build the portal now against `context/` and `plans/`. Seed **synthetic** data in the disclosed shape (40 projects, 30 judges, 8 tracks, constant rater, incomplete batch, duplicate). When official files land, run `plans/13-kickoff-reconcile.md` as a code diff, not a greenfield start.

## Consequences

- Faster T1–T4 coverage; risk of field-name churn at kickoff.
- Seed loader must be swappable (`app/seed.py` vs future `app/load_fixtures.py`).
- `.dogfood.toml` stays all-false until the official suite runs.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Wait for spec.md | Human asked to build most of the app now; public brief is already a spec |
| Invent official fixture rows | Forbidden; we label seed synthetic |

## Open questions

- Exact suite route paths and test IDs
