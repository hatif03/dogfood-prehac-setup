---
name: judging-maths
description: Weighted rubric, robust z-score normalization, and Bradley-Terry pairwise ranking. Use when implementing scores, ranking, assignment maths, JUDGING.md, or bonus proofs.
---

# Judging maths

Read `plans/04-t2-judging.md`, `plans/07-bonus-normalization-proof.md`, `plans/08-bonus-pairwise-mode.md`, and `context/examples/judging-section.md`.

## Rubric

Organizer weights, sum to 1. Cell scores → weighted sum per (judge, project).

## Normalization (default)

Per-judge robust z-score: median and MAD. MAD = 0 → `unscalable`, no division by zero, drop from normalized rank, keep raw in audit. Incomplete batch: shrink toward event prior. Persist `normalization_runs` with raw vs normalized vs rank delta.

Do not ship "average the numbers".

## Pairwise

Original Bradley-Terry / Crowd-BT style estimator. Cite Gavel and Thurstone. Do not copy Gavel (AGPL). Keep the comparison graph connected. Admin ranks by μ.

## Docs

Update `JUDGING.md` in the same change. Fixture proof tables only from official data.
