# Kickoff diff

Reviewed: hatif03 2026-09-28

## Files received

- `spec/spec.md` — organiser narrative (aligned with `official-spec/spec.md` prose)
- `spec/fixtures.json` — SHA256-identical to `official-spec/fixtures.json`
- `spec/run.py` — SHA256-identical to `official-spec/run.py`
- Suite how to run: `python spec/run.py .dogfood.toml` (portal on `:8080`); extended: `python tests/acceptance/extended.py .dogfood.toml`

## Contradictions vs context/

| Our assumption | Official | Action |
| --- | --- | --- |
| Built against public brief before kickoff | Same files now in `spec/` + `official-spec/` | No importer shape change required |
| Peer scores by query ref → 403 | `run.py` T2 peer check | Implemented; frozen |
| T3/T4 in `.dogfood.toml` | `run.py` does not verify T3/T4 | Extended suite + pytest; README honest |

## Suite ID map

| Checker (`run.py`) | Our coverage |
| --- | --- |
| T1 gallery public | `test_acceptance_paths.py`, fixture exhaustive |
| T1 fixture titles | `test_acceptance_paths.py` |
| T1 closed POST | `test_acceptance_paths.py`, `test_deadline.py` |
| T2 own scores | `test_acceptance_paths.py`, isolation matrix |
| T2 peer scores | `test_acceptance_paths.py`, `test_fixture_exhaustive.py` (30 judges) |
| T2 participant blocked | `test_acceptance_paths.py` |
| T2 CSV export | `test_acceptance_paths.py`, `extended.py` T4 |

Extended (`tests/acceptance/extended.py`): T2 extras, T3 voting/abuse, T4 exports/webhooks/API.

## Schema changes required

None for organiser fixture alignment. Later product work (email verification, Alembic) is documented in DATA-MODEL.md when merged.

## Still banned

Hosted services, frontend-only RBAC, rewriting Gavel/JunctionApp/etc., fake `acceptance-report.txt`.
