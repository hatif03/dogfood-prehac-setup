# Performance and concurrency

Measured on the reference machine (Windows 11 laptop, Docker Desktop, the stock `docker compose` stack: Postgres 16, Redis, 4 API workers), with the scripts in `tests/perf/`. Raw output: [perf-bench.txt](perf-bench.txt), [perf-concurrency.txt](perf-concurrency.txt).

## Scale

A synthetic event 50 times the fixture: **2 000 projects, 300 judges, 40 tracks, 6 000 participants, 10 000 reviews**, imported through the public `POST /v1/import`, then each endpoint timed 5 times from the client.

| Endpoint | Before | After | What changed |
| --- | ---: | ---: | --- |
| Import the whole event (then a normalization run) | 48.5 s (proxy timed out) | 37.9 s | One query to load every existing person, client-side ids so rows insert without a flush each; web proxy timeout raised to 5 minutes for bulk operations |
| Dashboard (polled every 4 s) | 6 285 ms | **386 ms** | Aggregate queries only; no review, cell or project is loaded as an object |
| All reviews, organizer (5.4 MB) | 19 340 ms | **1 354 ms** | One joined column query plus one query for every cell |
| Normalization run (fit and store) | 67 345 ms | **14 367 ms** | Reviews read as three columns; the Bradley–Terry cross-check solved by Newton's method |
| `scores.csv` | 8 183 ms | **1 588 ms** | Same row query as the listing |
| `results.csv` | 1 586 ms | 1 120 ms | |
| Public gallery, all 2 000 projects (932 KB) | 1 215 ms | 1 612 ms | Unchanged code; one batched query per relationship |
| `export.json`, the whole event (1.7 MB) | 4 947 ms | 4 507 ms | |
| Audit chain verification | 73 ms | 33 ms | |
| Event detail | 40 ms | 67 ms | |

### The one that mattered: Bradley–Terry

Every normalization run fits Bradley–Terry to rank-broken pairs as a cross-check (146 000 pairs at this scale). The textbook MM algorithm (Hunter, 2004) needed thousands of sweeps on the weakly connected comparison graphs that track-scoped judging produces: **160 s at 400 projects**, and it never reached tolerance at 2 000. We replaced it with Newton's method on the same concave objective. Its Hessian is a weighted graph Laplacian, so each step is a Jacobi-preconditioned conjugate-gradient solve in O(pairs), with backtracking. That takes **1.2 s at 400 projects and 11.5 s at 2 000**, and matches MM to 1e-11 on small problems (`tests/api/test_pairwise.py::test_weighted_bt_is_at_the_likelihood_optimum`).

A first version stalled for a different reason: near the optimum, an objective that sums 10⁵ terms changes by less than floating-point rounding, so backtracking rejected every step. It now stops on the Newton decrement and compares objective values with a relative tolerance.

### Headroom

The fixture itself (41 projects, 126 reviews) answers every endpoint in tens of milliseconds. At 50 times the fixture, everything an organizer or judge clicks during an event stays within about 1.5 s. The exceptions are batch actions, which show a spinner: import, normalization and full export. Beyond that, the pure-Python estimators are the ceiling. They are written to be read, and numpy would buy another order of magnitude if an event ever needs it.

## Concurrency

`tests/perf/concurrency.py` releases 24 simultaneous requests at once (a thread barrier) at every path where a race could corrupt state, then checks the invariant. Against the Postgres stack with 4 workers:

| Race | Invariant | Result |
| --- | --- | --- |
| One user clicks "create team" 24 times at once | exactly one team | PASS (1 × 200, 23 × 409) |
| 24 people join a 4-seat team at once | never more than 4 members | PASS |
| Two tabs save the same draft at once | one submission per team, no errors | PASS |
| A judge submits the same review 24 times at once | one review, no errors | PASS |
| One voter opens a ballot 24 times at once | one ballot | PASS |
| 24 quadratic votes of 4 credits against a 9-credit budget | never overspent | PASS (8 of 9) |
| 25 voters vote at once | tally equals the sum of ballots | PASS |
| Everything above | audit hash chain still verifies | PASS (168 entries) |

What makes them hold: unique constraints for "one of" invariants (ballot per voter, review per judge and project, team per person per event, vote per ballot and project), `SELECT … FOR UPDATE` where a check precedes a write (team size, quadratic budget, draft save, review save), an advisory lock for the audit chain, and a 409 for any request that loses a race.

The first run found a real bug: two simultaneous saves of one review took the review's row locks and the audit lock in opposite orders, so Postgres detected a deadlock and two requests returned 500. Locking the assignment row first fixed it, and a deadlock or serialization failure now maps to 409 rather than 500 as a backstop.

## Reproduce

See [tests/perf/README.md](../tests/perf/README.md). Both scripts need the abuse limits raised for the run, because they register users and vote from a single IP.
