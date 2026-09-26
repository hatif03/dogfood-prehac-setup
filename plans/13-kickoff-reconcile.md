# 13 — Kickoff reconcile

## Goal

When official `spec.md`, `fixtures.json`, and the acceptance suite appear, diff them against this repo's `context/` and `plans/` **before writing application code**. Timeline is otherwise ignored; this file dependency is not.

## Score impact

Prevents building the wrong field set or claiming the wrong T2.03 id. Protects 40% (suite alignment) and honesty.

## Gate (first product-session action)

A written diff exists (use the template below) in `docs/journal/` or `context/kickoff-diff.md`.

**Do not claim tiers until that diff is written.** Application code may already exist (ADR 0001); this plan is then a spec-vs-code diff, not a freeze on `src/`.

Depends on: [00-north-star.md](00-north-star.md) plus organizer files.

## In scope

- Map suite test IDs onto plans 03–06
- Patch `context/fixtures-expectations.md` with real edge cases
- Patch submission fields if spec.md ≠ Devpost-stable set
- Patch role names if they differ
- Record stack still allowed
- Update `.dogfood.toml` comments with real IDs; keep booleans false

## Out of scope

- Coding while "quickly looking" at fixtures
- Deleting plans instead of annotating contradictions
- Inventing suite output

## Data-model

May change plan 02. Note breaking changes explicitly.

## API/UI

None in this plan.

## Acceptance hypotheses

The suite **is** the hypothesis. After reconcile, implementation follows suite IDs, not our guessed `T2.xx` labels.

## Docs to update

`context/*` that contradict spec.md. `conversation-log.md` entry. This plan's checklist.

## Bonus linkage

If the suite scores bonuses, map them here. If not, bonuses remain judge-read artifacts.

## Diff template

```markdown
# Kickoff diff

Reviewed: pending

## Files received
- spec.md version:
- fixtures.json shape:
- suite how to run:

## Contradictions vs context/
| Our assumption | Official | Action |
| --- | --- | --- |

## Suite ID map
| Suite ID | Plan |
| --- | --- |

## Schema changes required
-

## Still banned
- hosted services, frontend-only RBAC, platform rewrites
```
