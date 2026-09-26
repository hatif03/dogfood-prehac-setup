# 07 — Bonus: Normalization Proof (+5, Hard)

## Goal

Prove cross-judge normalization on **official fixture data**: raw scores, normalized scores, rank movement. Document so a statistician would not wince. Every commercial platform claims this and none publish the method.

## Score impact

+5 bonus. Feeds Integrity 25% and FIG.03 (σ drop, rank arrows). Best Judging Engine.

## Gate

- Method is the in-product method from plan 04 (not a notebook-only one-off).
- Tables in `JUDGING.md` use official fixture IDs, not invented P-17 examples.
- Constant rater and incomplete batch rows appear in the run report.
- Reproduce: export CSV + documented formulae → same ranks.

Depends on: [04-t2-judging.md](04-t2-judging.md) and kickoff fixtures.

## In scope

- Persist and export `normalization_runs`
- Appendix in `JUDGING.md`: method, assumptions, failure cases, σ_raw vs σ_norm, rank-delta table
- Organizer UI or export that shows before/after (does not leak to judges)

## Out of scope

- Fake numbers before fixtures exist
- Switching method in the proof without changing product code
- Claiming Devfolio-compatibility without a citation

## Data-model

`normalization_runs`, `normalized_scores` (already in 02/04)

## API/UI

`POST /events/{id}/normalization-runs`, `GET` run detail, CSV of raw vs normalized. Organizer/admin only.

## Acceptance hypotheses

Suite may not grade the bonus. Judges will read JUDGING.md. Treat documentation completeness as the acceptance test.

## Docs to update

`JUDGING.md` appendix. Journal: maths that fought back.

## Bonus linkage

This is bonus 1. Pairwise (08) is a separate mode, not a replacement proof for rubric normalization.
