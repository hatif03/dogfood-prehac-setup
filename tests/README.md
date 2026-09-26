# Tests

| Folder | What | How to run |
| --- | --- | --- |
| `api/` | pytest suite: unit maths, the role-isolation matrix, every fixture record, voting, integrity, the full lifecycle, API-first coverage. In-memory SQLite, no services needed. | `src/api/.venv/Scripts/python -m pytest -q` from the repo root (`bin/` on macOS/Linux) |
| `acceptance/` | `extended.py`: black-box T2–T4 checks against the running portal, standard library only, same style as `spec/run.py` | `python3 tests/acceptance/extended.py .dogfood.toml` |
| `perf/` | `bench.py` (scalability) and `concurrency.py` (race invariants) against the running portal | see `perf/README.md` |

The official checker is `spec/run.py`, unmodified.
