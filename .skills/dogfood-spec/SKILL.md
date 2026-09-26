---
name: dogfood-spec
description: Maps work to Dogfood T1-T4 bullets, FIG.01 stages, and out-of-scope list. Use when implementing features, choosing scope, or when the user mentions tiers, the brief, or dogfoodhack.
---

# Dogfood spec

Read `context/brief.md`, `context/figures.md`, and the plan for the current tier before editing product code.

## Instructions

1. Name the FIG.01 stage (1–10) and the tier bullet this change satisfies.
2. If it is not on T1–T4 or a bonus plan, refuse or move it to journal "cut features".
3. Out of scope: mockups-only, hosted accounts, login-only demos, frontend-only RBAC, closed source, rewrite of Gavel/JunctionApp/Dribdat/Quill/Hibiscus.
4. After official spec lands, prefer `spec.md` over this skill; then update `context/` via `plans/13-kickoff-reconcile.md`.

## Tier checklist (public brief)

- T1: auth, roles, event, invite teams, draft-edit, deadline holds, gallery search/filter
- T2: assignment, weighted rubric, backend isolation, progress dashboard, normalization, CSV
- T3: configurable voting, comments, hidden results, random ballots, anti-abuse
- T4: REST+webhooks, certificates, signed judge records, embed widget, bulk import/export

## Examples

- Adding Cloudinary for thumbnails → stop. Use MinIO.
- Building pairwise UI before T2 isolation curl tests pass → stop. Finish plan 04 gate.
