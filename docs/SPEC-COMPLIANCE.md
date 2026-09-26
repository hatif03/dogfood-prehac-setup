# Spec compliance

Every requirement from dogfoodhack.com, `spec/spec.md` and the brief, with where it lives and what proves it. Paths are relative to the repo root; tests are in `tests/api/` unless marked **acc** (`tests/acceptance/extended.py`, run against the live stack) or **run.py** (the official checker).

Status: **Done** means implemented, reachable from the UI where there is a UI, and covered by a test. Anything else says what is missing.

## The official checker (`spec/run.py`)

| Check | Route in `.dogfood.toml` | Test | Status |
| --- | --- | --- | --- |
| T1 gallery is public | `GET /v1/events/sample-hack-2026/projects` | `test_acceptance_paths.py::test_gallery_is_public_and_shows_fixture_titles` | Done, PASS in `acceptance-report.txt` |
| T1 project from fixtures shown | same | same | Done, PASS |
| T1 closed event refuses submissions | `POST /v1/events/sample-hack-2026/projects` | `test_acceptance_paths.py::test_closed_event_refuses_submission` | Done, PASS |
| T2 judge sees own scores | `GET .../scores` as judge A | `test_acceptance_paths.py::test_judge_reads_own_scores` | Done, PASS |
| T2 judge cannot see peer scores | `GET .../scores?judge=jdg_24` as judge B | `test_acceptance_paths.py::test_judge_cannot_read_peer_scores` | Done, PASS |
| T2 participant blocked | `GET .../scores` as participant | `test_acceptance_paths.py::test_participant_is_not_a_judge` | Done, PASS |
| T2 csv export works | `GET .../export/results.csv` as organizer | `test_acceptance_paths.py::test_organizer_exports_csv` | Done, PASS |

## T1 Core

| Requirement (website) | Implementation | UI | Test | Status |
| --- | --- | --- | --- | --- |
| Authentication and sessions | `routers/auth.py`, Argon2id, HMAC-hashed server sessions, logout ends one session | `/login`, `/register` | `test_voting.py`, `conftest.py` (every test signs in) | Done |
| Role model: visitor, participant, judge, organizer, admin | `rbac.py::Actor`, one role per (event, user) | role badge in the event header | `test_isolation.py` (26 combinations) | Done |
| Event creation with configurable dates, tracks, prizes | `routers/events.py` create/patch/tracks/prizes, date order validated | `/events/new` wizard, Organize → Settings | `test_lifecycle.py`, `test_deadline.py::test_event_dates_must_be_in_order` | Done |
| Team formation by invite link | `routers/projects.py` teams, invites, rotation, size cap | Submit page team card, `/invite/[token]` | `test_deadline.py::test_invite_link_draft_edit_submit_then_deadline_locks` | Done |
| Project submission with draft and edit until the deadline | save (draft), submit, unsubmit, images | Submit page editor with autosave | same, `test_lifecycle.py` | Done |
| Deadline enforcement that actually holds | `ensure_open()` on every submission and team write; archive guard in `deps.py` | locked banner | `test_deadline.py`, `test_compliance.py::test_deadline_also_locks_teams`, run.py T1 | Done |
| Public gallery with search and filter | `GET /projects?q=&track=&tag=`, SSR | `/events/[slug]` | `test_fixture_exhaustive.py::test_gallery_lists_every_project_once` | Done |

## T2 Judging

