# Fixture expectations

Official `fixtures.json` is unpublished until kickoff. Plan the schema against the shape the brief already disclosed.

## Shape of a Raptors event (synthetic)

- Roughly **40 projects**
- **30 judges**
- **8 tracks**
- A full set of scores
- No real names, no real submissions

## Edge cases the suite is built to expose

If the portal only works on tidy input, we find out on the fixture, not on Monday.

1. **Constant rater** — a reviewer who rates everything the same. Naive z-score divides by σ = 0. Method must not explode; see `plans/04-t2-judging.md` and `plans/07-bonus-normalization-proof.md`.
2. **Incomplete batch** — some assigned reviews missing. Normalization and ranking must still produce a result; shrink or exclude with the rule documented.
3. **Duplicate entry** — eligibility / duplicate detection must flag it, not silently double-count.

## Assignment figure (FIG.04)

40 projects × 3 reviews per project = 120 assignment cells, spread across 30 judges (about 4 projects each if even). Ballots are disjoint: no judge sees a peer's scores.

## Until the file exists

- Do not invent fixture rows in the repo.
- Do not commit a fake `acceptance-report.txt` that claims passes.
- After kickoff, load the real file and update this note with exact IDs and any extra edges.
