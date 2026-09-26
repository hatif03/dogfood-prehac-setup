# Documentation templates

Judge-facing product docs are **not** created at repo root until the portal exists. Copy a template when the matching plan says to fill it.

Shared skeleton (keep this order):

1. Purpose
2. Status
3. Non-goals
4. Contract
5. Worked example
6. Open questions

`Reviewed: <name> <date>` is required before treating an AI draft as true.

## Files

| Template | Becomes |
| --- | --- |
| [README.product.md](README.product.md) | root `README.md` (replace the planning README at submission, or keep both sections) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | root `ARCHITECTURE.md` |
| [DATA-MODEL.md](DATA-MODEL.md) | root `DATA-MODEL.md` |
| [JUDGING.md](JUDGING.md) | root `JUDGING.md` |
| [THREAT-MODEL.md](THREAT-MODEL.md) | root `THREAT-MODEL.md` |
| [ADR.md](ADR.md) | `docs/decisions/NNNN-slug.md` |
| [SESSION-SUMMARY.md](SESSION-SUMMARY.md) | `docs/journal/YYYY-MM-DD-slug.md` |
| [CHANGELOG.md](CHANGELOG.md) | root `CHANGELOG.md` |
| [dogfood.toml](dogfood.toml) | root `.dogfood.toml` |
| [acceptance-report.txt](acceptance-report.txt) | root `acceptance-report.txt` (suite stdout only) |
