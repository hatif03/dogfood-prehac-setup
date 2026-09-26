# Data model

PostgreSQL 16 in production, SQLite in tests; the same SQLAlchemy 2 models (`src/api/app/models.py`) run on both. Primary keys are UUIDs. Every timestamp is stored as UTC.

The tables fall into six groups. The design choices worth defending are at the end.

## People and access

| Table | Holds | Key constraints |
| --- | --- | --- |
| `users` | email, display name, Argon2id hash (or `!` for an unclaimed imported account), platform-admin flag, `external_id` (e.g. fixture `jdg_24`) | email unique |
| `sessions` | HMAC of the session token, expiry, label (`login` or `demo`) | token hash unique |
| `event_roles` | one row per (event, user): `participant`, `judge`, `organizer`, `admin` | **unique (event, user)**: nobody holds two roles in one event |
| `judge_tracks` | which tracks a judge covers; no rows = every track | unique (role, track) |
| `judge_invites` | emailed invite token, track scope, accepted time | token unique |
| `api_keys` | HMAC of the key, the organizer it acts as, its event, last use | key hash unique |

## Events

| Table | Holds |
| --- | --- |
| `events` | slug, `external_id`, copy, the date fields (`starts_at`, `ends_at`, `submissions_open_at`, `submissions_deadline`, `judging_deadline`, `voting_opens_at`, `voting_closes_at`), `judging_mode`, `voting_access`, `vote_mode`, `reviews_per_project`, `quadratic_budget`, `max_team_size`, `results_published`, `archived`, `widget_token` |
| `tracks` | per-event, unique slug |
| `prizes` | per-event, optionally per-track, ordered |
| `custom_questions` | extra submission questions |
| `rubrics` | one per event, with `scale_min` / `scale_max` |
| `criteria` | name, stable `key` (e.g. `functionality`), weight normalized so a rubric's weights sum to 1; unique (rubric, key) |

The event's phase (`upcoming`, `submissions_open`, `voting`, `judging`, `results`, `archived`) is computed from the dates and the published flag on every request, never stored, so it cannot drift from the clock.

## Teams and submissions

| Table | Holds |
| --- | --- |
| `teams` | name, `external_id` |
| `memberships` | team ↔ user, captain flag, join time; unique (team, user) |
| `invite_links` | token, revoked flag (rotating a link revokes the old one) |
| `submissions` | title, summary, description, links, tags, track, status (`draft` / `submitted` / `withdrawn`), `submitted_at`, `external_id` |
| `submission_assets` | MinIO object key and content type for screenshots |
| `custom_answers` | answers to custom questions |
| `eligibility_flags` | `duplicate` / `ineligible` / `other`, reason, `duplicate_of_id`, whether it blocks judging |

Field names follow the Dogfood fixture (`title`, `summary`, `repo_url`) so import and export map one-to-one.

## Judging

| Table | Holds | Key constraints |
| --- | --- | --- |
| `assignment_batches` | kind (`generated`, `top_up`, `imported`), target N | |
| `assignments` | judge ↔ project | **unique (event, judge, project)** |
| `scores` | one review: judge, project, `submitted`, weighted total, comment | **unique (judge, project)** |
| `score_cells` | one value per criterion | unique (score, criterion) |
| `normalization_runs` | method, parameters, fitted μ and σ, judge offsets, excluded judges, cross-check | append-only |
| `normalized_scores` | per project per run: reviews used, raw mean, adjusted score, SE, raw rank, rank, rank change | |
| `pairwise_comparisons` | judge, winner, loser | |
| `pairwise_runs` | Crowd-BT (EM) ranking with μ, SE, wins, losses, online μ; every judge's estimated reliability | append-only |

## Community

| Table | Holds | Key constraints |
| --- | --- | --- |
| `ballots` | canonical voter key (`user:<id>`, `email:<canonical>`, `link:<nonce>`, `open:<nonce>`), secret token, stored random order, confirmed flag, keyed IP hash | **unique (event, voter key)**, token unique |
| `votes` | ballot ↔ project, units (1, or n for quadratic) | **unique (ballot, project)** |
| `comments` | author, body, hidden flag | |

