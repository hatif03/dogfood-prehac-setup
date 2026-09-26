# Role isolation contract

Source: FIG.02. Verified by acceptance suite **T2.03**.

Denied at the API, not in the UI. If a judge can `curl` another judge's scores, isolation failed.

## Matrix

| Actor | Own scores | Peer scores | Other track | Aggregate | Audit log |
| --- | --- | --- | --- | --- | --- |
| Visitor | denied | denied | denied | denied | denied |
| Participant | denied | denied | denied | denied | denied |
| Judge | permitted | denied | denied | denied | denied |
| Organizer | permitted | permitted | permitted | permitted | permitted |
| Admin | permitted | permitted | permitted | permitted | permitted |

Visitor is unauthenticated. Participant is authenticated with no judge/organizer/admin role on that event.

## Enforcement rules

1. Filter in the **service layer** on every list, get, export, and websocket. Do not rely on omitting a button.
2. A track-scoped judge never receives other-track projects, scores, or aggregates.
3. 404 vs 403: prefer 404 for objects the caller must not know exist (peer ballots); 403 for authenticated-but-wrong-role on a known collection.
4. Organizer live dashboard (who has not started) is organizer/admin only.
5. CSV exports of scores are organizer/admin only except a judge exporting **their own** rows.
6. Public gallery may show projects, never live judging totals, while results are hidden.

## Curl is the test

For each score endpoint, the `role-isolation` skill requires a curl matrix: visitor, participant, judge A, judge B, other-track judge, organizer. Record expected status codes in tests.

## Roles we implement

`visitor`, `participant`, `judge`, `organizer`, `admin` — event-scoped except visitor and (optionally) platform admin.
