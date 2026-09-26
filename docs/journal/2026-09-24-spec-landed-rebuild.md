# 2026-09-24: The spec landed, and half our assumptions did not survive

Reviewed: pending

Write Up Quest material. What changed when the real `spec.md`, `fixtures.json` and `run.py` arrived, and why.

## The checker never logs in

We had a login form and cookies. The checker attaches a header it was handed. So the seed now mints five fixed demo session tokens (behind `DEMO_SESSIONS`, default on in compose, documented as "turn off for a real event") and prints them in the spec's format on boot. The same tokens go into `.dogfood.toml`.

## 404 vs 403

Our plan said "a judge curls peer scores and gets 404", so ids cannot be probed. The checker wants 401 or 403 for `peer_scores`. Both are right, for different requests: asking for a peer *by name* (`?judge=jdg_24`) is refused with 403, and asking for a peer's review *by id* answers 404 like a missing row. Documented in ARCHITECTURE.md.

## The fixture broke three schema assumptions

1. **Judges cover two tracks.** `event_roles.track_id` became a `judge_tracks` table.
2. **A team submitted twice** (`prj_41` duplicates `prj_07`: same title, same repo, later timestamp). "One submission per team" was a service-layer rule; the importer now keeps both rows and flags the later one as a duplicate that blocks judging. Deleting it would have destroyed the evidence.
3. **Scores are 1–5, criteria are `functionality`, `quality`, `innovation`.** The rubric got a configurable scale and criteria got stable keys, so import and export round-trip.

## Z-scores were the wrong estimator for this data

See ADR 0002. The short version: track-scoped judges plus two or three reviews each plus a constant rater is exactly the situation per-judge standardization is worst at. The additive offset model wins the simulation by a clear margin, and it reports scores on the 1–5 scale organizers already understand.

## Bugs the tests did not catch

- `EmailStr` rejects `.local` domains as "special-use". Every test used `example.com`, so the seeded `organizer@portal.local` could not sign in through the form. Found while testing the curl walkthrough in docs/API.md, which is a good argument for executing documentation.
- SQLAlchemy's unit of work flushes inserts before deletes, so re-casting a one-person-one-vote ballot (delete the old vote, insert the new one) hit the `(ballot, project)` unique constraint. An explicit flush after the delete fixes it.
- A one-review event reported a standard error of ±0.0000 (no residual degrees of freedom). It now falls back to the fixture's noise level.
- `minio/minio` no longer exists on Docker Hub, so the first real `docker compose up` failed on the pull. The project publishes on `quay.io/minio/minio`; compose now pins `RELEASE.2025-09-07T16-13-09Z` there. "One command" is only as reliable as the least maintained image it pulls, which is an argument for pinning every image.
