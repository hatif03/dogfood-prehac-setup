# 15 — Full compliance, quality testing, then UX

Reviewed: pending

Order is fixed by the human: **(A) every submission requirement, checked against the website, the spec and all provided data → (B) accuracy, scalability, concurrency, speed → (C) UX rework with Radix, Amicro and the dinosaur art.** Nothing in C starts before A and B are green.

## Sources re-read for this plan

- `spec/spec.md`, `spec/context.txt`, `spec/run.py`, `spec/fixtures.json`
- https://dogfoodhack.com/ (tiers, FIG.01–06, bonus text, repository layout)
- Its references: [1] Devpost judging and public voting, [6]–[8] Devfolio normalization claims and fixed rubric, [10] DoraHacks quadratic-voting retrospective, [12] Gavel (Crowd-BT, Chen et al. 2013), [13] awesome-hackathon, [14] devpost-api (community scraper: no official API)
- Amicro (`.agents/skills/amicro-design-system/SKILL.md`, `registry/`), Radix Primitives

## Gaps found against the website (not in the brief we worked from)

| Website says | Today | Fix |
| --- | --- | --- |
| Repo layout `src/`, `tests/` at the root | `apps/`, pytest in `apps/api/tests` | Move to `src/api`, `src/web`; pytest to `tests/api`; acceptance to `tests/acceptance` |
| "CSV export at every stage" of FIG.01's 10 stages | 8 CSVs | Add registrations, eligibility, normalization, records; `archive.zip` bundling every stage |
| FIG.01 "an archive somebody can query two years later" | export.json only | `archived` state (read-only) + `archive.zip` (all CSVs, export.json, normalization runs, audit chain, public key) |
| "REST API and webhooks covering every UI action" | ~10 webhook actions | Webhooks emitted from the audit log: every audited action is a webhook action; `prefix.*` subscriptions |
| Voting access "open link, email-gated, authenticated" | authenticated, email-gated, single-use links | Add `open` (anyone with the link; one ballot per browser, IP-limited); keep single-use links |
| "A track judge must never see another track" | enforced, not directly tested | Explicit tests on every judging read, including pairwise |
| Deadline "actually holds" | submission writes locked | Also lock team creation/join/rotate after the deadline |
| FIG.03 shows judge spread σ raw → normalized | not in proof | Report σ of judge means before/after |
| Pairwise "the Gavel approach" | plain BT + heuristic pairs | Crowd-BT (judge reliability) with expected-information-gain pair selection, BT-MM as the offline estimator; proof by simulation |
| Normalization proof "raw scores, normalized scores, ranking change" | project-level only | Appendix: every fixture review raw → normalized (y − b̂_j); exact-solution check; bootstrap rank intervals; leave-one-judge-out stability; residual diagnostics |
| Threat model names five attacks | covered but mixed | Restructure: the five named attacks first, stopped / not stopped; QV Sybil amplification ([10]); collusion *detection* via outlier residuals |
| API first "every action in the UI" | docs table | Automated test: every `/v1/...` path the web app calls exists in the OpenAPI document; generated UI→API map |

## A. Compliance (every requirement, every data record)

1. Restructure repo (A1). Update compose, Dockerfiles, CI, docs, AGENTS/CLAUDE, `.dogfood.toml` comments.
2. Backend gaps above (A2).
3. Bonus hardening above (A3).
4. `docs/SPEC-COMPLIANCE.md`: every tier bullet (website wording), FIG.01 stage, deliverable, rule and bonus → code → test → status (A4).
5. Fixture exhaustiveness tests (A5): every track, judge (with tracks), team member, project, score value and comment imported; every judge can sign in and sees exactly their fixture reviews and nothing outside their tracks; every member is on their team; coverage histogram equals the fixture; `jdg_07` excluded, `prj_41` flagged; full lifecycle (create → submit → judge → publish) as one test.

## B. Quality

1. **Accuracy**: backfitting equals the closed-form normal-equation solution; BT/MM at the MLE (gradient ≈ 0); Crowd-BT update matches the paper's moment-matching equations numerically; weighted totals equal hand arithmetic for every fixture review; CSV numbers equal API numbers.
2. **Scalability**: `tests/perf/bench.py` generates 2 000 projects / 300 judges / 10 000 reviews through the importer and times import, normalization, dashboard, gallery, results CSV, audit verify. Fix N+1 queries (eager loading, aggregate queries), add indexes. Results in `docs/PERFORMANCE.md`.
3. **Concurrency**: `tests/perf/concurrency.py` against the Postgres stack: parallel ballot creation, votes, score saves, comments, submissions. Invariants: no 5xx, one ballot per voter, vote totals consistent, audit chain verifies. Fix races (IntegrityError → 409/idempotent retry; webhook claims with `FOR UPDATE SKIP LOCKED`), then run the API with several workers.
4. **Speed**: gzip, cache headers on static and assets, lean payloads.

## C. UX (after A and B)

1. Heuristic review of every screen per role; task walkthroughs with timings (CDP).
2. Replace hand-rolled primitives with **Radix Primitives** (`radix-ui`): Dialog, AlertDialog, DropdownMenu, Tabs, Tooltip, Popover, Select, Switch, Slider, Toast, Accordion, ToggleGroup, ScrollArea, Progress.
3. Information architecture: role-aware home ("what do I do next"), clearer event navigation, fewer screens between intent and action, plain copy.
4. Motion per Amicro's rules (ease `[0.16, 1, 0.3, 1]`, feedback toasts, optional haptics); vendor only the MIT registry components used, with attribution. The npm package is not used: it depends on `@google/genai`, `express` and `vite` at runtime.
5. The dinosaur art (`dinosaur-matrix.png`, 5 MB) as optimized WebP (hero, sign-in, 404) with `next/image`; original kept in `docs/assets/`.
6. Accessibility (axe-core in CDP), mobile widths, reduced motion.

## Done when

- `spec/run.py`: 7/7 through :8080 on a fresh `docker compose up`.
- `tests/acceptance/extended.py`: all pass on the same stack.
- pytest green; bench and concurrency reports committed.
- `docs/SPEC-COMPLIANCE.md` has no open rows except the demo video.

## Status (2026-09-25)

A, B and C are done. Every "Done when" line holds on a fresh stack: run.py 7/7, extended 21/21, and pytest green (168). Bench and concurrency reports are in `docs/`. SPEC-COMPLIANCE's only open row is the demo video. The details for C are in plan 16's status section.
