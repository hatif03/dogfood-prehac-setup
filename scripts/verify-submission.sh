#!/usr/sh
# Pre-submission gate. Requires docker compose up on :8080.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

curl -sf "http://localhost:8080/v1/events/sample-hack-2026/projects" >/dev/null \
  || { echo "Portal not reachable. Run: docker compose up --build"; exit 1; }

python3 spec/run.py .dogfood.toml > acceptance-report.txt
tail -n 8 acceptance-report.txt

python3 tests/acceptance/extended.py .dogfood.toml > acceptance-report-extended.txt
tail -n 6 acceptance-report-extended.txt

PY="${ROOT}/src/api/.venv/bin/python"
[ -x "$PY" ] || PY="${ROOT}/src/api/.venv/Scripts/python.exe"
[ -x "$PY" ] || { echo "Missing API venv python"; exit 1; }

"$PY" -m pytest tests/api/test_acceptance_paths.py -q
echo "OK — reports updated."