| Requirement (website) | Implementation | UI | Test | Status |
| --- | --- | --- | --- | --- |
| Judge invitation and assignment (batch or algorithmic) | emailed invites with track scope and account claiming; track-aware, conflict-free, load-balanced top-up assignment | Organize → Judging, `/judge-invite/[token]` | `test_lifecycle.py`, `test_integrity.py::test_assignment_top_up_is_idempotent_and_conflict_free` | Done |
| Weighted, organizer-configurable rubric | `PUT /rubric`, weights normalized, totals recomputed and audited | Organize → Judging rubric editor; judge console shows weights | `test_integrity.py::test_reweighting_the_rubric_recomputes_totals`, `test_rubric_put_matches_criteria_by_key_and_reports_recompute` | Done |
| Role isolation in the backend: a judge must not see another judge's scores | `Actor.may_read_judge`: by name 403, by id 404 | refusal screens | `test_isolation.py`, `test_fixture_exhaustive.py` (all 30 judges), run.py T2 | Done |
| "A track judge must never see another track" | `Actor.sees_track` on queue, scores, pairwise | — | `test_compliance.py::test_a_track_judge_never_sees_another_track`, `test_track_judge_pairwise_items_stay_in_track` | Done |
| Live progress dashboard | `GET /dashboard` (per-judge progress, coverage, integrity, activity) | Organize → Overview, polls every 4 s | `test_fixture_exhaustive.py::test_coverage_constant_rater_and_duplicate`, **acc** | Done |
| Cross-judge normalization with documented method | additive judge-offset model (`judging_math.py`), JUDGING.md, generated proof | Organize → Results (slope chart, offsets) | `test_normalization.py` | Done |
| CSV export at every stage | 12 stage CSVs + `archive.zip` | Organize → Integrations | `test_compliance.py::test_every_stage_has_a_csv`, **acc** | Done |

## T3 Public

| Requirement (website) | Implementation | UI | Test | Status |
| --- | --- | --- | --- | --- |
| Community voting: open link, email-gated, authenticated | modes `open`, `email_gated`, `authenticated`, plus organizer-minted single-use `link` | `/events/[slug]/vote`, Organize → Voting | `test_voting.py`, `test_compliance.py::test_open_link_voting_one_ballot_per_browser` | Done |
| "Or something better than one-person-one-vote": quadratic | `vote_mode=quadratic`, `Σ units² ≤ budget` (n votes cost n², i.e. influence grows with √credits) | credit meter on the ballot | `test_voting.py::test_quadratic_budget`, `test_lifecycle.py` | Done |
| Comments on gallery projects | signed-in, rate-limited, moderated | project page | `test_voting.py::test_comments_need_login_rate_limit_and_moderation` | Done |
| Results hidden from everyone but organizers during voting | `results_visible`; publish refused while voting is open | results locked page, organizer preview banner | `test_isolation.py::test_results_hidden_until_published_and_voting_closed` | Done |
| Randomised ordering on ballots | per-ballot CSPRNG shuffle, stored | ballot notes the shuffle | `test_voting.py::test_ballots_are_shuffled_per_voter`, **acc** | Done |
| Anti-abuse: rate limits, duplicate detection, audit trail | Redis limits; duplicate submissions and voter aliases; hash-chained audit with verify | Organize → Audit, integrity panel | `test_voting.py`, `test_integrity.py::test_audit_chain_verifies_and_detects_tampering`, **acc** | Done |

## T4 Stretch

| Requirement (website) | Implementation | UI | Test | Status |
| --- | --- | --- | --- | --- |
| REST API and webhooks covering every UI action | 80 documented operations on 69 paths; every audited action is a webhook action | Organize → Integrations | `test_api_first.py` (every UI call is documented), `test_compliance.py::test_every_audited_action_fires_a_webhook`, `test_integrity.py::test_webhook_signature_and_retry` | Done |
| Certificate and record generation | `POST /records` (judge, participant, winner), printable HTML | Organize → Integrations | `test_lifecycle.py`, `test_integrity.py` | Done |
| Signed, publicly verifiable judge participation records | Ed25519, canonical JSON, `.well-known` key, browser WebCrypto verify, offline CLI | `/verify` | `test_integrity.py::test_signed_judge_record_verifies_and_tampering_fails`, **acc** | Done |
| Embeddable gallery widget | `/embed.js`, `/widget/[token]`, `GET /public/widget/{token}` | Organize → Integrations snippet and preview | **acc** | Done |
| Bulk import and export | `POST /import` (fixtures.json shape), projects CSV, `export.json`, `archive.zip` | wizard import, Organize → Integrations | `test_import_export.py::test_round_trip_is_lossless`, **acc** | Done |

