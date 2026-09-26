# 03 — T1 Core

## Goal

The floor. A submission that misses T1 is not judged. Auth, roles, events, teams, submissions, deadlines, public gallery.

## Score impact

40% gate. Unlocks all later tiers. Adoptability: stranger can walk the happy path.

## Gate (must be true before plan 04)

A stranger can: register, be assigned a role, create or join via invite link, submit a draft, edit until deadline, fail to submit after deadline **via API**, search/filter the gallery.

Depends on: [02-data-model-and-pipeline.md](02-data-model-and-pipeline.md).

## In scope

- Authentication and sessions (cookie + Argon2)
- Roles: visitor, participant, judge, organizer, admin
- Event creation: configurable dates, tracks, prizes
- Team formation by invite link
- Project submission with draft-and-edit until deadline
- Deadline enforcement that **holds** on the server
- Public gallery with search and filter
- Submission field set: name, tagline, long description, thumbnail, image gallery, hosted demo video URL, repository URL, live link, tech tags, track, organizer-defined custom questions

## Out of scope

- Judging UI (plan 04)
- Community votes (plan 05)
- Certificates (plan 06)
- Pretty mockups without persistence

## Data-model

`users`, `sessions`, `event_roles`, `events`, `tracks`, `prizes`, `custom_questions`, `teams`, `memberships`, `invite_links`, `submissions`, `submission_assets`, `custom_answers`

## API/UI

**API (minimum):** register, login, logout, me; event CRUD (organizer); invite accept; team CRUD; submission draft/update/submit; gallery list/search/filter; asset upload to MinIO via API.

**UI:** register/login; organizer event settings; team invite copy; submission form; gallery.

## Acceptance hypotheses

- Unauthenticated gallery list works
- POST submission after `submissions_deadline` → 4xx
- Invite token joins team
- Custom question answers persist
- Thumbnail stored locally (MinIO), not a cloud CDN

## Docs to update

Root `README.md` from `docs/templates/README.product.md` (how to run + seeded users). Journal T1 limits honestly.

## Bonus linkage

Every T1 UI action must be an API route so plan 10 is not a rewrite.
