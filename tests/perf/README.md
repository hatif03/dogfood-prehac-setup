# Performance and concurrency

Both scripts talk to a running portal over HTTP and use only the standard library.

```bash
# Raise the abuse limits for the run: both scripts register users and vote from one IP.
LOGIN_RATE_LIMIT=100000 VOTE_RATE_LIMIT=100000 COMMENT_RATE_LIMIT=100000 docker compose up -d --build --wait

python3 tests/perf/bench.py .dogfood.toml --projects 2000 --judges 300 --reviews 5 > docs/perf-bench.txt
python3 tests/perf/concurrency.py .dogfood.toml > docs/perf-concurrency.txt

docker compose up -d   # back to the normal limits
```

- `bench.py` imports a synthetic event N times the fixture's size through `POST /v1/import` and times the heavy endpoints (gallery, dashboard, every review, normalization, CSV and JSON exports, audit-chain verification).
- `concurrency.py` fires bursts of simultaneous requests at every path where a race could corrupt state (team creation, team joins against the size cap, draft saves, review saves, ballot creation, quadratic budget, vote tallies) and checks the invariants afterwards, including the audit hash chain.

Results from the reference machine are in [docs/PERFORMANCE.md](../../docs/PERFORMANCE.md).
