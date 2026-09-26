# 05 — T3 Public

## Goal

Public surface: community voting with configurable access, comments, hidden results, randomised ballots, anti-abuse an organizer can read.

## Score impact

Tier 40% (T3). Integrity 25% (vote abuse, hidden results via API). Innovation 15% if quadratic voting is real, not a flag.

## Gate (must be true before T4 claims)

- Results and aggregates hidden from everyone but organizers during the voting window **including curl**.
- Ballot order is not insertion order (seeded random per ballot).
- Access mode is configurable: `open_link` | `email_gated` | `authenticated`.
- Rate limits fire; organizer audit log shows vote events without SQL.
- Comments on gallery projects.

Depends on: [04-t2-judging.md](04-t2-judging.md).

## In scope

- Community voting, configurable access (Mailpit for email-gated)
- Default **one-person-one-vote**
- **Quadratic voting** as optional mode: casting n votes on one project costs n² influence budget (document in JUDGING.md / THREAT-MODEL.md)
- Comments on gallery projects
- Results hidden during voting window
- Randomised project ordering on ballots (kills position bias)
- Anti-abuse: Redis rate limits, duplicate detection, organizer-readable audit trail

## Out of scope

- On-chain voting
- Treating quadratic mode as a stub checkbox
- Publishing live leaderboards to visitors during the window
- External CAPTCHA SaaS (if needed, local proof-of-work or email gate only)

## Data-model

`ballots`, `votes`, `comments`; reuse `audit_events`. Eligibility/duplicate flags may feed vote eligibility.

## API/UI

**API:** create ballot, cast vote, list comments, post comment, organizer configure voting, organizer peek results, public results 404 until publish.

**UI:** gallery vote widget, comment thread, organizer voting settings, hidden public results page.

## Acceptance hypotheses

- GET results as visitor during window → denied
- Two requests, different ballot order (or stored permutation)
- Email-gated: vote without confirmed mailbox fails
- Burst votes from one IP hit 429

## Docs to update

THREAT-MODEL draft (finished in plan 09). README honest limits. Journal abuse cases.

## Bonus linkage

Plan 09 is the written threat model of these surfaces. Plan 10 must include every voting UI action.
