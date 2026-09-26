# 08 — Bonus: Pairwise Mode (+5, Hard)

## Goal

Alternative judging mode: show two projects, ask which is better, recover a global ranking with a Bradley-Terry / Crowd-BT style estimator. Sidesteps cross-judge calibration by never asking for an absolute score.

## Score impact

+5 bonus. Innovation 15% ("steal this"). Best Judging Engine. Cite Gavel/Thurstone; **do not fork Gavel** (AGPL, out-of-scope rewrite).

## Gate

- Event can be `judging_mode = pairwise` without breaking rubric events.
- Judge UI: two projects, pick winner (optional skip documented).
- Estimator produces μ ranking; admin sees live order.
- Comparison graph is connected enough to rank (assignment strategy documented).
- Isolation still holds: no peer ballot visibility.

Depends on: [04-t2-judging.md](04-t2-judging.md) assignment/invites.

## In scope

- Pairwise comparisons table
- Next-pair selection that grows a connected graph (each judge compares sequentially against previous, Gavel-style *idea*)
- Regularized MLE / Crowd-BT-style update; document prior
- Organizer ranking by μ
- `JUDGING.md` pairwise section

## Out of scope

- Copying Gavel source or schema
- Requiring MATLAB
- Replacing rubric mode (both must exist)

## Data-model

`pairwise_comparisons` (judge, winner_id, loser_id, created_at), `pairwise_runs` (μ vector, params). Reuse assignments/invites.

## API/UI

Get next pair, post decision, organizer ranking. Same RBAC as scores.

## Acceptance hypotheses

Unlikely in official suite. Demo path: create pairwise event, three comparisons, ranking moves. Isolation curl still applies.

## Docs to update

`JUDGING.md`, ADR for estimator choice, journal.

## Bonus linkage

Independent of 07 except shared isolation and invite flows.
