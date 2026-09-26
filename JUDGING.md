# Judging

How projects get to judges, how a review becomes a number, how numbers from lenient and harsh judges are made comparable, and how the final ranking is produced. Every step here is code you can run: `src/api/app/judging_math.py` (pure functions, no database), `src/api/app/assignment.py`, `src/api/app/scoring.py`.

The numbers on the real fixture, plus a simulation study, are in [docs/normalization-proof.md](docs/normalization-proof.md): every review raw and normalized, rank changes, an exact-solution check, bootstrap rank intervals and a leave-one-judge-out analysis.

Pairwise mode (Crowd-BT fitted by EM, per-judge reliability, balanced pair selection, measured against Gavel's rule) has its own page: [docs/pairwise.md](docs/pairwise.md).

## 1. Assignment

`POST /v1/events/{event}/assignments` fills every eligible project up to N distinct reviewers (`reviews_per_project`, default 3).

- **Eligible** means submitted and not carrying a blocking flag (duplicates, ineligible). Drafts are never judged.
- **Track-aware.** A judge with tracks only receives projects in those tracks. A judge with no tracks covers all of them.
- **Conflict-free.** A judge is never assigned a project from a team they are on. The role model makes this structural too: one role per person per event, so a judge cannot join a team, and a team member cannot accept a judge invite.
- **Load-balanced.** Projects with the fewest reviewers are filled first, each taking the least-loaded eligible judges. Ties break on id, so a run is deterministic.
- **Top-up, never reshuffle.** Existing assignments are kept. Re-running after a judge drops out or new judges join only adds what is missing, so nobody loses work already done. `(event, judge, project)` is unique in the database.
- **Honest about gaps.** If a track has fewer judges than N, the response lists every project that could not be filled.

The fixture comes with 126 scores and no assignment list, so the importer records one assignment per fixture score (batch kind `imported`). The organizer dashboard then shows the fixture's real coverage: of the 40 judged projects (the duplicate is excluded), 8 have 2 reviews, 26 have 3, 2 have 4 and 4 have 5.

## 2. From a review to a number

The organizer configures criteria and weights (`PUT /v1/events/{event}/rubric`) and the scale (default 1–5, the fixture's scale). Weights are stored normalized, `Σ w_c = 1`. A judge scores every criterion; the review's weighted score is

```text
y = Σ_c w_c · x_c
```

Changing weights later recomputes every stored `y` in the same transaction and writes the before/after weights to the audit log. The fixture's three criteria (functionality, quality, innovation) are imported with equal weights.

Validation happens in the API: values outside the scale are rejected, and a review cannot be marked submitted until every criterion has a value.

## 3. Normalization

### The problem

Judges differ in how generous they are. If projects were each seen by every judge, that would not matter. They are not: on the fixture each project has 2–5 reviews from judges scoped to its track, so a project that drew two generous judges beats an equal project that drew a harsh one.

Two common fixes fail on this data:

- **Raw mean** keeps the problem.
- **Per-judge z-scores** (subtract each judge's mean, divide by their spread) assume every judge saw a random sample of quality. Track-scoped judges did not. A judge who drew the strongest track looks harsh after z-scoring and drags good projects down. With 1–3 reviews per judge the spread is also mostly noise, and a constant rater has zero spread, so the division is undefined.

### The model

We fit an additive judge-leniency model to the incomplete judge × project table:

```text
y_jp = μ + θ_p + b_j + ε_jp

minimize   Σ (y_jp − μ − θ_p − b_j)²  +  λ_judge · Σ_j b_j²  +  λ_project · Σ_p θ_p²
```

- `μ` is the overall average, `θ_p` is project p's quality relative to it, `b_j` is judge j's leniency (positive = generous).
- The solution is the best linear unbiased predictor of a crossed random-effects model, with `λ = σ²_noise / σ²_effect`. In plain terms: judges are compared only through projects they both saw, which is exactly the information an incomplete design contains.
- **`λ_judge = 2`**: a judge's offset behaves as if they had also given two average reviews. One harsh review is not enough to write a judge off as harsh, and it is not enough to make their project look good after correction.
- **`λ_project = 1`**: projects are shrunk toward the mean in proportion to how little evidence they have. A two-review project cannot leapfrog a five-review project on noise.
- **Solver.** Gauss–Seidel backfitting: update every `θ_p`, then every `b_j`, then `μ`, until nothing moves more than 1e-10. The objective is strictly convex when both λ are positive, so the minimum is unique and the iteration converges. No numerical libraries needed.
- **Reported score** is `μ + θ_p`, on the original 1–5 scale, so organizers read "3.9 adjusted" rather than a z-score. Next to it the portal shows an approximate standard error `σ̂ / √(n_p + λ_project)` and the review count.

### The awkward cases

| Case in the fixture | What happens |
| --- | --- |
| Constant rater (`jdg_07`: three projects, every criterion 4) | Judges with 3+ reviews and zero variance are excluded from the fit and listed on the run and on the dashboard's integrity panel. Their scores say nothing about order; left in, they only pull their projects toward each other. The run parameter `drop_constant_raters=false` keeps them. |
| A judge with one review (`jdg_01`) | Not flagged (one review is not evidence of anything). The offset prior limits how much of that review is attributed to the judge rather than the project. |
| Unfinished batches: 2 vs 5 reviews | Shrinkage on `θ` and the standard error make thin evidence visible and humble. |
| One judge far out of line on one project (possible collusion or a typo) | Every run lists reviews whose residual exceeds 2.5σ̂; the organizer dashboard shows them. The fixture has none. |
| Duplicate submission (`prj_41` = `prj_07`) | Flagged at import (same title and same repo URL, later timestamp), excluded from assignment, normalization and the gallery. Its data stays in the database and in exports; the organizer can clear the flag. |

### Cross-check

Every run also fits Bradley–Terry to rank-broken pairs: within each judge, every pair of projects they scored differently becomes a win for the higher one. Leniency cancels by construction, since a judge's +1 is on both sides of every pair. The run stores Kendall τ between that ranking and the adjusted ranking. On the fixture τ ≈ 0.72. Agreement is not perfect and should not be: rank-breaking throws away how far apart two scores were and ignores projects a judge saw alone, so it is the noisier estimator (in the simulation it recovers the truth worse than the shipped model). What it is good for is a sanity alarm. It shares no modelling assumptions with the additive fit, so if the two ever disagree sharply the organizer should look at the data before publishing.

### Evidence

[docs/normalization-proof.md](docs/normalization-proof.md), generated by `python -m app.proof`:

- the full adjusted table for the fixture with rank movements and judge offsets;
- a Monte-Carlo study on 300 synthetic events with the fixture's shape (8 tracks, track-scoped judges, 2–5 reviews, integer scores, a constant rater), where the true ranking is known. The additive model recovers it better than raw means and much better than z-scores;
- a sensitivity table showing ranking quality is flat across an order of magnitude of λ, so the defaults are not tuned to the fixture.

Properties are pinned by `tests/api/test_normalization.py`: offsets cancel on shared projects, a lenient-judge-only project loses its unearned lead, constant raters are excluded and reported, thin evidence gets larger error bars, the fixture flags `jdg_07` but not `jdg_01`.

### Limits

- Leniency is additive. A judge who uses a wider or narrower part of the scale is treated as noise, not as a scale factor. Estimating a per-judge scale needs more reviews per judge than most hackathons produce (fixture median: 3).
- When there are too few overlapping reviews to estimate noise (fewer than 5 residual degrees of freedom, e.g. a brand-new event), σ̂ falls back to 0.75, the fixture's level, instead of reporting a false ±0.
- The standard error ignores uncertainty in the offsets. Treat projects within one SE of each other as tied; the results page shows the SE for that reason.
- Integer rounding and the 1/5 ceiling are not modelled. The simulation includes both.

## 4. Results

`POST /v1/events/{event}/normalization` stores an immutable run (method, parameters, every row, judge offsets, cross-check). Results always come from the latest run. `GET /v1/events/{event}/results`:

- is **403** to everyone but organizers until the organizer publishes and the voting window has closed (publishing is refused while voting is open);
- never exposes judge offsets or per-judge scores publicly, only the ranking, the adjusted score, the SE and the review count;
- includes the popular vote tally separately. Community votes are never mixed into the judged score.

CSV: `GET /v1/events/{event}/export/results.csv` (rank, project, raw mean, adjusted, SE, raw rank, rank change) and `scores.csv` (one row per review with every criterion), enough for a statistician to recompute everything here.

## 5. Isolation

Enforced in `src/api/app/rbac.py` and exercised in `tests/api/test_isolation.py`:

- `GET /scores` as a judge returns only their own reviews. `?judge=<someone else>` is **403**. A peer's review or assignment by id is **404**, so ids cannot be probed.
- Participants get **403**, anonymous callers **401**, on every score, assignment, dashboard, normalization, export and audit route.
- Organizers read everything but write no scores: a review can only be written by the judge it is assigned to.
- Track-scoped judges only see projects in their tracks, including in pairwise mode.
