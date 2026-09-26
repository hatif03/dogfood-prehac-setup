# ADR 0002: Additive judge-offset model instead of per-judge z-scores

Status: accepted
Date: 2026-09-24
Reviewed: pending

## Context

The first normalization was per-judge robust z-scores (median/MAD) with k/(k+1) shrinkage, designed before the fixture was published. On the real `fixtures.json`:

- judges are track-scoped (21 cover one track, 9 cover two), so a judge's batch is not a random sample of quality;
- judges have 1–11 reviews (median 3), so a per-judge spread is mostly noise;
- one judge (`jdg_07`) has zero spread, which makes a z-score undefined.

Z-scoring assumes the opposite of all three.

## Decision

Fit `y_jp = μ + θ_p + b_j + ε` by penalized least squares (λ_judge = 2, λ_project = 1) with Gauss–Seidel backfitting, report `μ + θ_p` on the original scale with an approximate SE, and exclude constant raters (≥3 reviews, zero variance) by default. Keep the z-score and the raw mean only as baselines in the proof.

## Evidence

Monte-Carlo on 300 fixture-shaped events (`docs/normalization-proof.md`): Kendall τ to truth 0.77 for the additive model against 0.72 for the raw mean and 0.61 for per-judge z-scores. Rank quality is flat across λ from 0.5 to 10.

## Consequences

- Scores are readable ("3.9 adjusted") instead of z-units.
- A judge who stretches the scale is not modelled; documented in JUDGING.md as a limit.
- The run stores an independent Bradley–Terry cross-check on rank-broken pairs, so a bad fit is visible before publication.

## Alternatives considered

- **Per-judge z-scores**: rejected, see Context.
- **Full REML mixed model**: better variance estimates, but needs a numerical library and is harder to audit; the simulation shows fixed λ loses little.
- **Pairwise only**: supported as a mode, but organizers asked for weighted rubrics.