## FIG. 01: the ten stages, each with its own state and export

| Stage | State | Export |
| --- | --- | --- |
| Registration | `users`, `event_roles` | `registrations.csv` |
| Teams | `teams`, `memberships`, `invite_links` | `teams.csv` |
| Submissions | `submissions` (draft / submitted) | `submissions.csv` |
| Eligibility | `eligibility_flags` (duplicate, cleared) | `eligibility.csv` |
| Judge assignment | `assignments`, `assignment_batches`, `judge_tracks` | `assignments.csv`, `judges.csv` |
| Scoring | `scores`, `score_cells` | `scores.csv` |
| Normalization | `normalization_runs`, `normalized_scores` (immutable) | `normalization.csv` |
| Results | phase `results`, `results_published` | `results.csv`, `votes.csv` |
| Certificates | `signed_records` | `records.csv` |
| Archive | phase `archived` (read-only) | `archive.zip` |

## FIG. 02: the isolation matrix, backend-enforced

| Actor | Own scores | Peer scores | Other track | Aggregate | Audit log | Test |
| --- | --- | --- | --- | --- | --- | --- |
| Visitor | 401 | 401 | 401 | 401 | 401 | `test_isolation.py::test_visitors_and_participants_are_refused` |
| Participant | 403 | 403 | 403 | 403 | 403 | same |
| Judge | yes | 403 by name, 404 by id | hidden | 403 | 403 | `test_isolation.py`, `test_compliance.py` |
| Organizer | all | all | all | all | all | `test_isolation.py` |
| Admin | all | all | all | all | all | `test_isolation.py::test_api_key_is_scoped_to_its_event` |

## Deliverables and rules

| Item | Where | Status |
| --- | --- | --- |
| `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md` | repo root | Done |
| `docker-compose.yml`, seeded, offline after the first build | repo root; images pinned | Done (verified with a fresh `docker compose up`) |
| `src/` and `tests/` as on the website | `src/api`, `src/web`; `tests/api`, `tests/acceptance`, `tests/perf` | Done |
| `acceptance-report.txt` | repo root, produced by run.py against Docker | Done |
| `.dogfood.toml` with honest claims | repo root | Done |
| `LICENSE` (OSI) | MIT | Done |
| Seeded with the real fixture | `seed.py` imports `spec/fixtures.json` | Done; every record checked by `test_fixture_exhaustive.py` |
| No hosted dependencies | compose runs Postgres, Redis, MinIO, Mailpit locally; no product code calls an external API | Done |
| Role checks in the backend, not only in the UI | `rbac.py` | Done |
| Usable interface | `src/web`: Radix Themes, role-aware home, organizer lifecycle rail; axe-core has no serious or critical violations on 15 screens in light and dark; no horizontal scroll at 390 px | Done |
| 5-minute demo video | — | **Not done: recorded by the team** |

## Bonus challenges

| Bonus | Asked for | Where | Status |
| --- | --- | --- | --- |
| Normalization Proof | method on the fixture; raw scores, normalized scores, ranking change; statistician-proof documentation | `docs/normalization-proof.md` (generated): every review raw and normalized, every project's rank change and 90% rank interval, exact-solution check, judge spread, residuals, leave-one-judge-out, Monte-Carlo, λ sensitivity; JUDGING.md; ADR 0002 | Done |
| Pairwise Mode | two projects, pick the better, Bradley–Terry-style global ranking | Crowd-BT fitted by EM with judge reliability; balanced pairing; Gavel's rule measured as a baseline; `docs/pairwise.md` (generated); judge UI and organizer fit | Done |
| Threat Model | Sybil votes, ballot stuffing, submission scraping, judge collusion, deadline gaming; stopped and not stopped | `THREAT-MODEL.md` | Done |
| API First | every UI action through a documented API with a published OpenAPI spec | `/openapi.json`, `docs/openapi.json`, `docs/API.md`, `docs/UI-API-MAP.md`, `test_api_first.py` | Done |
