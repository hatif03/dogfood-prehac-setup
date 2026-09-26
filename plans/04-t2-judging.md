# 04 — T2 Judging

## Goal

Where the real engineering starts: assignment, weighted rubric, backend isolation, live progress, cross-judge normalization, CSV at every stage.

## Score impact

Judging integrity 25%. Best Judging Engine category. FIG.02 / T2.03. FIG.04 assignment. FIG.03 normalization story (product, not only the bonus appendix).

## Gate (must be true before T3 claims)

- Judge B cannot curl Judge A's scores (404/403).
- Track judge cannot see another track.
- Organizer dashboard shows who has not started.
- Weighted rubric persisted and applied.
- Normalization run produces ranks without crashing on a constant rater.
- CSV export for registration, teams, submissions, assignments, raw scores, normalized scores.

Depends on: [03-t1-core.md](03-t1-core.md). Load `.skills/role-isolation/SKILL.md` and `.skills/judging-maths/SKILL.md`.

## In scope

- Judge invitation and assignment, by batch or algorithmically
- Batched, disjoint ballots; default 3 reviews/project (FIG.04); configurable
- Scoring against a **weighted**, organizer-configurable rubric
- Role isolation enforced in the backend
- Live progress dashboard (who has not started)
- Cross-judge normalization in-product:
  1. Weighted sum per (judge, project)
  2. Per-judge robust z-score (median/MAD)
  3. MAD = 0 → `unscalable`, exclude from normalized rank, keep raw in audit
  4. Incomplete batch: shrink toward event prior
  5. Persist `normalization_runs`
- CSV export at every stage listed above

## Out of scope

- Averaging raw scores as the published ranking
- Pairwise UI (plan 08) — tables may exist, mode ships in 08
- Community voting (plan 05)
- Frontend-only "hide scores" as the isolation mechanism

## Data-model

`judge_invites`, `assignment_batches`, `assignments`, `rubrics`, `criteria`, `scores`, `score_cells`, `normalization_runs`, `normalized_scores`, `audit_events`

## API/UI

**API:** invite judges; generate assignments; get own assignments; put score cells; get own scores; organizer list progress; run normalization; CSV downloads (role-checked).

**UI:** judge console (30 reviews / ~5 hours: persist drafts, keyboard, rubric visible); organizer assignment + progress + export.

## Acceptance hypotheses

- T2.03 matrix matches `context/role-isolation.md`
- Weights change ranking vs equal weights
- Export of peer scores as judge fails
- Constant-rater fixture does not 500 the normalize endpoint

## Docs to update

`JUDGING.md` (method, assumptions, failure cases). Do not paste fake fixture rank tables until official data (plan 07).

## Bonus linkage

- 07 is the proof appendix on this method
- 08 reuses assignment/invite but different scoring path
- 09 needs audit rows from scoring mutations
