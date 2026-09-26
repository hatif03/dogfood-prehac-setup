---
name: role-isolation
description: Enforces FIG.02 / T2.03 backend role isolation with a curl matrix. Use when touching auth, sessions, scores, assignments, exports, votes, or any list/get endpoint.
---

# Role isolation

Read `context/role-isolation.md`. Filter in the service layer.

## Matrix

Visitor/participant: no scores, no aggregates, no audit.
Judge: own scores only; never peer, never other track, never aggregate, never audit.
Organizer/admin: all columns permitted.

## Per-endpoint checklist

For each new or changed endpoint:

1. Who is allowed?
2. What 404 vs 403?
3. Write tests or a curl script for: visitor, participant, judge A, judge B, other-track judge, organizer.
4. Exports obey the same rules.

## Fail

A hidden button with a working URL is a failed T2.03.
