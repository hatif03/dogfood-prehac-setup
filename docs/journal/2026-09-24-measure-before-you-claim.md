# 2026-09-24 (later): measure before you claim

Reviewed: pending

Write Up Quest material. Four things we believed until we measured them.

## "Active pair selection is better" (it depends what you want)

Pairwise mode first used Gavel's rule: keep the judge's last pick, and add the partner with the largest expected information gain. The pairwise proof was drafted with the sentence "active pairing reaches a given accuracy with fewer comparisons" before the simulation ran. The simulation said otherwise.

- For the **whole ranking** (Kendall τ to the truth), Gavel's rule was worse than random pairs at every budget.
- For the **top five**, it was the best at every budget. That is what it was designed for.
- It also **hid bad judges.** It deliberately serves near-coin-flip pairs, and on a coin flip an honest judge's answer looks like a random judge's. After 20 comparisons each, the EM fit still rated a judge who always picks the worse project at 0.88 (0.49 after 40), against 0.27 and 0.13 with balanced coverage (docs/pairwise.md has the full table).

We now ship balanced coverage (the least-compared project against a partner the judge has not seen it with), plus Crowd-BT fitted by EM for the ranking. Gavel's rule stays in the code as the measured baseline, and the proof's conclusions are computed from the table rather than typed in advance. That is the only honest way to write a generated proof.

## "The online filter learns judge reliability" (slowly)

Gavel updates Crowd-BT one comparison at a time under a prior that assumes judges are honest (Beta(10, 1)). After 40 comparisons per judge it still rated a judge who always picked the worse project at 0.88. Fitting the same likelihood to the whole log by EM (a latent "answered truthfully" bit per comparison, soft wins in the Bradley–Terry step) separates them clearly: honest 0.98, random 0.47, contrarian 0.13.

## "MM is the standard Bradley–Terry algorithm" (and it took 160 seconds)

The benchmark imported 2 000 projects and 10 000 reviews, and the import timed out behind the web proxy. The profiler put 97% of the time in one generator inside Bradley–Terry: the rank-broken cross-check on 146 000 pairs. MM (Hunter 2004) converges linearly, and on the weakly connected graphs that track-scoped judging produces it needed thousands of sweeps.

Newton's method on the same concave objective, with a preconditioned conjugate-gradient inner solve (the Hessian is a graph Laplacian), took the 400-project case from 160 s to 1.2 s. The first version then stalled at the optimum. The objective sums 10⁵ logs, so near the top every step "decreased" it by rounding error and backtracking rejected them all. It now stops on the Newton decrement and compares objective values with a relative tolerance. It matches MM to 1e-11 on small problems, and there is a test asserting that no nudge of any strength improves the objective.

## "Unique constraints make it race-free" (mostly)

A thread-barrier script releases 24 identical requests at once against Postgres with 4 workers. Seven of the eight invariants held on the first run. The review save deadlocked: two saves of one review took the review's row locks and the audit-chain advisory lock in opposite orders. Locking the assignment row first puts every writer to that review in one queue. A deadlock that slips through anyway becomes a 409, never a 500.

## "One command works" (until Docker Hub moves)

The first real `docker compose up` failed on the pull: `minio/minio` is gone from Docker Hub. The image now comes from `quay.io/minio/minio` and is pinned to a release. It is a small thing that would have stopped every judge at step one.
