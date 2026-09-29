# Deliverables

After 72 hours they want software an organizer could run. Not a design system. Not a slide deck.

## Disk anatomy (advisory layout from the brief)

```
your-portal/
├── README.md              ← what it does, how to run, honest limits
├── ARCHITECTURE.md        ← the shape of the system and why
├── DATA-MODEL.md          ← schema, import and export paths
├── JUDGING.md             ← assignment, scoring maths, normalization
├── docker-compose.yml     ← one command to a seeded, running portal
├── src/                   ← code written during the hackathon window
├── tests/                 ← our tests, beyond the acceptance suite
├── acceptance-report.txt  ← official suite output, tier by tier
├── LICENSE                ← MIT
└── .dogfood.toml          ← tiers claimed, one-line pitch
```

Also required at submission: public GitHub repo, 5-minute demo video walking one full event lifecycle (create, submit, judge, publish).

Templates for the markdown files live in `docs/templates/`. Do not create fake filled root copies until the product exists.

## What counts as done

`docker compose up` produces a working portal on localhost, seeded with official fixture data. No cloud account, no API key, no external service, no signup.

The acceptance suite runs against the build and prints a tier-by-tier pass report. Commit that output. A judge should confirm the tier without reading our code.

## Closed loopholes

- Hosted database is a dependency. Must run locally.
- Auth-as-a-service is the same problem. Build it or self-host it (we build sessions).
- A staging URL is not a submission.
- "Works on my machine" is not a submission.

If it does not come up on a laptop with the network off, they cannot adopt it.

## You'll submit (checklist)

- [x] Public GitHub repo ([hatif03/dogfood-submission](https://github.com/hatif03/dogfood-submission)), OSI-approved license (MIT)
- [ ] `docker compose up` to a seeded working portal
- [ ] `acceptance-report.txt`
- [ ] `README.md`
- [ ] `ARCHITECTURE.md`
- [ ] `DATA-MODEL.md`
- [ ] `JUDGING.md`
- [x] 5-minute demo video — https://youtu.be/YO3t1bHxJss?si=f2knnEniff1YKi9K
- [ ] `.dogfood.toml`

`JUDGING.md` feeds Judging Integrity (25%). "We averaged the scores" is a weak answer. Address the judge who marks everything a 3.
