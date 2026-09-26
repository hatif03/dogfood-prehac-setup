# Target format: JUDGING.md section

Use this density and order when filling `docs/templates/JUDGING.md` after T2 exists. Numbers below are **illustrative**, not fixture output.

## Method

Per-criterion weighted sum, then per-judge robust z-score (median / MAD). Constant raters (MAD = 0) contribute no scale; their rows are marked `unscalable` and dropped from the normalized ranking with the raw values retained in the audit table.

## Assumptions

- Judges see a subset of projects (FIG.04: ~3 reviews/project, disjoint ballots).
- Absolute scores are noisy and leniency differs by judge.
- σ = 0 is a real fixture case, not an error.

## Failure cases

| Case | Behavior |
| --- | --- |
| Constant rater | No division by zero; excluded from z-scale; listed in run report |
| Incomplete batch | Normalize on completed cells; shrink project mean toward event prior by remaining missing count |
| Duplicate project | Eligibility flag; scores on the duplicate do not enter the ranking |

## Rank movement (illustrative)

| Project | Raw rank | Normalized rank | Delta |
| --- | --- | --- | --- |
| P-17 | 8 | 4 | +4 |
| P-04 | 5 | 4 | +1 |
| P-22 | 6 | 9 | -3 |
| P-09 | 2 | 8 | -6 |

Raw judge-spread σ vs normalized σ must be computed on the **official fixture**, not this example, and pasted into JUDGING.md for the Normalization Proof bonus.
