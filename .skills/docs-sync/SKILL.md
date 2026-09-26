---
name: docs-sync
description: Updates architecture, data-model, judging, and journal docs in the same change as code. Use after mergeable schema, API, or judging changes, or when writing README/ARCHITECTURE/DATA-MODEL/JUDGING.
---

# Docs sync

Templates: `docs/templates/`. Order: Purpose → Status → Non-goals → Contract → Worked example → Open questions.

## Map

| Change | Also update |
| --- | --- |
| Compose / process shape | ARCHITECTURE.md |
| Tables / import-export | DATA-MODEL.md |
| Assignment / scores / pairwise | JUDGING.md |
| Voting abuse controls | THREAT-MODEL.md |
| Tier claim | `.dogfood.toml` + acceptance report (real suite only) |
| Any of the above | `docs/journal/` stub |

Mark AI drafts `Reviewed: pending`. Do not create root product docs until the portal exists.
