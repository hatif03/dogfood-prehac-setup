# DATA-MODEL

Purpose: schema plus how an organizer gets data in and out. Read by judges. Feeds Adoptability (20%).

Status: template — copy to repo root after `plans/02-data-model-and-pipeline.md` is implemented.

Non-goals: ORM tutorial, undocumented JSON blobs for core entities.

## Contract

Every FIG.01 stage has tables. Every table can be explained in one sentence. Bulk export/import round-trips the operator-owned data (T4).

## Stages → tables

| Stage | Tables (planned) |
| --- | --- |
| Registration | `users`, `sessions`, `event_roles` |
| Teams | `teams`, `memberships`, `invite_links` |
| Submissions | `submissions`, `submission_assets`, `custom_answers` |
| Eligibility | `eligibility_flags` |
| Assignment | `judge_invites`, `assignment_batches`, `assignments` |
| Scoring | `rubrics`, `criteria`, `scores`, `score_cells` |
| Normalization | `normalization_runs`, `normalized_scores` |
| Results | `result_snapshots` |
| Certificates | `certificates`, `participation_records` |
| Archive | exports via `import_jobs` / export endpoints; `audit_events` |

## Identifiers and uniqueness

- Invite tokens unique
- One active submission per team per event
- Assignment uniqueness: one judge × project × batch
- Scores not readable across judges except organizer/admin

## Import and export paths

| Stage | CSV | JSON bulk |
| --- | --- | --- |
| Registration | yes | yes |
| Teams | yes | yes |
| Submissions | yes | yes |
| Assignments | yes | yes |
| Raw scores | yes | yes |
| Normalized scores | yes | yes |
| Votes | yes | yes |
| Audit | yes (organizer) | yes |

## Worked example

Export submissions CSV, edit eligibility offline, re-import flags, re-run assignment. Document the exact commands once they exist.

## Open questions

- [ ] UUID vs sequential public ids
- [ ] Soft delete vs archive tables
