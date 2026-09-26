# JUDGING

Purpose: assignment strategy, scoring maths, normalization method, pairwise mode — defended. Feeds Judging Integrity (25%) and bonuses 1–2.

Status: template — copy to repo root after T2 exists. Fill proof tables from official fixtures, not invented rows.

Non-goals: "we averaged the scores."

See `context/examples/judging-section.md` for target density.

## Contract

A statistician can reproduce the ranking from exported CSVs and this document. Constant rater and incomplete batch are specified, not hoped away.

## Assignment

- Batched, disjoint ballots (FIG.04)
- Default 3 reviews per project, configurable
- Track-scoped judges never assigned off-track
- No judge sees a peer's ballot (API-enforced)

## Rubric scoring

Organizer-configurable weighted criteria. Weights sum to 1. Per-project judge score = Σ (weight_i × cell_i).

## Normalization

Working method (locked unless kickoff spec forbids it):

1. Compute weighted raw score per (judge, project).
2. Per judge, robust z-score using median and MAD.
3. If MAD = 0 (constant rater): mark `unscalable`; exclude from normalized ranking; keep raw in audit.
4. Incomplete ballots: normalize on completed cells; shrink project aggregate toward event prior proportional to missing reviews.
5. Persist a `normalization_runs` row: method, params, raw vs normalized, rank delta.

Why not sample σ z-score: fixture includes a judge who rates everything the same.

## Pairwise mode (bonus 2)

Alternative event judging mode. Judge sees two projects, picks a winner. Recover ranking with a Bradley-Terry / Crowd-BT style estimator. Original implementation, MIT, citing Gavel/Thurstone. Comparison graph must be connected enough to rank.

## Worked example

Paste fixture proof table here after plan 07:

| Project | Raw rank | Normalized rank | Delta |
| --- | --- | --- | --- |

Raw σ vs normalized σ:

## Open questions

- [ ] Exact MAD constant (1.4826 vs 1)
- [ ] Prior for shrinkage
- [ ] Pairwise prior / regularization
