# README

Purpose: what this portal does, how a stranger runs it, what it does not do yet.

Status: template — copy to repo root when compose actually boots a portal.

Non-goals: marketing copy, inflated tier claims.

## Contract

- One command: `docker compose up`
- Seeded with official fixtures
- Honest limits listed
- Tiers claimed only if `acceptance-report.txt` agrees

## What it does

<!-- One paragraph. Operator-facing. -->

## How to run

```bash
docker compose up
```

Then open `http://localhost:...` (fill after compose exists).

Default seeded accounts: <!-- fill from seed; never production secrets -->

## What it does not do yet

<!-- Honest gap list. Example: "T3 comments land; quadratic voting is off by default." -->

## Tiers claimed

See `.dogfood.toml` and `acceptance-report.txt`. If they disagree, the report wins.

## License

MIT. See `LICENSE`.

## Open questions

- [ ] Exact compose ports
- [ ] Seed account table
