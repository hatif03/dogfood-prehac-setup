# 11 — Adoptability and deliverables

## Goal

A stranger with a laptop and the network off (after pull) gets a seeded portal from one command, plus the exact files Dogfood asked for.

## Score impact

Adoptability 20%. Honest docs feed 40% (claims) and 25% (`JUDGING.md`).

## Gate

Checklist all true before we call the product submittable:

- [ ] `docker compose up` seeded, working
- [ ] `README.md` — what it does, how to run, what it does not
- [ ] `ARCHITECTURE.md`
- [ ] `DATA-MODEL.md`
- [ ] `JUDGING.md`
- [ ] `THREAT-MODEL.md` (bonus 09)
- [ ] `LICENSE` MIT
- [ ] `.dogfood.toml` matches `acceptance-report.txt`
- [ ] `acceptance-report.txt` is **suite stdout**, not hand-written
- [ ] tests/ beyond the suite
- [ ] 5-minute demo script recorded (create → submit → judge → publish)
- [ ] Public GitHub repo

Depends on: plans 06–10 as far as gates passed. Do not claim T4 in toml if 06 is incomplete.

## In scope

- Copy templates to root and fill them
- Seed accounts table in README
- Video script (below)
- Honest gap list

## Out of scope

- Inflating toml
- Hosted demo URL as the submission
- Figma

## Data-model

No new tables. Export paths must be described in DATA-MODEL.md.

## API/UI

Demo path only.

### 5-minute video script

1. Compose up, open localhost (15s)
2. Organizer creates event, tracks, weighted rubric (45s)
3. Participant invite, submit project (45s)
4. Judge scores two projects; second judge cannot see the first's scores (60s)
5. Organizer dashboard + normalize + rank movement (45s)
6. Voting window, results hidden, then publish (45s)
7. Export CSV / OpenAPI / certificate (30s)
8. Honest "not yet" if any (15s)

## Acceptance hypotheses

Judges run compose and the suite. If either fails, nothing else matters.

## Docs to update

All judge-facing docs. Changelog human-reviewed.

## Bonus linkage

Toml bonus flags only if 07–10 gates passed.
