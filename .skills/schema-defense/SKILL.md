---
name: schema-defense
description: Keeps the schema explainable and round-trippable. Use when writing migrations, models, import/export, or DATA-MODEL.md.
---

# Schema defense

Read `plans/02-data-model-and-pipeline.md` and `context/fixtures-expectations.md`.

## Rules

- One sentence per table in DATA-MODEL.md.
- FIG.01 all ten stages have a home.
- Uniqueness: invite tokens; one active submission per team per event; one assignment per judge×project×batch.
- Survive constant rater, incomplete batch, duplicate entry.
- Import/export paths exist or are listed as T4 work, not forgotten columns.
- A human on the team must be able to defend the schema in writing (hackathon rule).
