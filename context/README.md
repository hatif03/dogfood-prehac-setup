# Context layer

Persistent, machine-readable facts for AI sessions. This folder is infrastructure, not a blog.

## How to use

1. Read `AGENTS.md` first.
2. Pull facts from the file that matches the question (figures, scoring, isolation, deliverables).
3. Do not scrape https://dogfoodhack.com/ again unless kickoff files contradict this folder.
4. After official `spec.md` / fixtures / suite land, run `plans/13-kickoff-reconcile.md` and patch these files.

## Trust

Every AI-generated note in this folder is untrusted until a human adds:

```
Reviewed: <name> <YYYY-MM-DD>
```

## Contents

| File | Use when |
| --- | --- |
| [brief.md](brief.md) | Why this product exists |
| [figures.md](figures.md) | FIG.01–04 acceptance implications |
| [scoring.md](scoring.md) | Weighted criteria and bonuses |
| [deliverables.md](deliverables.md) | What must be on disk at submission |
| [fixtures-expectations.md](fixtures-expectations.md) | Edge cases the schema must survive |
| [role-isolation.md](role-isolation.md) | FIG.02 / T2.03 contract |
| [references.md](references.md) | Cited sources (inspiration, not forks) |
| [conversation-log.md](conversation-log.md) | Dated session summaries |
| [examples/](examples/) | Target format for later judge-facing docs |

## Do not put here

Application source, secrets, fake acceptance passes, or timeline pressure. Timeline is ignored by project policy except the kickoff file dependency.
