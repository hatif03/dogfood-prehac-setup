# Final submission checklist (human)

Reviewed: hatif03 2026-09-28

Before you tag the repo for Dogfood judges:

1. Record the **5-minute demo** using [demo-script.md](demo-script.md). *(video pending)*
2. Done: `Reviewed: hatif03 2026-09-28` on [JUDGING.md](../JUDGING.md), [THREAT-MODEL.md](../THREAT-MODEL.md), and [context/kickoff-diff.md](../context/kickoff-diff.md).
3. Run `.\scripts\verify-submission.ps1` with `docker compose up` on `:8080`.
4. Commit `acceptance-report.txt` and `acceptance-report-extended.txt` if timestamps should match your freeze.
5. Confirm `.dogfood.toml` tier claims match `acceptance-report.txt` (official verifies T1+T2 only).

Optional production trial: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up` with a strong `SESSION_SECRET` in `.env`.
