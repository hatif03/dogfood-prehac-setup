---
name: acceptance-gate
description: Runs the official acceptance suite and aligns tier claims. Use when claiming T1-T4, editing .dogfood.toml, or producing acceptance-report.txt.
---

# Acceptance gate

The official suite is unpublished until kickoff. Until then, do not invent passes.

## After the suite exists

1. Run it against `docker compose up` locally.
2. Commit stdout as `acceptance-report.txt`.
3. Set `.dogfood.toml` booleans to match the report, not the README.
4. If README claims T3 and the report is T2, the report wins — fix the README.

Never hand-write a passing report. Never skip T2.03 curl isolation because the UI looks right.
