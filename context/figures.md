# Figures

Transcribed from https://dogfoodhack.com/ with acceptance implications. FIG.05 (timeline) is ignored by project policy except the kickoff file dependency. FIG.06 (prize pool) is motivation only.

## FIG.01 — Event pipeline / 10 stages

Failure surface: **stage 07 Normalization**.

1. Registration
2. Teams
3. Submissions
4. Eligibility
5. Assignment
6. Scoring
7. Normalization
8. Results
9. Certificates
10. Archive

Implication: the data model and exports must cover all ten. A gallery-only or judging-only slice fails the "one product" rule.

## FIG.02 — Role isolation matrix / backend-enforced

Verified by acceptance suite **T2.03**. Permitted means the API returns data. Denied means 403/404, not a hidden button.

See [role-isolation.md](role-isolation.md).

## FIG.03 — Weight distribution / final score

Dogfood's own judging of our submission:

- 40% Tier completion and correctness
- 25% Judging integrity
- 20% Adoptability and operability
- 15% Code quality and innovation

The figure also shows why normalization matters: raw judge spread σ ≈ 0.94 vs normalized σ ≈ 0.31, with rank movement (projects jump and fall). Our `JUDGING.md` must show a similar before/after on fixture data (bonus: Normalization Proof).

## FIG.04 — Judge assignment / batched, disjoint

No judge sees a peer's ballot.

Shape called out on the site: batch of ~40 projects, 30 judges, 3 reviews per project.

Implication: assignment algorithm produces disjoint ballots, configurable reviews-per-project (default 3), track-scoped judges never listed on another track.
