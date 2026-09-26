# 09 — Bonus: Threat Model (+3, Medium)

## Goal

A written, defensible threat model for voting and submission abuse. Name attacks we stopped and those we did not. Honest list beats heroic list.

## Score impact

+3 bonus. Integrity 25% (vote abuse before a judge asked). Write-up fuel.

## Gate

- `THREAT-MODEL.md` exists at a judge-visible path (repo root or linked from README).
- Every T3 control is listed with residual risk.
- Organizer can open an audit UI/CSV (not `psql`).
- Human `Reviewed:` line.

Depends on: [05-t3-public.md](05-t3-public.md) so controls are real.

## In scope

Attacks called out by the brief:

- Sybil votes
- Ballot stuffing
- Submission scraping
- Judge collusion
- Deadline gaming

Plus T2.03 peer-score peek and results leak during the voting window.

Use `docs/templates/THREAT-MODEL.md`.

## Out of scope

- Claiming we stopped off-platform brigades completely
- Generic OWASP dump with no product mapping
- Shipping the doc before rate limits exist

## Data-model

`audit_events` fields: actor, action, resource, ip_hash, timestamp, payload redacted.

## API/UI

Organizer audit log filter + CSV. No new public surface.

## Acceptance hypotheses

Judges read the doc. Suite may probe rate limits and hidden results (T3). Align the prose with actual status codes.

## Docs to update

`THREAT-MODEL.md`, README link, journal residual risks.

## Bonus linkage

This is bonus 3. Do not mark `.dogfood.toml` true until the file is reviewed.
