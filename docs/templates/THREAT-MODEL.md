# THREAT-MODEL

Purpose: defensible written model for voting and submission abuse. Bonus 3 (+3). Honest list of what we stopped and what we did not.

Status: template — copy to `THREAT-MODEL.md` at repo root (or `docs/`) when T3 surfaces exist.

Non-goals: heroic claims, generic OWASP paste.

## Contract

Name attackers, assets, controls, residual risk. Prefer "we did not stop X" over silence.

## Assets

- Submission content before deadline
- Judge ballots
- Community votes
- Results before publish
- PII (emails)

## Attacks

| Attack | Stopped? | Control | Residual |
| --- | --- | --- | --- |
| Sybil votes | partial | access modes, rate limit, duplicate heuristics | determined adversary with many inboxes |
| Ballot stuffing | yes/partial | one vote per subject per project; quadratic cost if enabled | |
| Submission scraping | partial | auth on drafts; public gallery is public by design | public gallery leak |
| Judge collusion | no / detect | audit trail, disjoint ballots | collusion off-platform |
| Deadline gaming | yes | server clock, no client-trusted deadline | clock skew documented |
| Peer score peek (curl) | yes | T2.03 RBAC | |
| Results leak during voting | yes | API hides aggregates from non-organizers | |

## Explicitly not stopped

- Off-platform vote brigades with unique emails if email-gated mode is on and we cannot prove uniqueness of humans
- Screenshot sharing of judge ballots
- Organizer compromise

## Worked example

Organizer opens audit log UI, filters `vote.create` by IP/prefix and token, exports CSV without a database client.

## Open questions

- [ ] Exact rate-limit numbers
- [ ] Whether quadratic voting is default
