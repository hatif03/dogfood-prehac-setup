# Five-minute demo script (record when ready)

Shot list for a lifecycle video per [context/deliverables.md](../context/deliverables.md). Use **Sample Hack 2026** for fixture integrity and **Playground Hack** for an open submission flow. Demo passwords are `password`; acceptance cookies are in the boot log and [README](../README.md).

| Minute | What to show | Where | Proves |
| --- | --- | --- | --- |
| 0–1 | `docker compose up --build`, portal at :8080, boot log with demo session cookies | Terminal + browser | One command, seeded fixture |
| 1–2 | Public gallery, search/filter | `/events/sample-hack-2026` | T1 gallery (40 projects, no duplicate) |
| 2 | Sign in as participant; try `POST` save on Sample Hack (or UI) → **403** closed deadline | API docs or curl | T1 deadline enforced server-side |
| 2 | Sign in as **judge_b** (`iva.petrova@example.org`); curl peer scores → **403** | See README “Verify judging isolation” | T2 peer isolation |
| 3 | Sign in as organizer; **Organize → Overview** | `GET /dashboard` in network tab optional | `constant_raters` (jdg_07), `duplicates`, `coverage.histogram` |
| 3–4 | **Results**: normalization narrative, rank chart | Organize → Results | Bonus / [JUDGING.md](../JUDGING.md) |
| 4–5 | **Playground Hack**: create team, invite, draft, submit, assign judges, score, publish | `/events/playground` | Full lifecycle ([test_lifecycle.py](../tests/api/test_lifecycle.py)) |
| Optional | Mailpit @ :8025; quadratic email-gated vote on Sample Hack | Voting link from email | T3 (extended suite, not run.py) |

## Curl beats (copy-paste)

Peer score check (matches `spec/run.py`):

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Cookie: portal_session=demo_jdg_b_44de3e" \
  "http://localhost:8080/v1/events/sample-hack-2026/scores?judge=jdg_24"
# expect 403
```

Pre-freeze verification:

```bash
./scripts/verify-submission.ps1   # Windows
./scripts/verify-submission.sh    # macOS/Linux
```

## Talking points

- Role checks live in the API; the UI only reflects them.
- Official checker: 7/7, **T1+T2 verified**; T3/T4 via [extended.py](../tests/acceptance/extended.py).
- Normalization and pairwise proofs are in `docs/` (regenerated before submit).

Reviewed: (add name and date before you publish the video)