## Integrations and records

| Table | Holds |
| --- | --- |
| `webhooks` | URL, secret, subscribed actions, active flag |
| `webhook_deliveries` | the outgoing queue: payload, status, attempts, next attempt time, last error |
| `signed_records` | judge records and certificates: canonical payload, Ed25519 signature, key id, revoked flag |
| `import_jobs` | what each import created |
| `audit_events` | append-only, hash-chained log: sequence number, actor and a readable summary, action, resource, payload, keyed IP hash, `prev_hash`, `hash` |

## Import and export (the migration path)

**In:**

- `POST /v1/import` takes a document in the Dogfood `fixtures.json` shape (event, tracks, judges, teams, projects, scores) and creates a new event, with the caller as organizer. The boot seed calls the same importer (`src/api/app/importer.py`) on `spec/fixtures.json`, so what judges see in the demo is exactly what an organizer's import produces.
  - Imported people get unclaimed accounts. A judge claims theirs by accepting an emailed judge invite and choosing a password.
  - External ids are kept in `external_id`, so a second import of the same event is refused rather than duplicated.
  - Scores become one `imported` assignment batch plus reviews. Criteria keys become rubric criteria with equal weights, and the scale is inferred (1–5 on the fixture).
  - Duplicate detection runs at the end of every import.
- `POST /v1/events/{event}/import/projects.csv` bulk-adds projects: `title,summary,team,track,repo_url,members` (members `;`-separated).

**Out:**

- `GET /v1/events/{event}/export.json` returns the event in the same `fixtures.json` shape. `tests/api/test_import_export.py` proves the round trip is lossless: import the official fixture, export it, and compare every record (list order aside).
- `GET /v1/events/{event}/export/{kind}.csv`, one per FIG.01 stage: `registrations`, `teams`, `submissions`, `eligibility`, `judges`, `assignments`, `scores` (one row per review, a column per criterion), `normalization` (parameters and every judge's offset), `results`, `votes` (after publication), `records` (certificates and judge records) and `audit` (with hashes).
- `GET /v1/events/{event}/archive.zip`: all of the above plus `export.json`, every normalization run, the audit chain as JSON lines and the public signing key, with a README. This is the archive somebody can query two years later without running Portal. Archiving an event (`POST /archive`) makes it read-only for everyone.

## Choices worth defending

- **One role per person per event.** It makes "a judge scoring their own team" impossible to represent, instead of something the application has to remember to check. Judges who are also hackers judge a different event.
- **A review is a row with cells, not a JSON blob.** Criterion weights can change after judging starts, and every weighted total is recomputed from the cells in one transaction. Unique (judge, project) makes a double review impossible, however many assignment batches exist.
- **Normalization runs are snapshots.** Results always cite a run. Re-running with different λ never rewrites history, so the organizer can explain exactly which numbers were published.
- **Duplicates are flagged, never deleted.** Deleting data is how a disputed decision becomes impossible to review. A flag with `duplicate_of_id` and a reason keeps the evidence, blocks judging, and can be cleared.
- **The ballot's voter key is canonical.** Uniqueness on (event, canonical key) is what turns "one vote per person" from an application check into a database guarantee. `jane.doe+2@gmail.com` and `janedoe@gmail.com` collide.
- **The audit log is hash-chained.** An organizer can prove the log has not been edited since, without trusting the database administrator.
- **Nothing is derived and stored twice.** Phase comes from dates, team membership from `memberships`, coverage from `scores`. The dashboard is a query, not a cache that can go stale.

## Schema changes

Tables are created at boot with `Base.metadata.create_all`, which is enough for a fresh install. There are no migrations yet. For an upgrade that changes the schema, export each event to JSON, deploy the new version on a fresh database, and re-import. That is the documented path until Alembic migrations are added (see README, limitations).
