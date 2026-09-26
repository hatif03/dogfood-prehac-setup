# 02 — Data model and pipeline

## Goal

Map FIG.01's ten stages onto Postgres tables an organizer can export. Schema must survive fixture edges: constant rater, incomplete batch, duplicate entry.

## Score impact

Code quality 15% (defensible schema). Adoptability 20% (import/export path). T2–T4 have nowhere to live without this.

## Gate

- Tables listed below exist as migrations (after kickoff).
- Each table has one sentence in `DATA-MODEL.md`.
- Unique constraints: invite tokens; one active submission per team per event; one assignment per judge×project×batch.
- Human on the team can defend the schema in writing.

Depends on: [01-stack-and-runtime.md](01-stack-and-runtime.md).

## In scope

Sketch (implement as SQL after kickoff, not now):

**Identity:** `users`, `sessions`, `event_roles`  
Visitor = no session or session without event role. Roles: participant, judge, organizer, admin.

**Event:** `events` (dates, voting access mode, judging mode `rubric|pairwise`), `tracks`, `prizes`, `custom_questions`

**Teams:** `teams`, `memberships`, `invite_links`

**Submissions:** `submissions` (`draft|submitted`), `submission_assets`, `custom_answers`  
Fields from the brief: name, tagline, long description, thumbnail, image gallery, hosted demo video URL, repository URL, live link, tech tags, track, organizer custom questions.

**Eligibility:** `eligibility_flags` (duplicate, ineligible reason)

**Judging:** `rubrics`, `criteria` (weights sum to 1 per rubric), `judge_invites`, `assignment_batches`, `assignments`, `scores`, `score_cells`

**Normalization:** `normalization_runs` (method, params, raw vs normalized, rank delta), `normalized_scores`

**Public:** `ballots` (randomized order, access mode), `votes` (1p1v and quadratic cost), `comments`

**T4:** `api_keys`, `webhooks`, `webhook_deliveries`, `certificates`, `participation_records` (ed25519), `import_jobs`, `audit_events`

## Out of scope

- JSON-blob core entities with no columns
- Separate database per stage
- Invented fixture rows committed as if official

## Data-model

This plan *is* the data-model. Load `.skills/schema-defense/SKILL.md`.

## API/UI

None required beyond health until T1. Foreign keys must not block T1 screens.

## Acceptance hypotheses

Suite will POST well-known fields. Keep submission columns aligned with Devpost-stable set ([context/references.md](../context/references.md) [4][5]) until spec.md says otherwise.

## Docs to update

Root `DATA-MODEL.md` from template. Journal any table we would redo.

## Bonus linkage

Normalization runs table is required for bonus 07. Webhooks/api_keys for 10. Audit for 09.
