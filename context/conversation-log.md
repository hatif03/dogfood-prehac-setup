# Conversation log

Append-only dated summaries. AI drafts are untrusted until `Reviewed:`.

## 2026-09-21 — Pre-hack infrastructure

- Read https://dogfoodhack.com/ (REV 2.6) in full: problem, tier ladder, figures, scoring, deliverables, bonuses, rules, FAQ.
- Locked stack: FastAPI + Next.js + PostgreSQL + MinIO + Redis + Mailpit. MIT. Offline compose.
- Decision: climb T1–T4 and finish all four bonuses as gated plans, not stubs.
- Decision: no application code until kickoff reconcile (`plans/13-kickoff-reconcile.md`).
- This repo seeded with AGENTS.md, context, templates, skills, rules, and `plans/00`–`13`.

Reviewed: pending

## 2026-09-21 — Build before official spec

- Human: we can build most of the app before final spec/fixtures.
- ADR 0001: code against public brief; synthetic seed; reconcile on kickoff.
- `.dogfood.toml` remains unclaimed until the official suite runs.

Reviewed: pending
